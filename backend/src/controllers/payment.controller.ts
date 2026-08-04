import { Response } from 'express';
import { prisma } from '../config/prisma';
import { paymentService } from '../services/payment.service';
import { bookingService } from '../services/booking.service';
import { cancellationService } from '../services/cancellation.service';
import { notificationService } from '../services/notification.service';
import { sendResponse, sendError } from '../utils/response';
import { moneyEqual } from '../utils/money';
import { AuthRequest } from '../middleware/auth.middleware';
import { devBackdoorsEnabled } from '../config/env';

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
      const { bookingId, orderId, isMock } = req.body;
      if (!bookingId || !orderId) return sendError(res, 400, 'Booking ID and order ID are required');

      // Ownership: only the customer of the booking may verify its payment.
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { totalAmount: true, customerId: true, workerId: true },
      });
      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== req.user!.userId) return sendError(res, 403, 'Unauthorized');

      // Mock path is a dev convenience (Expo Go has no native SDK) — only active
      // when ENABLE_DEV_BACKDOORS=true is explicitly set; never in production.
      if (devBackdoorsEnabled && (isMock || (orderId && orderId.startsWith('mock_')))) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: { paymentStatus: 'PAID', paymentRefId: orderId },
        });

        await bookingService.processPayout(bookingId);
        await cancellationService.collectPendingFee(booking.customerId, bookingId, booking.totalAmount);
        await notifyBookingPaid(bookingId, booking.customerId, booking.workerId, booking.totalAmount);

        return sendResponse(res, 200, { success: true, mock: true });
      }

      // Real path: trust only Cashfree — order status, amount AND ownership must
      // match. Prevents under-payment and order-reuse (borrowed orderIds).
      await paymentService.verifyPayment(bookingId, orderId, booking.totalAmount, req.user!.userId);
      await bookingService.processPayout(bookingId);
      await cancellationService.collectPendingFee(booking.customerId, bookingId, booking.totalAmount);
      await notifyBookingPaid(bookingId, booking.customerId, booking.workerId, booking.totalAmount);

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

      // Check customer wallet balance
      const customer = await prisma.customerProfile.findUnique({
        where: { userId },
        select: { id: true, walletBalance: true },
      });

      if (!customer) return sendError(res, 404, 'Customer profile not found');
      if (customer.walletBalance < amount) return sendError(res, 400, 'Insufficient wallet balance');

      // Perform transaction with an ATOMIC conditional debit (TOCTOU fix) — two
      // concurrent payments can never both pass the balance check and overdraw.
      const paid = await prisma.$transaction(async (tx) => {
        const debit = await tx.customerProfile.updateMany({
          where: { id: customer.id, walletBalance: { gte: amount } },
          data: { walletBalance: { decrement: amount } },
        });
        if (debit.count === 0) return false;

        // Record transaction
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

        // Update booking status
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: 'PAID',
            paymentRefId: `WALLET_${Date.now()}`
          }
        });
        return true;
      });

      if (!paid) return sendError(res, 400, 'Insufficient wallet balance');

      // Process worker payout and fee collection outside transaction
      await bookingService.processPayout(bookingId);
      await cancellationService.collectPendingFee(userId, bookingId, booking.totalAmount);
      await notifyBookingPaid(bookingId, userId, booking.workerId, booking.totalAmount);

      sendResponse(res, 200, { success: true });
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
      if (!amount || amount < 1) return sendError(res, 400, 'Invalid amount');

      const userId = req.user!.userId;
      const orderIdStr = `wallet_topup_${userId}_${Date.now()}`;

      const order = await paymentService.createOrder(orderIdStr, amount, userId);
      sendResponse(res, 200, order);
    } catch (e: any) {
      sendError(res, 500, e.message || 'Failed to create topup order');
    }
  },

  verifyWalletTopup: async (req: AuthRequest, res: Response) => {
    try {
      const { orderId, isMock, amount: requestedAmount } = req.body;
      if (!orderId) return sendError(res, 400, 'orderId is required');

      const userId = req.user!.userId;

      // Verify payment with Cashfree. The mock path (Expo Go dev testing, where
      // the native SDK can't run) credits the client-declared amount; the real
      // path trusts only Cashfree's order status + amount.
      // The mock path is dev-only — never usable in production.
      let amount: number;
      if (devBackdoorsEnabled && isMock) {
        amount = Number(requestedAmount);
        if (!amount || amount < 1) return sendError(res, 400, 'Invalid amount');
      } else {
        const verified = await paymentService.verifyWalletOrder(orderId, userId);
        amount = Number(verified.amount);
      }

      // Atomic credit + ledger, guarded by a UNIQUE idempotencyKey
      // (`wallet_topup:<orderId>`). The ledger row is created FIRST inside the
      // transaction, so a concurrent retry of the same order hits the unique
      // constraint (P2002), the transaction rolls back, and the wallet is never
      // credited twice — even under parallel requests.
      try {
        const result = await prisma.$transaction(async (tx) => {
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
            const worker = await tx.workerProfile.findUnique({ where: { userId } });
            if (!worker) return null;
            const newBalance = (worker.walletBalance || 0) + amount;
            const updated = await tx.workerProfile.update({
              where: { userId },
              data: {
                walletBalance: { increment: amount },
                ...(newBalance >= 0 && worker.isFrozen ? { isFrozen: false } : {}),
              },
            });
            return updated.walletBalance;
          }
          const customer = await tx.customerProfile.findUnique({ where: { userId } });
          if (!customer) return null;
          const updated = await tx.customerProfile.update({
            where: { userId },
            data: { walletBalance: { increment: amount } },
          });
          return updated.walletBalance;
        });

        if (result === null) return sendError(res, 404, 'Profile not found');
        await notificationService.sendPushNotification(
          userId, 'Wallet Credited',
          `₹${Number(amount).toLocaleString('en-IN')} has been added to your wallet.`,
          'wallet_credited', { amount },
        );
        sendResponse(res, 200, { success: true, walletBalance: result });
      } catch (e: any) {
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
      if (!amount || amount < 1) return sendError(res, 400, 'Invalid amount');

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
      let walletBalance = 0;

      // Role-aware wallet: debit the wallet of the user's actual role. The old
      // "worker-first, fall back to customer" order picked the wrong wallet for
      // any account holding both profile rows (e.g. dual/dev accounts) and
      // returned "Insufficient balance" against an empty worker wallet even
      // when the customer wallet had funds.
      const isWorker = role === 'WORKER';
      if (isWorker) {
        const worker = await prisma.workerProfile.findUnique({
          where: { userId },
          select: { walletBalance: true, isFrozen: true, isBanned: true, isPermanentlyBanned: true },
        });
        if (!worker) return sendError(res, 404, 'Profile not found');
        if (worker.isBanned || worker.isPermanentlyBanned) {
          return sendError(res, 403, 'Your account is banned and cannot withdraw funds');
        }
        if (worker.isFrozen || (worker.walletBalance ?? 0) < 0) {
          return sendError(res, 403, 'Your account is frozen due to unpaid penalties');
        }
        if ((worker.walletBalance || 0) < amount) return sendError(res, 400, 'Insufficient balance');
      } else {
        const customer = await prisma.customerProfile.findUnique({
          where: { userId },
          select: { walletBalance: true },
        });
        if (!customer) return sendError(res, 404, 'Profile not found');
        if ((customer.walletBalance || 0) < amount) return sendError(res, 400, 'Insufficient balance');
      }

      // Atomic conditional decrement — safe against concurrent withdrawals
      const result = isWorker
        ? await prisma.workerProfile.updateMany({
            where: { userId, walletBalance: { gte: amount } },
            data: { walletBalance: { decrement: amount } },
          })
        : await prisma.customerProfile.updateMany({
            where: { userId, walletBalance: { gte: amount } },
            data: { walletBalance: { decrement: amount } },
          });
      if (result.count === 0) return sendError(res, 400, 'Insufficient balance');
      walletBalance = walletBalance - Number(amount);

      await prisma.transaction.create({
        data: { userId, type: 'WALLET_WITHDRAWAL', amount: -amount, description, status: 'completed' },
      });

      await notificationService.sendPushNotification(
        userId, 'Withdrawal Initiated',
        `Your withdrawal of ₹${Number(amount).toLocaleString('en-IN')} has been submitted and will be processed shortly.`,
        'withdrawal', { amount, method },
      );

      sendResponse(res, 200, { walletBalance });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
