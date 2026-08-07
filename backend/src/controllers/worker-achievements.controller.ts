import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { grantEarnedBadges } from '../services/achievement.service';

export const workerAchievementsController = {
  getAchievements: async (req: AuthRequest, res: Response) => {
    try {
      // Lazy-grant: badges are earned from a worker's CURRENT stats, so a
      // worker who already crossed a milestone before the grant logic existed
      // gets their badges the first time this screen loads — no migration, no
      // waiting for a future completion. Idempotent; best-effort on failure.
      try {
        await grantEarnedBadges(req.user!.userId);
      } catch (e: any) {
        logger.warn('Achievements lazy-grant skipped', {
          workerId: req.user!.userId,
          error: e?.message,
        });
      }

      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      if (!workerProfile) return sendError(res, 404, 'Worker profile not found');

      const achievements = await prisma.workerAchievement.findMany({
        where: { workerProfileId: workerProfile.id },
        orderBy: { earnedAt: 'desc' },
      });

      sendResponse(res, 200, achievements);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },
};
