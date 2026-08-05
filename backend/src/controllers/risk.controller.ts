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
      const { note, payCompensation = true } = req.body;

      const record = await prisma.cancellationRecord.findUnique({
        where: { id },
        select: { id: true, bookingId: true, workerCompensation: true },
      });
      if (!record) return sendError(res, 404, 'Cancellation record not found');

      // When the flag is cleared, the withheld worker compensation becomes due.
      // Pay it out (idempotently) so the worker is compensated after review —
      // unless the admin explicitly opts out (payCompensation: false).
      if (payCompensation && record.workerCompensation > 0 && record.bookingId) {
        const booking = await prisma.booking.findUnique({
          where: { id: record.bookingId },
          select: { workerId: true },
        });
        if (booking) {
          const alreadyPaid = await prisma.transaction.findFirst({
            where: { bookingId: record.bookingId, type: 'URGENT_CANCELLATION_COMPENSATION' },
            select: { id: true },
          });
          if (!alreadyPaid) {
            const compKey = `cancel:comp:${record.bookingId}`;
            const workerWallet = await prisma.workerProfile.findUnique({
              where: { userId: booking.workerId },
              select: { walletBalance: true },
            });
            await prisma.$transaction(async (tx) => {
              await tx.workerProfile.update({
                where: { userId: booking.workerId },
                data: {
                  walletBalance: { increment: record.workerCompensation },
                  totalEarned: { increment: record.workerCompensation },
                },
              });
              await tx.transaction.create({
                data: {
                  userId: booking.workerId,
                  bookingId: record.bookingId,
                  type: 'URGENT_CANCELLATION_COMPENSATION',
                  amount: record.workerCompensation,
                  description: 'Cancellation compensation paid after risk review',
                  status: 'completed',
                  idempotencyKey: compKey,
                  balanceBefore: workerWallet?.walletBalance ?? null,
                  balanceAfter: workerWallet ? workerWallet.walletBalance + record.workerCompensation : null,
                },
              });
            });
          }
        }
      }

      const updated = await prisma.cancellationRecord.update({
        where: { id },
        data: { reviewFlag: null, reviewed: true },
      });
      await createAuditLog(prisma, req, {
        userId: req.user!.userId, action: 'RISK_FLAG_RESOLVED', resource: 'CancellationRecord', resourceId: id, newValue: { note: note || 'Reviewed by admin', payCompensation },
      });
      sendResponse(res, 200, updated, 'Flag resolved');
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
