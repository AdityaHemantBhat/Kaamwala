import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { deleteMediaByUrl } from '../services/media.service';

export const workerPortfolioController = {
  getPhotos: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      if (!workerProfile) return sendError(res, 404, 'Worker profile not found');

      const photos = await prisma.jobPhoto.findMany({
        where: { workerProfileId: workerProfile.id, isPublic: true },
        orderBy: { createdAt: 'desc' },
      });

      sendResponse(res, 200, photos);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  addPhoto: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      if (!workerProfile) return sendError(res, 404, 'Worker profile not found');

      const { beforeUrl, afterUrl, caption, bookingId } = req.body;
      if (!beforeUrl || !afterUrl) return sendError(res, 400, 'Both before and after URLs required');

      const photo = await prisma.jobPhoto.create({
        data: {
          workerProfileId: workerProfile.id,
          beforeUrl, afterUrl, caption, bookingId, isPublic: true,
        },
      });

      sendResponse(res, 201, photo, 'Portfolio photo added');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  deletePhoto: async (req: AuthRequest, res: Response) => {
    try {
      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      if (!workerProfile) return sendError(res, 404, 'Worker profile not found');

      const photo = await prisma.jobPhoto.findFirst({
        where: { id: req.params.id, workerProfileId: workerProfile.id },
      });
      if (!photo) return sendError(res, 404, 'Portfolio photo not found');

      // Best-effort free the Cloudinary media. Only pure portfolio uploads are
      // deleted — if the same image also doubles as linked booking evidence
      // (deleteMediaByUrl refuses), the media is kept but the showcase entry
      // is still removed.
      for (const url of [photo.beforeUrl, photo.afterUrl]) {
        if (url && typeof url === 'string') {
          deleteMediaByUrl(url, req.user!.userId).catch(() => {});
        }
      }

      await prisma.jobPhoto.delete({ where: { id: photo.id } });
      sendResponse(res, 200, null, 'Portfolio photo removed');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },
};
