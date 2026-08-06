import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { moneyEqual } from '../utils/money';
import { AuthRequest } from '../middleware/auth.middleware';
import { paymentService } from '../services/payment.service';
import { notificationService } from '../services/notification.service';
import { emitToAdmins } from '../services/socket.service';
import { WORKER_PLANS, WorkerPlanKey } from '../services/workerPlans.service';

// Cost of a 7-day profile boost, purchased through the Cashfree gateway.
const BOOST_PRICE = 99;

export const workerSubscriptionController = {
  getPlans: (_req: any, res: Response) => {
    sendResponse(res, 200, [
      { id: 'FREE', name: 'Free', price: WORKER_PLANS.FREE.price, commission: `${WORKER_PLANS.FREE.commission}%`, features: ['Basic listing', 'Limited leads', 'Standard support'], popular: false },
      { id: 'PRO', name: 'Pro', price: WORKER_PLANS.PRO.price, priceLabel: `₹${WORKER_PLANS.PRO.price}/mo`, commission: `${WORKER_PLANS.PRO.commission}%`, features: ['Priority listing', 'Unlimited leads', '10% commission', 'Priority support'], popular: true },
      { id: 'ELITE', name: 'Elite', price: WORKER_PLANS.ELITE.price, priceLabel: `₹${WORKER_PLANS.ELITE.price}/mo`, commission: `${WORKER_PLANS.ELITE.commission}%`, features: ['Featured profile', 'Unlimited priority leads', '5% commission', '24/7 support', 'Guaranteed badge'], popular: false },
    ]);
  },

  getMySubscription: async (req: AuthRequest, res: Response) => {
    try {
      const sub = await prisma.workerSubscription.findUnique({ where: { userId: req.user!.userId } });
      const plan = (sub?.plan as WorkerPlanKey) || 'FREE';
      sendResponse(res, 200, {
        plan,
        status: sub?.status || 'active',
        currentPeriodEnd: sub?.currentPeriodEnd,
        commission: WORKER_PLANS[plan]?.commission || WORKER_PLANS.FREE.commission,
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  createOrder: async (req: AuthRequest, res: Response) => {
    try {
      const { plan } = req.body;
      if (!['PRO', 'ELITE'].includes(plan)) return sendError(res, 400, 'Invalid plan');
      const details = WORKER_PLANS[plan as WorkerPlanKey];

      const order = await paymentService.createOrder(`wrk_sub_${req.user!.userId}`, details.price, req.user!.userId);

      sendResponse(res, 201, {
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        amount: order.amount,
        currency: 'INR', plan,
        planDetails: details,
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  verifyPayment: async (req: AuthRequest, res: Response) => {
    try {
      const { orderId, plan } = req.body;
      if (!orderId || !['PRO', 'ELITE'].includes(plan)) return sendError(res, 400, 'Missing/invalid payment details');

      // Verify the order with Cashfree — payment must be completed.
      const order = await paymentService.fetchOrder(orderId);
      if (order.order_status !== 'PAID') throw new Error('Payment not completed');
      if (!moneyEqual(Number(order.order_amount), WORKER_PLANS[plan as WorkerPlanKey].price)) {
        throw new Error('Payment amount does not match plan price');
      }
      const orderCustomerId = order.customer_details?.customer_id;
      if (orderCustomerId !== req.user!.userId) {
        throw new Error('Order does not belong to this account');
      }

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const details = WORKER_PLANS[plan as WorkerPlanKey];

      // Idempotency anchor FIRST: the unique `idempotencyKey` ledger row is the
      // single source of truth. A duplicate/concurrent verify of the same
      // orderId hits P2002 here and short-circuits BEFORE any side effect — so
      // the plan is never re-upserted (which would double the billing period),
      // the badges never re-stamped, and no second notification fires. The old
      // check-then-insert raced: two parallel verifies both saw "not existing"
      // and both created a ledger row (one died on P2002 → 500).
      const key = `wrksub:${req.user!.userId}:${orderId}`;
      try {
        await prisma.transaction.create({
          data: {
            userId: req.user!.userId, type: 'SUBSCRIPTION_PAYMENT', amount: details.price,
            description: `${details.label} - Worker Plan (1 month)`, status: 'completed',
            reference: orderId, idempotencyKey: key,
          },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return sendResponse(res, 200, { plan }, 'Plan already active');
        }
        throw e;
      }

      await prisma.workerSubscription.upsert({
        where: { userId: req.user!.userId },
        update: { plan: plan as any, status: 'active', currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
        create: { userId: req.user!.userId, plan: plan as any, status: 'active', currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
      });

      // ELITE grants the guaranteed badge; PRO/ELITE grant priority/featured
      // listing for the paid period (featuredUntil expires naturally).
      if (plan === 'ELITE') {
        await prisma.workerProfile.update({
          where: { userId: req.user!.userId },
          data: { isGuaranteed: true, guaranteedSince: new Date() },
        });
      }
      if (plan === 'PRO' || plan === 'ELITE') {
        await prisma.workerProfile.update({
          where: { userId: req.user!.userId },
          data: { isFeatured: true, featuredUntil: periodEnd },
        });
      }

      await notificationService.sendPushNotification(
        req.user!.userId, 'Plan Activated',
        `Your KaamWala ${plan} plan is now active. Enjoy lower platform commissions on every booking!`,
        'subscription', { plan, expiresAt: periodEnd },
      );

      emitToAdmins('admin_refresh', { type: 'subscription_update' });
      sendResponse(res, 200, { plan }, `Subscribed to ${plan}!`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  cancelSubscription: async (req: AuthRequest, res: Response) => {
    try {
      await prisma.workerSubscription.update({
        where: { userId: req.user!.userId },
        data: { status: 'cancelled', cancelledAt: new Date(), plan: 'FREE' },
      });
      sendResponse(res, 200, null, 'Worker plan cancelled. Downgraded to FREE.');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  createBoostOrder: async (req: AuthRequest, res: Response) => {
    try {
      const order = await paymentService.createOrder(`wrk_boost_${req.user!.userId}`, BOOST_PRICE, req.user!.userId);
      sendResponse(res, 201, {
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        amount: order.amount,
        currency: 'INR',
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  verifyBoost: async (req: AuthRequest, res: Response) => {
    try {
      const { orderId } = req.body;
      if (!orderId) return sendError(res, 400, 'Missing payment details');

      // Verify the order with Cashfree — payment must be completed and match
      // the boost price, and the order must belong to this worker.
      const order = await paymentService.fetchOrder(orderId);
      if (order.order_status !== 'PAID') throw new Error('Payment not completed');
      if (!moneyEqual(Number(order.order_amount), BOOST_PRICE)) {
        throw new Error('Payment amount does not match boost price');
      }
      const orderCustomerId = order.customer_details?.customer_id;
      if (orderCustomerId !== req.user!.userId) {
        throw new Error('Order does not belong to this account');
      }

      // Idempotency anchor FIRST (same pattern as plan verify): the unique
      // `idempotencyKey` ledger row short-circuits duplicate/concurrent verifies
      // of the same orderId before ANY side effect — no double badge, no double
      // notification. A retry of the same order simply reports "already applied".
      const key = `boost:${req.user!.userId}:${orderId}`;
      try {
        await prisma.transaction.create({
          data: {
            userId: req.user!.userId, type: 'SUBSCRIPTION_PAYMENT', amount: BOOST_PRICE,
            description: 'Featured boost - 7 days', status: 'completed',
            reference: orderId, idempotencyKey: key,
          },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return sendResponse(res, 200, null, 'Boost already applied');
        }
        throw e;
      }

      // "Extend": if the current featured badge is still live, stack 7 more days
      // onto it; otherwise start fresh from now.
      const wp = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId } });
      const base = wp?.featuredUntil && wp.featuredUntil.getTime() > Date.now()
        ? wp.featuredUntil
        : new Date();
      const featuredUntil = new Date(base.getTime() + 7 * 86400000);
      await prisma.workerProfile.update({
        where: { userId: req.user!.userId },
        data: { isFeatured: true, featuredUntil },
      });

      await notificationService.sendPushNotification(
        req.user!.userId, 'Profile Boosted',
        'Your profile is now featured for 7 days!',
        'subscription', { featuredUntil: featuredUntil.toISOString() },
      );

      emitToAdmins('admin_refresh', { type: 'subscription_update' });
      sendResponse(res, 200, null, 'Profile boosted! Featured for 7 days.');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getEarningsProjection: async (req: AuthRequest, res: Response) => {
    try {
      const wp = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!wp) return sendError(res, 404, 'Worker profile not found');

      const avgPerJob = wp.totalEarned / (wp.completedJobs || 1);
      const jobsPerMonth = Math.max(1, Math.round((wp.completedJobs || 0) / 3));

      sendResponse(res, 200, {
        currentEarnings: wp.totalEarned,
        avgPerJob: Math.round(avgPerJob),
        estimatedJobsPerMonth: jobsPerMonth,
        free: { commission: '15%', monthlyFee: 0, takeHome: Math.round(jobsPerMonth * avgPerJob * 0.85) },
        pro: { commission: '10%', monthlyFee: 199, takeHome: Math.round(jobsPerMonth * avgPerJob * 0.90 - 199) },
        elite: { commission: '5%', monthlyFee: 499, takeHome: Math.round(jobsPerMonth * avgPerJob * 0.95 - 499) },
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
