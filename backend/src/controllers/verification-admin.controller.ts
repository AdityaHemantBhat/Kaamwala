import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { verificationService } from '../services/verification.service';

export const verificationAdminController = {
  // GET /admin/workers/verifications
  list: async (req: AuthRequest, res: Response) => {
    try {
      const { status, search } = req.query;
      const submissions = await verificationService.listForAdmin(status as string, search as string);
      sendResponse(res, 200, submissions);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  // GET /admin/workers/verifications/:id
  getDetail: async (req: AuthRequest, res: Response) => {
    try {
      const detail = await verificationService.getDetailForAdmin(req.params.id);
      sendResponse(res, 200, detail);
    } catch (e: any) {
      sendError(res, e.message === 'Submission not found' ? 404 : 500, e.message);
    }
  },

  // POST /admin/workers/verifications/:id/review
  review: async (req: AuthRequest, res: Response) => {
    try {
      const { decision, rejectionReason, rejectionNote, resubmissionRequiredFor } = req.body;
      if (!decision) return sendError(res, 400, 'Decision is required');

      const result = await verificationService.review(req.params.id, req.user!.userId, {
        decision,
        rejectionReason,
        rejectionNote,
        resubmissionRequiredFor,
      }, req);

      sendResponse(res, 200, result, 'Verification review submitted successfully');
    } catch (e: any) {
      sendError(res, e.status || 400, e.message);
    }
  },
};
