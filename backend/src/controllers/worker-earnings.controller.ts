import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { emitToAdmins } from '../services/socket.service';
import { notificationService } from '../services/notification.service';
import { guardAmount } from '../utils/money';

export const workerEarningsController = {
  getEarnings: async (req: AuthRequest, res: Response) => {
    try {
      const wp = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!wp) return sendError(res, 404, 'Worker profile not found');

      const now = new Date();
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

      const totalBookings = await prisma.booking.count({ where: { workerId: req.user!.userId } });
      const acceptedBookings = await prisma.booking.count({
        where: { workerId: req.user!.userId, status: { in: ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'] } },
      });
      const acceptanceRate = totalBookings > 0 ? Math.round((acceptedBookings / totalBookings) * 100) : 0;

      const responseTimeResult = await prisma.booking.findMany({
        where: { workerId: req.user!.userId, acceptedAt: { not: null } },
        select: { createdAt: true, acceptedAt: true },
        take: 10, orderBy: { acceptedAt: 'desc' },
      });
      let avgResponseSec = 0;
      if (responseTimeResult.length > 0) {
        // Seconds (not rounded minutes) so sub-minute responses aren't shown as 0.
        const diffs = responseTimeResult.map(b => (b.acceptedAt!.getTime() - b.createdAt.getTime()) / 1000).filter(d => d > 0 && d < 7200);
        if (diffs.length > 0) avgResponseSec = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      }

      const [todayEarnings, weekEarnings, monthEarnings, pendingWithdrawals, recentPayouts] = await Promise.all([
        prisma.booking.aggregate({ where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: todayStart } }, _sum: { workerEarnings: true } }),
        prisma.booking.aggregate({ where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: weekStart } }, _sum: { workerEarnings: true } }),
        prisma.booking.aggregate({ where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: monthStart } }, _sum: { workerEarnings: true } }),
        prisma.withdrawalRequest.aggregate({ where: { workerProfileId: wp.id, status: 'pending' }, _sum: { amount: true } }),
        prisma.withdrawalRequest.findMany({ where: { workerProfileId: wp.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, amount: true, status: true, createdAt: true, upiId: true } }),
      ]);

      sendResponse(res, 200, {
        walletBalance: wp.walletBalance, totalEarned: wp.totalEarned, thisMonthEarned: wp.thisMonthEarned,
        completedJobs: wp.completedJobs, rating: wp.rating, acceptanceRate,
        responseTimeMinutes: avgResponseSec > 0 ? Math.round(avgResponseSec) / 60 : wp.responseTimeMinutes,
        todayEarnings: todayEarnings._sum.workerEarnings || 0, weekEarnings: weekEarnings._sum.workerEarnings || 0,
        monthEarnings: monthEarnings._sum.workerEarnings || 0, pendingWithdrawal: pendingWithdrawals._sum.amount || 0,
        withdrawals: recentPayouts, upiId: wp.upiId,
        bankAccount: wp.bankAccountNumber ? `••••${wp.bankAccountNumber.slice(-4)}` : null,
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getEarningsReport: async (req: AuthRequest, res: Response) => {
    try {
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const agg = await prisma.booking.aggregate({
          where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
          _sum: { workerEarnings: true },
          _count: true,
        });
        months.push({
          label: `${start.toLocaleString('en-US', { month: 'short' })} ${String(start.getFullYear()).slice(2)}`,
          earnings: agg._sum.workerEarnings || 0,
          jobs: agg._count,
        });
      }
      sendResponse(res, 200, { months });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  withdraw: async (req: AuthRequest, res: Response) => {
    try {
      const { amount, method = 'UPI', upiId, bankAccount, ifscCode, bankName, accountHolderName } = req.body;
      const guarded = guardAmount(amount);
      if (guarded === null) return sendError(res, 400, 'Invalid amount');
      const withdrawalAmount = Math.round(guarded);
      if (withdrawalAmount < 100) return sendError(res, 400, 'Minimum withdrawal is ₹100');

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

      const userId = req.user!.userId;

      const result = await prisma.$transaction(async (tx) => {
        const wp = await tx.workerProfile.findUnique({
          where: { userId },
          select: { id: true, walletBalance: true, isFrozen: true, isBanned: true, isPermanentlyBanned: true },
        });
        if (!wp) return { ok: false as const, code: 404, error: 'Worker profile not found' };
        if (wp.isBanned || wp.isPermanentlyBanned) return { ok: false as const, code: 403, error: 'Your account is banned and cannot withdraw funds' };
        if (wp.isFrozen || (wp.walletBalance ?? 0) < 0) return { ok: false as const, code: 403, error: 'Your account is frozen due to unpaid penalties' };

        // Atomic conditional debit — safe against concurrent withdrawals (TOCTOU fix).
        // Mirrors the pattern in payment.controller. Two concurrent requests can
        // never both pass the balance check and overdraw the wallet.
        const debit = await tx.workerProfile.updateMany({
          where: { id: wp.id, walletBalance: { gte: withdrawalAmount } },
          data: { walletBalance: { decrement: withdrawalAmount } },
        });
        if (debit.count === 0) return { ok: false as const, code: 400, error: 'Insufficient balance' };

        const withdrawal = await tx.withdrawalRequest.create({
          data: {
            workerProfileId: wp.id,
            amount: withdrawalAmount,
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
            amount: -withdrawalAmount,
            description,
            status: 'pending',
            idempotencyKey: `withdraw:${withdrawal.id}`,
          },
        });

        return { ok: true as const, withdrawal };
      });

      if (!result.ok) return sendError(res, result.code, result.error);

      emitToAdmins('admin_refresh', { type: 'withdrawal' });

      // Mirror the customer withdrawal path (payment.controller) so the worker's
      // dashboard + earnings refresh in realtime after a withdrawal too.
      await notificationService.sendPushNotification(
        userId, 'Withdrawal Initiated',
        `Your withdrawal of ₹${withdrawalAmount.toLocaleString('en-IN')} has been submitted and will be processed shortly.`,
        'withdrawal', { amount: withdrawalAmount, method },
      );

      sendResponse(res, 201, result.withdrawal, `₹${withdrawalAmount} withdrawal requested via ${method}`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  setGoal: async (req: AuthRequest, res: Response) => {
    try {
      const { goal } = req.body;
      if (!goal || goal < 1000) return sendError(res, 400, 'Minimum goal is ₹1,000');

      await prisma.appConfig.upsert({
        where: { key: `earnings_goal_${req.user!.userId}` },
        update: { value: goal.toString() },
        create: { key: `earnings_goal_${req.user!.userId}`, value: goal.toString(), description: 'Weekly earnings goal' },
      });

      sendResponse(res, 200, { goal }, `Weekly goal set to ₹${goal}`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getGoal: async (req: AuthRequest, res: Response) => {
    try {
      const config = await prisma.appConfig.findUnique({ where: { key: `earnings_goal_${req.user!.userId}` } });
      sendResponse(res, 200, { goal: config ? parseInt(config.value) : 5000 });
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
