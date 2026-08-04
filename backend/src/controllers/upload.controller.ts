import { Response } from 'express';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { createAuditLog } from '../utils/audit';
import { secureUploadImage, MEDIA_LIMITS, deleteMediaByUrl } from '../services/media.service';
import { prisma } from '../config/prisma';

export const uploadController = {
  uploadFile: async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) return sendError(res, 400, 'No file uploaded');

      const { bookingId, requestId, purpose } = req.body;
      const result = await secureUploadImage(req.file.buffer, req.user!.userId, { bookingId, requestId, purpose });

      sendResponse(res, 201, {
        url: result.url,
        filename: req.file.originalname,
        size: result.size,
        mime: result.mime,
        reencoded: result.reencoded,
      });
    } catch (e: any) {
      sendError(res, e.message?.includes('Invalid') || e.message?.includes('too large') ? 400 : 500, e?.message || 'Upload failed');
    }
  },

  // POST /upload/cleanup-orphans — admin/scheduled cleanup of draft media
  cleanupOrphans: async (_req: AuthRequest, res: Response) => {
    try {
      const { mediaService } = require('../services/media.service');
      const removed = await mediaService.cleanupOrphanedMedia(24);
      sendResponse(res, 200, { removed }, `${removed} orphaned media cleaned`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /upload/admin/media — media moderation
  listMedia: async (req: AuthRequest, res: Response) => {
    try {
      const { purpose, limit = '50' } = req.query;
      const where: any = {};
      if (purpose) where.purpose = purpose;
      const media = await prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(String(limit), 10) || 50,
        include: { uploadedByUser: { select: { id: true, name: true, phone: true } } },
      });
      sendResponse(res, 200, media);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // DELETE /upload/self — user removes an image they uploaded but not yet
  // submitted (draft). Owner-only; refuses once linked to a booking/request.
  deleteOwnMedia: async (req: AuthRequest, res: Response) => {
    try {
      const { url } = req.body;
      await deleteMediaByUrl(url, req.user!.userId);
      sendResponse(res, 200, null, 'Media removed');
    } catch (e: any) {
      sendError(res, e.message?.includes('submitted record') ? 409 : 400, e?.message || 'Failed to remove media');
    }
  },

  // DELETE /upload/admin/media/:id — remove a flagged media asset
  deleteMedia: async (req: AuthRequest, res: Response) => {
    try {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
      if (!asset) return sendError(res, 404, 'Media not found');
      const cloudinary = require('../config/cloudinary').cloudinary;
      if (asset.publicId) await cloudinary.uploader.destroy(asset.publicId).catch(() => {});
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
      await createAuditLog(prisma, req, {
        userId: req.user!.userId, action: 'MEDIA_DELETED', resource: 'MediaAsset', resourceId: asset.id,
        newValue: { publicId: asset.publicId, purpose: asset.purpose },
      }).catch(() => {});
      sendResponse(res, 200, null, 'Media removed');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  limits: MEDIA_LIMITS,
};
