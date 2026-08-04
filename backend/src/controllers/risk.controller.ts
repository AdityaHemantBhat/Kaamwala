import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { getMarketAnomalies } from '../services/risk.service';
import { prisma } from '../config/prisma';

export const riskController = {
  // GET /risk/anomalies — admin: suspicious market patterns
  getAnomalies: async (_req: AuthRequest, res: Response) => {
    try {
      const anomalies = await getMarketAnomalies();
      sendResponse(res, 200, anomalies);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /risk/flagged-cancellations — admin: compensation farming flags
  getFlaggedCancellations: async (_req: AuthRequest, res: Response) => {
    try {
      const flagged = await prisma.cancellationRecord.findMany({
        where: { reviewFlag: { not: null } },
        include: { booking: { select: { bookingNumber: true, totalAmount: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      sendResponse(res, 200, flagged);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PATCH /risk/cancellations/:id/resolve — admin clears a farming flag after review
  resolveFlag: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { note } = req.body;
      const record = await prisma.cancellationRecord.update({
        where: { id },
        data: { reviewFlag: null, reviewed: true },
      });
      await createAuditLog(prisma, req, {
        userId: req.user!.userId, action: 'RISK_FLAG_RESOLVED', resource: 'CancellationRecord', resourceId: id, newValue: { note: note || 'Reviewed by admin' },
      });
      sendResponse(res, 200, record, 'Flag resolved');
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
