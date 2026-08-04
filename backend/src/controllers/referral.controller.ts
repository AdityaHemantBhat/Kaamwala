import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { referralService } from '../services/referral.service';

export const referralController = {
  getCode: async (req: AuthRequest, res: Response) => {
    try {
      const code = await referralService.getOrCreateCode(req.user!.userId);
      sendResponse(res, 200, { code, shareLink: `kaamwala.app/ref/${code}` });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  applyCode: async (req: AuthRequest, res: Response) => {
    try {
      const { code } = req.body;
      if (!code) return sendError(res, 400, 'Referral code required');

      const event = await referralService.processReferral(code, req.user!.userId);
      if (!event) return sendError(res, 400, 'Invalid or already used referral code');

      sendResponse(res, 200, { message: 'Referral applied! Your ₹50 bonus is credited after your first booking' });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getStats: async (req: AuthRequest, res: Response) => {
    try {
      const stats = await referralService.getReferralStats(req.user!.userId);
      sendResponse(res, 200, stats);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getLeaderboard: async (_req: AuthRequest, res: Response) => {
    try {
      const leaders = await prisma.referralEvent.groupBy({
        by: ['referrerId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });

      const withUsers = await Promise.all(
        leaders.map(async l => {
          const user = await prisma.user.findUnique({
            where: { id: l.referrerId },
            select: { name: true },
          });
          return { name: user?.name || 'Unknown', referrals: l._count.id };
        })
      );

      sendResponse(res, 200, withUsers);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },
};
