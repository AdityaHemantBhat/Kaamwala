import { Response } from 'express';
import { cancellationService } from '../services/cancellation.service';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const cancellationController = {
  cancelBooking: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { reasonCategory, cancelReason } = req.body;
      const result = await cancellationService.processCustomerCancellation(
        bookingId, req.user!.userId, reasonCategory || 'OTHER', cancelReason,
      );
      sendResponse(res, 200, result.booking, 'Booking cancelled');
    } catch (e: any) {
      const statusCode = e.message.includes('not found') ? 404
        : e.message.includes('cannot be cancelled') || e.message.includes('already') ? 400
        : e.message.includes('Access') ? 403
        : 500;
      sendError(res, statusCode, e.message);
    }
  },

  getHistory: async (req: AuthRequest, res: Response) => {
    try {
      const records = await cancellationService.getUserCancellationHistory(
        req.user!.userId, req.user!.role,
      );
      sendResponse(res, 200, records);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getPendingFee: async (req: AuthRequest, res: Response) => {
    try {
      const fee = await cancellationService.getPendingCancellationFee(req.user!.userId);
      sendResponse(res, 200, { pendingCancellationFee: fee });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  previewCancellation: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const preview = await cancellationService.previewCancellation(
        bookingId, req.user!.userId, req.user!.role,
      );
      sendResponse(res, 200, preview);
    } catch (e: any) {
      const statusCode = e.message.includes('not found') ? 404
        : e.message.includes('Access') ? 403
        : e.message.includes('cannot be cancelled') ? 400
        : 500;
      sendError(res, statusCode, e.message);
    }
  },

  adminGetAll: async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const filters: any = {};
      if (req.query.feeStatus) filters.feeStatus = req.query.feeStatus;
      if (req.query.cancelledBy) filters.cancelledBy = req.query.cancelledBy;
      const result = await cancellationService.adminGetCancellationRecords(page, limit, filters);
      sendResponse(res, 200, result);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  adminWaiveFee: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const record = await cancellationService.adminWaiveFee(id, req.user!.userId, reason || 'Admin waived', req);
      sendResponse(res, 200, record, 'Fee waived');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  adminRefundFee: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const record = await cancellationService.adminRefundFee(id, req.user!.userId, req);
      sendResponse(res, 200, record, 'Fee refunded');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  adminGetStats: async (req: AuthRequest, res: Response) => {
    try {
      const stats = await cancellationService.getCancellationStats();
      sendResponse(res, 200, stats);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
