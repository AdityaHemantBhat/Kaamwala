import { Response } from 'express';
import { prisma } from '../config/prisma';
import { paymentService } from '../services/payment.service';
import { notificationService } from '../services/notification.service';
import { sendResponse, sendError } from '../utils/response';
import { moneyEqual } from '../utils/money';
import { AuthRequest } from '../middleware/auth.middleware';
import { emitToAdmins } from '../services/socket.service';
import { devBackdoorsEnabled } from '../config/env';

const PLAN_MAP: Record<string, { price: number; label: string; discount: number }> = {
  PLUS: { price: 199, label: 'KaamWala Plus', discount: 10 },
  PRO: { price: 499, label: 'KaamWala Pro', discount: 20 },
};

export const subscriptionController = {
  getPlans: (_req: any, res: Response) => {
    sendResponse(res, 200, [
      { id: 'BASIC', name: 'Basic', price: 0, priceLabel: 'Free', features: ['Standard worker search', 'Pay per booking', 'Email support'] },
      { id: 'PLUS', name: 'KaamWala Plus', price: 199, priceLabel: '₹199/month', features: ['10% discount on all bookings', 'Priority worker assignment', 'Free cancellation', 'Dedicated chat support'] },
      { id: 'PRO', name: 'KaamWala Pro', price: 499, priceLabel: '₹499/month', popular: true, features: ['20% discount on all bookings', 'Emergency booking included', 'Monthly AC + electrical checkup', 'Priority support 24/7', 'Free cancellation'] },
    ]);
  },

  getMySubscription: async (req: AuthRequest, res: Response) => {
    try {
      const sub = await prisma.userSubscription.findUnique({ where: { userId: req.user!.userId } });
      if (!sub || sub.plan === 'BASIC' || sub.status !== 'active') {
        return sendResponse(res, 200, { plan: 'BASIC', status: 'active' });
      }
      sendResponse(res, 200, { plan: sub.plan, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  createOrder: async (req: AuthRequest, res: Response) => {
    try {
      const { plan } = req.body;
      if (!['PLUS', 'PRO'].includes(plan)) return sendError(res, 400, 'Invalid plan');

      const details = PLAN_MAP[plan]!;
      const amount = details.price;

      const existing = await prisma.userSubscription.findUnique({ where: { userId: req.user!.userId } });
      if (existing && existing.plan === plan && existing.status === 'active') {
        return sendError(res, 400, 'Already subscribed');
      }

      const order = await paymentService.createOrder(`sub_${req.user!.userId}`, amount, req.user!.userId);

      sendResponse(res, 201, {
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        amount: order.amount,
        currency: 'INR', plan,
        planDetails: details,
      });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  verifyPayment: async (req: AuthRequest, res: Response) => {
    try {
      const { orderId, plan, isMock } = req.body;
      if (!orderId || !['PLUS', 'PRO'].includes(plan)) return sendError(res, 400, 'Missing/invalid payment details');

      // Dev-only mock path (Expo Go has no native SDK). Only active when
      // ENABLE_DEV_BACKDOORS=true is explicitly set; never in production.
      if (!(devBackdoorsEnabled && isMock)) {
        const order = await paymentService.fetchOrder(orderId);
        if (order.order_status !== 'PAID') throw new Error('Payment not completed');
        if (!moneyEqual(Number(order.order_amount), PLAN_MAP[plan]!.price)) {
          throw new Error('Payment amount does not match plan price');
        }
        // Ownership: the order must belong to this user (stamped at createOrder).
        const orderCustomerId = order.customer_details?.customer_id;
        if (orderCustomerId && orderCustomerId !== req.user!.userId) {
          throw new Error('Order does not belong to this account');
        }
      }

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.userSubscription.upsert({
        where: { userId: req.user!.userId },
        update: { plan: plan as any, status: 'active', currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
        create: { userId: req.user!.userId, plan: plan as any, status: 'active', currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
      });

      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { isPremium: true, premiumPlan: plan, premiumExpiresAt: periodEnd },
      });

      const details = PLAN_MAP[plan]!;
      // Unique idempotencyKey prevents a duplicate verify (same orderId) from
      // recording a second charge in the ledger — the plan upsert above is
      // idempotent, so a P2002 here just means "already activated".
      try {
        await prisma.transaction.create({
          data: { userId: req.user!.userId, type: 'SUBSCRIPTION_PAYMENT', amount: details.price, description: `${details.label} — 1 month`, status: 'completed', reference: orderId, idempotencyKey: `sub:${orderId}` },
        });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
      }

      await notificationService.sendPushNotification(
        req.user!.userId, 'Subscription Activated',
        `Your KaamWala ${plan} subscription is now active. Enjoy ${details.discount}% off on every booking!`,
        'subscription', { plan, expiresAt: periodEnd },
      );

      emitToAdmins('admin_refresh', { type: 'subscription_update' });
      sendResponse(res, 200, { plan, expiresAt: periodEnd }, `Successfully upgraded to ${plan}!`);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  cancelSubscription: async (req: AuthRequest, res: Response) => {
    try {
      const sub = await prisma.userSubscription.findUnique({ where: { userId: req.user!.userId } });
      if (!sub || sub.plan === 'BASIC') return sendError(res, 400, 'No active subscription');

      await prisma.userSubscription.update({
        where: { userId: req.user!.userId },
        data: { plan: 'BASIC', status: 'cancelled', cancelledAt: new Date() },
      });

      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { isPremium: false, premiumPlan: 'BASIC', premiumExpiresAt: null },
      });

      await notificationService.sendPushNotification(
        req.user!.userId, 'Subscription Cancelled',
        'Your KaamWala subscription has been cancelled. You can resubscribe anytime.',
        'subscription',
      );

      sendResponse(res, 200, null, 'Subscription cancelled');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },
};
