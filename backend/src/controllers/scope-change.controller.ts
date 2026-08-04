import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { emitToUser } from '../services/socket.service';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';
import { roundINR, roundINRWhole } from '../utils/money';
import { paymentCalculationService } from '../services/paymentCalculation.service';

// Scope / Change-Orders
// Worker proposes a change; customer MUST approve. Original booking scope is immutable.
// Price difference is explicit — worker can never unilaterally raise the price.

export const scopeChangeController = {
  // GET /scope-changes/:bookingId — list all change requests for a booking
  listForBooking: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Not your booking');
      }
      const changes = await prisma.scopeChangeRequest.findMany({
        where: { bookingId: req.params.bookingId },
        orderBy: { createdAt: 'desc' },
      });
      sendResponse(res, 200, changes);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // POST /scope-changes/:bookingId/propose — worker proposes a scope change
  propose: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { reason, newScope, newPrice } = req.body;
      const workerId = req.user!.userId;

      if (!reason || !newScope) return sendError(res, 400, 'Reason and new scope required');
      if (!newPrice || newPrice <= 0) return sendError(res, 400, 'Valid new price required');

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.workerId !== workerId) return sendError(res, 403, 'Only the assigned worker can propose changes');

      // Only during active states (not completed/cancelled)
      if (['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(booking.status)) {
        return sendError(res, 400, 'Cannot change scope at this stage');
      }

      // No pending unresolved change allowed
      const pending = await prisma.scopeChangeRequest.findFirst({
        where: { bookingId, status: 'PENDING' },
      });
      if (pending) return sendError(res, 400, 'A pending change request already exists');

      const change = await prisma.scopeChangeRequest.create({
        data: {
          bookingId,
          proposedById: workerId,
          reason,
          oldScope: booking.scope as any,
          oldPrice: booking.negotiatedAmount || booking.baseAmount,
          newScope,
          newPrice,
          // How much MORE (or less) the customer pays: new − old. Positive = price
          // increase the customer must approve.
          priceDifference: newPrice - (booking.negotiatedAmount || booking.baseAmount || 0),
          status: 'PENDING',
        },
      });

      // Notify customer
      await notificationService.sendPushNotification(
        booking.customerId,
        'Scope Change Proposed',
        `The worker proposed a change to your booking scope.`,
        'scope_change',
        { bookingId, changeId: change.id },
      );
      emitToUser(booking.customerId, 'scope_change_proposed', { bookingId, changeId: change.id });

      sendResponse(res, 201, change, 'Scope change proposed to customer');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // POST /scope-changes/:id/respond — customer approves or rejects
  respond: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { decision } = req.body; // 'APPROVED' | 'REJECTED'
      const customerId = req.user!.userId;

      if (!['APPROVED', 'REJECTED'].includes(decision)) return sendError(res, 400, 'Decision must be APPROVED or REJECTED');

      const change = await prisma.scopeChangeRequest.findUnique({
        where: { id },
        include: { booking: { select: { customerId: true, workerId: true, status: true } } },
      });
      if (!change) return sendError(res, 404, 'Change request not found');
      if (change.booking.customerId !== customerId) return sendError(res, 403, 'Only the customer can respond');
      if (change.status !== 'PENDING') return sendError(res, 400, 'Change request already resolved');
      // A stale proposal has no meaning once the job is over.
      if (['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(change.booking.status)) {
        return sendError(res, 400, 'Booking is already finished');
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.scopeChangeRequest.update({
          where: { id },
          data: { status: decision, respondedAt: new Date(), respondedById: customerId },
        });

        // On approval: recalculate amounts using locked commission percentage (Req 2.3, 7.1)
        if (decision === 'APPROVED') {
          const booking = await tx.booking.findUnique({ where: { id: change.bookingId } });
          if (!booking) throw new Error('Booking not found');

          const newPrice = change.newPrice || 0;
          
          // Use PaymentCalculationService to recalculate with LOCKED commission
          // Requirements: 2.3, 7.1 - preserve locked commission percentage
          let recalculated;
          try {
            recalculated = await paymentCalculationService.recalculateAfterScopeChange(
              {
                baseAmount: booking.baseAmount,
                platformFeePercent: booking.platformFeePercent,
                workerEarnings: booking.workerEarnings,
                totalAmount: booking.totalAmount,
              },
              newPrice,
            );
          } catch (err) {
            logger.error('Scope change recalculation failed', { error: err, bookingId: change.bookingId, newPrice });
            throw new Error(`Failed to recalculate amounts: ${(err as Error).message}`);
          }

          // Update booking with recalculated amounts
          await tx.booking.update({
            where: { id: change.bookingId },
            data: {
              scope: change.newScope as any,
              baseAmount: newPrice,
              platformFee: recalculated.platformFee,
              workerEarnings: recalculated.workerEarnings,
              totalAmount: recalculated.totalAmount,
              negotiatedAmount: newPrice,
            },
          });

          // Create ledger entry for scope change (Req 2.3, 7.1, 4.3)
          const oldTotal = booking.negotiatedAmount || booking.baseAmount || 0;
          const refundOrSurcharge = recalculated.totalAmount - oldTotal;

          if (Math.abs(refundOrSurcharge) > 0.01) {
            // Create ledger entry documenting the scope change and amount adjustment
            await tx.transaction.create({
              data: {
                userId: booking.workerId,
                bookingId: change.bookingId,
                type: refundOrSurcharge > 0 ? 'BOOKING_PAYMENT' : 'REFUND',
                amount: Math.abs(refundOrSurcharge),
                description: refundOrSurcharge > 0
                  ? `Scope change surcharge (₹${recalculated.totalAmount} - ₹${oldTotal})`
                  : `Scope change refund (₹${oldTotal} - ₹${recalculated.totalAmount})`,
                status: 'completed',
                calculationDetails: {
                  oldBaseAmount: booking.baseAmount,
                  newBaseAmount: newPrice,
                  lockedCommissionPercent: booking.platformFeePercent,
                  oldPlatformFee: booking.platformFee,
                  newPlatformFee: recalculated.platformFee,
                  oldWorkerEarnings: booking.workerEarnings,
                  newWorkerEarnings: recalculated.workerEarnings,
                  appliedCommissionRate: booking.appliedCommissionRate,
                },
              } as any,
            });
          }

          logger.info('Scope change approved and amounts recalculated', {
            bookingId: change.bookingId,
            oldBaseAmount: booking.baseAmount,
            newBaseAmount: newPrice,
            lockedCommissionPercent: booking.platformFeePercent,
            oldWorkerEarnings: booking.workerEarnings,
            newWorkerEarnings: recalculated.workerEarnings,
            refundOrSurcharge,
          });
        }
      });

      // Notify worker
      const workerId = change.booking.workerId;
      await notificationService.sendPushNotification(
        workerId,
        decision === 'APPROVED' ? 'Scope Change Approved' : 'Scope Change Rejected',
        decision === 'APPROVED' ? 'The customer approved your scope change.' : 'The customer rejected the scope change.',
        'scope_change',
        { bookingId: change.bookingId },
      );
      emitToUser(workerId, 'scope_change_response', { changeId: id, decision });

      sendResponse(res, 200, null, `Scope change ${decision.toLowerCase()}`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
