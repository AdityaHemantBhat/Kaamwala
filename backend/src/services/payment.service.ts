import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { PaymentStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { moneyEqual } from '../utils/money';

// Cashfree is lazily loaded on first payment operation — the SDK pulls a large
// dependency tree (axios, gax, etc.) that must not be part of the startup hot path.
let cashfree: any = null;
function getCashfree(): any {
  if (!cashfree) {
    const { Cashfree, CFEnvironment } = require('cashfree-pg');
    const cfEnv = env.CF_ENV === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
    logger.info(`Cashfree init: env=${cfEnv}, appId=${env.CF_APP_ID ? env.CF_APP_ID.substring(0, 8) + '...' : 'MISSING'}`);
    cashfree = new Cashfree(cfEnv, env.CF_APP_ID, env.CF_SECRET_KEY);
  }
  return cashfree;
}

export const paymentService = {
  async createOrder(bookingId: string, amount: number, customerId: string) {
    const user = await prisma.user.findUnique({ where: { id: customerId } });

    // Validate AT ORDER CREATION (not only at verify): a booking order must
    // reference a real booking that belongs to this customer and match its
    // total — so a crafted request can never mint an order against someone
    // else's booking or for a wrong amount. Pseudo-ids (subscriptions, wallet
    // top-ups) are validated by their own controllers.
    if (!bookingId.startsWith('wrk_sub_') && !bookingId.startsWith('wrk_boost_') && !bookingId.startsWith('sub_') && !bookingId.startsWith('wallet_topup_')) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, customerId: true, totalAmount: true },
      });
      if (!booking) throw new Error('Booking not found');
      if (booking.customerId !== customerId) throw new Error('Unauthorized');
      if (!moneyEqual(booking.totalAmount, amount)) {
        throw new Error('Amount does not match booking total');
      }
    }

    const request: any = {
      order_amount: String(amount),
      order_currency: 'INR',
      customer_details: {
        customer_id: customerId,
        customer_name: user?.name || 'Customer',
        customer_email: user?.email || 'customer@kaamwala.app',
        customer_phone: user?.phone || '9999999999',
      },
      order_meta: {
        return_url: `${env.API_URL}/api/v1/payments/callback?order_id={order_id}`,
      },
    };

    let response;
    try {
      response = await getCashfree().PGCreateOrder(request);
    } catch (cfErr: any) {
      logger.error('Cashfree create order failed:', cfErr?.response?.data || cfErr?.message || cfErr);
      throw new Error(cfErr?.response?.data?.message || 'Cashfree order creation failed');
    }
    const order = response.data;

    if (!bookingId.startsWith('wrk_sub_') && !bookingId.startsWith('wrk_boost_') && !bookingId.startsWith('sub_') && !bookingId.startsWith('wallet_topup_')) {
      try {
        await prisma.booking.update({
          where: { id: bookingId },
          data: { paymentOrderId: order.order_id },
        });
      } catch (e) {
        logger.warn(`Could not attach paymentOrderId to booking ${bookingId}`);
      }
    }

    return {
      orderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      amount: order.order_amount,
      currency: order.order_currency,
    };
  },

  async verifyPayment(bookingId: string, orderId: string, expectedAmount?: number, customerId?: string) {
    const response = await getCashfree().PGFetchOrder(orderId);
    const order = response.data;

    if (order.order_status !== 'PAID') throw new Error('Payment not completed');

    // The order status alone is not enough — the order amount must match the
    // booking total, otherwise a ₹1 order could pay off a ₹5000 booking.
    if (expectedAmount !== undefined && !moneyEqual(Number(order.order_amount), expectedAmount)) {
      throw new Error('Payment amount does not match booking total');
    }
    // Ownership (order-reuse fix): the paid order must belong to the caller's
    // account. Without this, a reused/borrowed orderId could settle someone
    // else's booking. FAIL CLOSED — a missing customer_id is treated as a
    // mismatch, never silently accepted.
    const orderCustomerId = order.customer_details?.customer_id;
    if (customerId && orderCustomerId !== customerId) {
      throw new Error('Order does not belong to this account');
    }

    if (bookingId.startsWith('wallet_topup_')) {
      return { order, transitioned: true };
    }

    // Only the first call moves the booking to PAID (conditional claim). A
    // duplicate/concurrent verify of the same booking is an idempotent no-op
    // that reports transitioned: false, so downstream side-effects (payout,
    // fee collection, notifications) run exactly once.
    const marked = await prisma.booking.updateMany({
      where: { id: bookingId, paymentStatus: { not: PaymentStatus.PAID } },
      data: { paymentStatus: 'PAID', paymentRefId: order.cf_order_id },
    });
    return { order, transitioned: marked.count > 0 };
  },

  async verifyWalletOrder(orderId: string, userId?: string) {
    const response = await getCashfree().PGFetchOrder(orderId);
    const order = response.data;

    if (order.order_status !== 'PAID') throw new Error('Payment not completed');
    // Ownership (order-reuse fix) — a paid top-up order can only credit the
    // wallet of the account that created it. Fail closed on missing customer_id.
    const orderCustomerId = order.customer_details?.customer_id;
    if (userId && orderCustomerId !== userId) {
      throw new Error('Order does not belong to this account');
    }
    return { amount: order.order_amount };
  },

 /** Fetch a Cashfree order verbatim so callers can verify status/amount/ownership. */
  async fetchOrder(orderId: string) {
    const response = await getCashfree().PGFetchOrder(orderId);
    return response.data;
  },
};