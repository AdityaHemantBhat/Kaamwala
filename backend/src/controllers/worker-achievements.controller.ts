import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const workerAchievementsController = {
  getAchievements: async (req: AuthRequest, res: Response) => {
    try {
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
