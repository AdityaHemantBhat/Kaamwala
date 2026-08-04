import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { verificationService } from '../services/verification.service';
import { secureUploadVerificationImage } from '../services/media.service';

export const verificationController = {
  // GET /workers/verification/config — supported ID types + consent versions
  getConfig: async (_req: AuthRequest, res: Response) => {
    try {
      sendResponse(res, 200, await verificationService.getConfigPublic());
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // POST /workers/verification/start { proofType }
  start: async (req: AuthRequest, res: Response) => {
    try {
      const { proofType } = req.body;
      if (!proofType) return sendError(res, 400, 'proofType is required');
      const result = await verificationService.start(req.user!.userId, proofType, req);
      sendResponse(res, 200, result);
    } catch (e: any) { sendError(res, e.message === 'Unsupported ID type' ? 400 : e.status || 400, e.message); }
  },

  // POST /workers/verification/documents — multipart file + side
  uploadDocument: async (req: AuthRequest, res: Response) => {
    try {
      const { submissionId, side } = req.body;
      if (!req.file) return sendError(res, 400, 'No file uploaded');
      if (!submissionId || !side) return sendError(res, 400, 'submissionId and side are required');

      const { mediaId } = await secureUploadVerificationImage(req.file.buffer, req.user!.userId);
      const result = await verificationService.attachDocument(req.user!.userId, submissionId, side, mediaId, req);
      sendResponse(res, 201, result, side === 'SELFIE' ? 'Selfie uploaded' : 'Document uploaded');
    } catch (e: any) {
      const bad = e.message?.includes('Invalid') || e.message?.includes('too large') || e.message?.includes('Upload not found') || e.message?.includes('No active draft') || e.message?.includes('not required') || e.message?.includes('Selfie not required');
      sendError(res, bad ? 400 : e.status || 500, e.message);
    }
  },

  // POST /workers/verification/submit
  submit: async (req: AuthRequest, res: Response) => {
    try {
      const { submissionId } = req.body;
      if (!submissionId) return sendError(res, 400, 'submissionId is required');
      const result = await verificationService.submit(req.user!.userId, submissionId, {
        consentGranted: req.body.consentGranted,
        consentVersion: req.body.consentVersion,
        consentPolicyVersion: req.body.consentPolicyVersion,
        clientRequestId: req.body.clientRequestId,
      }, req);
      sendResponse(res, 200, result, 'Verification submitted for review');
    } catch (e: any) { sendError(res, 400, e.message); }
  },

  // GET /workers/verification/current — latest submission (no doc URLs)
  getCurrent: async (req: AuthRequest, res: Response) => {
    try {
      const result = await verificationService.getCurrent(req.user!.userId);
      sendResponse(res, 200, result);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /workers/verification/documents/:mediaId — signed URL (owner or admin only)
  getDocument: async (req: AuthRequest, res: Response) => {
    try {
      const url = await verificationService.getSignedUrl(req.user!.userId, req.user!.role, req.params.mediaId);
      sendResponse(res, 200, { url });
    } catch (e: any) {
      sendError(res, e.message === 'Access denied' ? 403 : e.message === 'Document not found' ? 404 : 500, e.message);
    }
  },
};
