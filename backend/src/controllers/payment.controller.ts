import { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { paymentService } from '../services/payment.service';
import { bookingService } from '../services/booking.service';
import { cancellationService } from '../services/cancellation.service';
import { notificationService } from '../services/notification.service';
import { sendResponse, sendError } from '../utils/response';
import { moneyEqual, guardAmount } from '../utils/money';
import { AuthRequest } from '../middleware/auth.middleware';

/** Notify both parties once a booking has been paid. */
async function notifyBookingPaid(bookingId: string, customerId: string, workerId: string, totalAmount: number) {
  await notificationService.sendPushNotification(
    customerId, 'Payment Successful',
    `Your payment of ₹${Number(totalAmount).toLocaleString('en-IN')} for booking was successful.`,
    'payment_success', { bookingId },
  );
  await notificationService.sendPushNotification(
    workerId, 'Payment Received',
    `You received ₹${Number(totalAmount).toLocaleString('en-IN')} for booking.`,
    'payment_received', { bookingId },
  );
}

export const paymentController = {
  createOrder: async (req: AuthRequest, res: Response) => {
    try {
      const order = await paymentService.createOrder(req.body.bookingId, req.body.amount, req.user!.userId);
      sendResponse(res, 200, order);
    } catch (e: any) {
      sendError(res, 500, e.message || 'Order creation failed');
    }
  },

  verifyPayment: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId, orderId } = req.body;
      if (!bookingId || !orderId) return sendError(res, 400, 'Booking ID and order ID are required');

      // Ownership: only the customer of the booking may verify its payment.
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { totalAmount: true, customerId: true, workerId: true },
      });
      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== req.user!.userId) return sendError(res, 403, 'Unauthorized');

      // Real path: trust only Cashfree — order status, amount AND ownership must
      // match. Prevents under-payment and order-reuse (borrowed orderIds).
      const { transitioned } = await paymentService.verifyPayment(bookingId, orderId, booking.totalAmount, req.user!.userId);

      // Idempotent success: a duplicate/concurrent verify of the same booking
      // returns success WITHOUT re-running the payout, fee collection, or the
      // two push notifications below.
      if (transitioned) {
        await bookingService.processPayout(bookingId);
        await cancellationService.collectPendingFee(booking.customerId, bookingId, booking.totalAmount);
        await notifyBookingPaid(bookingId, booking.customerId, booking.workerId, booking.totalAmount);
      }

      sendResponse(res, 200, { success: true });
    } catch (e: any) {
      sendError(res, 500, e.message || 'Verification failed');
    }
  },

  payViaWallet: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId, amount } = req.body;
      const userId = req.user!.userId;

      if (!bookingId || !amount) {
        return sendError(res, 400, 'Booking ID and amount are required');
      }

      // Check if booking exists and belongs to the customer
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, customerId: true, workerId: true, paymentStatus: true, totalAmount: true }
      });

      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== userId) return sendError(res, 403, 'Unauthorized');
      if (booking.paymentStatus === 'PAID') return sendError(res, 400, 'Booking is already paid');
      if (!moneyEqual(booking.totalAmount, amount)) return sendError(res, 400, 'Payment amount does not match booking total');

      // Fast pre-flight for a clean UX error; the authoritative guard is the
      // atomic conditional debit inside the transaction below.
      const customer = await prisma.customerProfile.findUnique({
        where: { userId },
        select: { id: true, walletBalance: true },
      });

      if (!customer) return sendError(res, 404, 'Customer profile not found');
      if (customer.walletBalance < amount) return sendError(res, 400, 'Insufficient wallet balance');

      // ONE atomic transaction, exception-based so any failure rolls everything
      // back:
      //   1. Claim the booking with a CONDITIONAL update that only a not-paid
      //      booking matches. Two concurrent payViaWallet requests can never
      //      both pass — the loser matches 0 rows, throws, and its debit rolls
      //      back. (The old code checked paymentStatus OUTSIDE the tx, so both
      //      requests could double-pay.)
      //   2. Atomic conditional debit of the wallet.
      //   3. Ledger row + PAID transition.
      let walletBalanceAfter: number;
      try {
        walletBalanceAfter = await prisma.$transaction(async (tx) => {
          const claim = await tx.booking.updateMany({
            where: { id: bookingId, paymentStatus: { not: 'PAID' } },
            data: { paymentStatus: 'PAID', paymentRefId: `WALLET_${bookingId}` },
          });
          if (claim.count === 0) throw new Error('ALREADY_PAID');

          const debit = await tx.customerProfile.updateMany({
            where: { id: customer.id, walletBalance: { gte: amount } },
            data: { walletBalance: { decrement: amount } },
          });
          if (debit.count === 0) throw new Error('INSUFFICIENT');

          await tx.transaction.create({
            data: {
              userId,
              type: 'BOOKING_PAYMENT',
              amount: -amount,
              description: `Payment for booking ${bookingId.slice(-6)} via Wallet`,
              status: 'completed',
              reference: bookingId
            }
          });

          const updated = await tx.customerProfile.findUnique({
            where: { id: customer.id },
            select: { walletBalance: true },
          });
          return updated?.walletBalance ?? 0;
        });
      } catch (e: any) {
        if (e?.message === 'ALREADY_PAID') return sendError(res, 400, 'Booking is already paid');
        if (e?.message === 'INSUFFICIENT') return sendError(res, 400, 'Insufficient wallet balance');
        throw e;
      }

      // Process worker payout and fee collection outside transaction
      await bookingService.processPayout(bookingId);
      await cancellationService.collectPendingFee(userId, bookingId, booking.totalAmount);
      await notifyBookingPaid(bookingId, userId, booking.workerId, booking.totalAmount);

      sendResponse(res, 200, { success: true, walletBalance: walletBalanceAfter });
    } catch (e: any) {
      sendError(res, 500, e.message || 'Wallet payment failed');
    }
  },

  callback: async (req: any, res: Response) => {
    const { order_id } = req.query;
    if (order_id) {
      res.redirect(`kaamwala://payment/success?order_id=${order_id}`);
    } else {
      res.redirect('kaamwala://payment/failed');
    }
  },

  getTransactions: async (req: AuthRequest, res: Response) => {
    try {
      const transactions = await prisma.transaction.findMany({
        where: { userId: req.user!.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      sendResponse(res, 200, transactions);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  addMoney: async (req: AuthRequest, res: Response) => {
    try {
      const { amount } = req.body;
      const amt = guardAmount(amount);
      if (amt === null) return sendError(res, 400, 'Invalid amount');

      const userId = req.user!.userId;
      const orderIdStr = `wallet_topup_${userId}_${Date.now()}`;

      const order = await paymentService.createOrder(orderIdStr, amt, userId);
      sendResponse(res, 200, order);
    } catch (e: any) {
      sendError(res, 500, e.message || 'Failed to create topup order');
    }
  },

  verifyWalletTopup: async (req: AuthRequest, res: Response) => {
    try {
      const { orderId } = req.body;
      if (!orderId) return sendError(res, 400, 'orderId is required');

      const userId = req.user!.userId;

      const verified = await paymentService.verifyWalletOrder(orderId, userId);
      const amount = Number(verified.amount);

      // Atomic credit + ledger, guarded by a UNIQUE idempotencyKey
      // (`wallet_topup:<orderId>`). The ledger row is created FIRST inside the
      // transaction, so a concurrent retry of the same order hits the unique
      // constraint (P2002), the transaction rolls back, and the wallet is never
      // credited twice — even under parallel requests. A missing profile THROWS
      // so the ledger row rolls back too — the old `return null` inside the
      // transaction COMMITTED the ledger while skipping the credit, recording
      // money that was never added.
      try {
        const walletBalance = await prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              userId,
              type: 'WALLET_CREDIT',
              amount,
              description: 'Added money to wallet',
              status: 'completed',
              reference: orderId,
              idempotencyKey: `wallet_topup:${orderId}`,
            },
          });

          if (req.user!.role === 'WORKER') {
            const worker = await tx.workerProfile.findUnique({ where: { userId }, select: { isFrozen: true } });
            if (!worker) throw new Error('PROFILE_NOT_FOUND');
            const updated = await tx.workerProfile.update({
              where: { userId },
              data: {
                walletBalance: { increment: amount },
                // A top-up is always >= ₹0, so a frozen wallet is always unfrozen here.
                ...(worker.isFrozen ? { isFrozen: false } : {}),
              },
            });
            return updated.walletBalance;
          }
          const customer = await tx.customerProfile.findUnique({ where: { userId }, select: { id: true } });
          if (!customer) throw new Error('PROFILE_NOT_FOUND');
          const updated = await tx.customerProfile.update({
            where: { userId },
            data: { walletBalance: { increment: amount } },
          });
          return updated.walletBalance;
        });

        await notificationService.sendPushNotification(
          userId, 'Wallet Credited',
          `₹${Number(amount).toLocaleString('en-IN')} has been added to your wallet.`,
          'wallet_credited', { amount },
        );
        sendResponse(res, 200, { success: true, walletBalance });
      } catch (e: any) {
        if (e?.message === 'PROFILE_NOT_FOUND') return sendError(res, 404, 'Profile not found');
        if (e?.code === 'P2002') {
          return sendError(res, 400, 'This payment has already been processed');
        }
        throw e;
      }
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  withdraw: async (req: AuthRequest, res: Response) => {
    try {
      const { amount, method = 'UPI', upiId, bankAccount, ifscCode, bankName, accountHolderName } = req.body;
      const amt = guardAmount(amount);
      if (amt === null) return sendError(res, 400, 'Invalid amount');
      if (amt < 100) return sendError(res, 400, 'Minimum withdrawal is ₹100');

      let description = '';
      if (method === 'UPI') {
        if (!upiId) return sendError(res, 400, 'UPI ID required');
        description = `Withdrawal to UPI ${upiId}`;
      } else if (method === 'BANK') {
        if (!bankAccount || !ifscCode || !bankName || !accountHolderName) {
          return sendError(res, 400, 'Complete bank details required');
        }
        description = `Withdrawal to Bank ${bankName} (${bankAccount})`;
      } else {
        return sendError(res, 400, 'Invalid withdrawal method');
      }

      const { userId, role } = req.user!;

      // Worker earnings withdrawals have their own endpoint; this route is the
      // CUSTOMER wallet withdrawal.
      if (role === 'WORKER') {
        return sendError(res, 400, 'Use the worker earnings withdrawal endpoint');
      }

      // Customer withdrawals go through the SAME WithdrawalRequest pipeline as
      // worker withdrawals: atomic debit + pending ledger row now, admin
      // approval + REAL Cashfree payout later (admin.service.processWithdrawal).
      // The old implementation debited the wallet and wrote a "completed" ledger
      // row WITHOUT ever paying out — the customer lost money for nothing.
      const result = await prisma.$transaction(async (tx) => {
        const customer = await tx.customerProfile.findUnique({
          where: { userId },
          select: { id: true, walletBalance: true },
        });
        if (!customer) return { ok: false as const, code: 404, error: 'Profile not found' };

        // Atomic conditional debit — safe against concurrent withdrawals.
        const debit = await tx.customerProfile.updateMany({
          where: { id: customer.id, walletBalance: { gte: amt } },
          data: { walletBalance: { decrement: amt } },
        });
        if (debit.count === 0) return { ok: false as const, code: 400, error: 'Insufficient balance' };

        const withdrawal = await tx.withdrawalRequest.create({
          data: {
            customerProfileId: customer.id,
            amount: amt,
            method,
            upiId: method === 'UPI' ? upiId : null,
            bankAccount: method === 'BANK' ? bankAccount : null,
            ifscCode: method === 'BANK' ? ifscCode : null,
            bankName: method === 'BANK' ? bankName : null,
            accountHolderName: method === 'BANK' ? accountHolderName : null,
            status: 'pending',
          },
        });

        await tx.transaction.create({
          data: {
            userId,
            type: 'WALLET_WITHDRAWAL',
            amount: -amt,
            description,
            status: 'pending',
            idempotencyKey: `withdraw:${withdrawal.id}`,
          },
        });

        const updated = await tx.customerProfile.findUnique({
          where: { id: customer.id },
          select: { walletBalance: true },
        });
        return { ok: true as const, withdrawal, walletBalance: updated?.walletBalance ?? 0 };
      });

      if (!result.ok) return sendError(res, result.code, result.error);

      await notificationService.sendPushNotification(
        userId, 'Withdrawal Initiated',
        `Your withdrawal of ₹${amt.toLocaleString('en-IN')} has been submitted and will be processed shortly.`,
        'withdrawal', { amount: amt, method },
      );

      sendResponse(res, 200, { withdrawalId: result.withdrawal.id, walletBalance: result.walletBalance });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};

/**
 * Cashfree payment webhook — reconciles bookings that were paid but never
 * verified by the app (app crashed / was backgrounded mid-payment). Signature is
 * verified against `CF_WEBHOOK_SECRET` and FAILS CLOSED: no secret → 503, bad
 * signature → 401 — nothing is processed without a valid signature.
 *
 * Only booking payments are reconciled here (createOrder stamps
 * `booking.paymentOrderId`, so a PAID webhook maps back to a booking). Wallet
 * top-ups and subscriptions are still reconciled by the app's own /verify call
 * at the payment screen.
 */
export async function paymentWebhook(req: any, res: Response) {
  const secret = env.CF_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature headers' });
  }

  // Cashfree v2 webhook signature: base64(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)).
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64');
  const provided = String(signature);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    logger.warn('[webhook] Signature verification failed — rejecting event');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  const type = event?.type;
  const order = event?.data?.order || {};
  if (type !== 'PAYMENT_SUCCESS_WEBHOOK' && type !== 'PAYMENT_SUCCESS') {
    // Acknowledge every other event so Cashfree stops retrying.
    return res.status(200).json({ received: true });
  }
  if (order.order_status !== 'PAID' || !order.order_id) {
    return res.status(200).json({ received: true });
  }
  const orderId = order.order_id;

  try {
    const booking = await prisma.booking.findFirst({
      where: { paymentOrderId: orderId },
      select: { id: true, totalAmount: true, customerId: true, workerId: true, paymentStatus: true },
    });
    if (!booking) {
      // Not a booking order (top-up / subscription) — those reconcile via the
      // app's own verify call.
      logger.info('[webhook] Order does not map to a booking — ignoring', { orderId });
      return res.status(200).json({ received: true });
    }
    if (booking.paymentStatus === 'PAID') {
      return res.status(200).json({ received: true, alreadyProcessed: true });
    }

    // The webhook body is never authoritative on its own: re-check the order
    // with Cashfree (status + amount + ownership) exactly like /verify, then
    // transition idempotently. `transitioned` guards against a concurrent
    // /verify that already moved the booking to PAID.
    const { transitioned } = await paymentService.verifyPayment(booking.id, orderId, booking.totalAmount, booking.customerId);
    if (transitioned) {
      await bookingService.processPayout(booking.id);
      await cancellationService.collectPendingFee(booking.customerId, booking.id, booking.totalAmount);
      await notifyBookingPaid(booking.id, booking.customerId, booking.workerId, booking.totalAmount);
      logger.info('[webhook] Booking payment reconciled', { bookingId: booking.id, orderId });
    }
    return res.status(200).json({ received: true, reconciled: true });
  } catch (e: any) {
    logger.error('[webhook] Reconciliation failed', { orderId, error: e?.message });
    // Acknowledge so Cashfree doesn't retry forever; the app's /verify path
    // remains the source of truth and will settle the booking.
    return res.status(200).json({ received: true, reconciled: false });
  }
}
