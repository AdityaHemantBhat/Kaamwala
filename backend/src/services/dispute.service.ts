import { PrismaClient, DisputeDecision, BookingStatus, UserRole } from '@prisma/client';
import { notificationService } from './notification.service';
import { emitToBooking, emitToAdmins } from './socket.service';
import { linkMediaToScope } from './media.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface CreateDisputeInput {
  bookingId: string;
  raisedBy: string; // userId
  reason: string;
  evidence?: string[];
}

export interface UpdateDisputeInput {
  decision?: DisputeDecision;
  adminNotes?: string;
  refundAmount?: number;
  resolvedBy?: string;
}

export interface DisputeResponse {
  id: string;
  bookingId: string;
  bookingNumber: string;
  raisedBy: string;
  raisedByName: string;
  raisedByRole: UserRole;
  reason: string;
  customerEvidence: string[];
  workerEvidence: string[];
  decision: DisputeDecision;
  adminNotes: string | null;
  refundAmount: number | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  timeline: any[];
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; phone: string };
  worker: { id: string; name: string; phone: string };
}

export const disputeService = {
  async createDispute(input: CreateDisputeInput): Promise<DisputeResponse> {
    const { bookingId, raisedBy, reason, evidence = [] } = input;

    // Verify booking exists and is completed
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        worker: { select: { id: true, name: true, phone: true } }
      }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new Error('Disputes can only be raised for completed bookings');
    }

    // Check if dispute already exists
    const existingDispute = await prisma.dispute.findUnique({
      where: { bookingId }
    });

    if (existingDispute) {
      throw new Error('Dispute already exists for this booking');
    }

    // Verify the user is part of this booking
    const isCustomer = booking.customerId === raisedBy;
    const isWorker = booking.workerId === raisedBy;

    if (!isCustomer && !isWorker) {
      throw new Error('Only customer or worker of this booking can raise a dispute');
    }

    // Check 48-hour window
    const hoursSinceCompletion = (Date.now() - new Date(booking.updatedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCompletion > 48) {
      throw new Error('Dispute must be raised within 48 hours of job completion');
    }

    // Determine evidence arrays based on who raised it
    const customerEvidence = isCustomer ? evidence : [];
    const workerEvidence = isWorker ? evidence : [];

    // Create dispute
    const dispute = await prisma.dispute.create({
      data: {
        bookingId,
        raisedBy,
        reason,
        customerEvidence,
        workerEvidence,
        decision: DisputeDecision.PENDING,
        timeline: [{
          action: 'DISPUTE_RAISED',
          by: raisedBy,
          at: new Date(),
          note: reason
        }]
      },
      include: {
        booking: {
          select: { id: true, bookingNumber: true }
        }
      }
    });

    // Update booking status to DISPUTED
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.DISPUTED }
    });

    // Link evidence media to the booking so the orphan cleanup never deletes
    // evidence referenced by a live dispute.
    await linkMediaToScope(evidence, { bookingId }).catch(() => {});

    // Notify the other party
    const otherPartyId = isCustomer ? booking.workerId : booking.customerId;
    if (otherPartyId) {
      await notificationService.sendPushNotification(
        otherPartyId,
        'Dispute Raised',
        `A dispute has been raised for booking #${booking.bookingNumber}`,
        'dispute_update',
        { disputeId: dispute.id, bookingId }
      );
    }

    // Notify admins
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true }
    });

    for (const admin of admins) {
      await notificationService.sendPushNotification(
        admin.id,
        'New Dispute',
        `Dispute raised for booking #${booking.bookingNumber}`,
        'dispute_update',
        { disputeId: dispute.id, bookingId }
      ).catch(err => logger.warn('Failed to notify admin of dispute', { adminId: admin.id, disputeId: dispute.id, error: err?.message }));
    }

    // Emit socket event
    emitToBooking(bookingId, 'dispute_created', { disputeId: dispute.id });
    emitToAdmins('dispute_created', { disputeId: dispute.id });

    return this.getDisputeById(dispute.id);
  },

  async addEvidence(disputeId: string, userId: string, evidenceUrls: string[]): Promise<DisputeResponse> {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { booking: { include: { worker: true } } }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.decision !== DisputeDecision.PENDING) {
      throw new Error('Cannot add evidence to resolved dispute');
    }

    const isCustomer = dispute.booking.customerId === userId;
    const isWorker = dispute.booking.workerId === userId;

    if (!isCustomer && !isWorker) {
      throw new Error('Only parties to the booking can add evidence');
    }

    const updatedDispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        customerEvidence: isCustomer
          ? [...dispute.customerEvidence, ...evidenceUrls]
          : dispute.customerEvidence,
        workerEvidence: isWorker
          ? [...dispute.workerEvidence, ...evidenceUrls]
          : dispute.workerEvidence,
        timeline: {
          push: {
            action: 'EVIDENCE_ADDED',
            by: userId,
            at: new Date(),
            note: `Added ${evidenceUrls.length} evidence file(s)`
          }
        }
      }
    });

    // Protect newly-added evidence from the orphan cleanup by linking it to
    // the booking (no-op for already-linked images).
    await linkMediaToScope(evidenceUrls, { bookingId: dispute.bookingId }).catch(() => {});

    // Notify other party
    const otherPartyId = isCustomer ? dispute.booking.workerId : dispute.booking.customerId;
    if (otherPartyId) {
      await notificationService.sendPushNotification(
        otherPartyId,
        'New Evidence Added',
        `New evidence added to dispute for booking #${dispute.booking.bookingNumber}`,
        'dispute_update',
        { disputeId }
      );
    }

    emitToBooking(dispute.bookingId, 'dispute_updated', { disputeId });
    emitToAdmins('dispute_updated', { disputeId });

    return this.getDisputeById(disputeId);
  },

  async resolveDispute(disputeId: string, input: UpdateDisputeInput, adminId: string): Promise<DisputeResponse> {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            worker: { select: { id: true, name: true, phone: true } }
          }
        }
      }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.decision !== DisputeDecision.PENDING) {
      throw new Error('Dispute already resolved');
    }

    const { decision, adminNotes, refundAmount } = input;

    // Validate decision
    const validDecisions = Object.values(DisputeDecision);
    if (!validDecisions.includes(decision!)) {
      throw new Error('Invalid decision');
    }

    // Update dispute
    const updatedDispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        decision,
        adminNotes,
        refundAmount,
        resolvedAt: new Date(),
        resolvedBy: adminId,
        timeline: {
          push: {
            action: 'DISPUTE_RESOLVED',
            by: adminId,
            at: new Date(),
            note: `Decision: ${decision}${adminNotes ? ` - ${adminNotes}` : ''}`
          }
        }
      }
    });

    // Handle financial implications
    await this.handleDisputeResolution(dispute, decision!, refundAmount);

    // Update booking status back to COMPLETED (dispute resolved)
    await prisma.booking.update({
      where: { id: dispute.bookingId },
      data: { status: BookingStatus.COMPLETED }
    });

    // Notify both parties
    for (const party of [dispute.booking.customer, dispute.booking.worker]) {
      if (party) {
        await notificationService.sendPushNotification(
          party.id,
          'Dispute Resolved',
          `The dispute for booking #${dispute.booking.bookingNumber} has been resolved: ${decision}`,
          'dispute_update',
          { disputeId, decision }
        );
      }
    }

    emitToBooking(dispute.bookingId, 'dispute_resolved', { disputeId, decision });
    emitToAdmins('dispute_resolved', { disputeId, decision });

    return this.getDisputeById(disputeId);
  },

  async handleDisputeResolution(
    dispute: any,
    decision: DisputeDecision,
    refundAmount?: number
  ): Promise<void> {
    const booking = dispute.booking;
    const customerId = booking.customerId;
    const workerId = booking.workerId;
    const amount = booking.totalAmount || booking.baseAmount || 0;

    switch (decision) {
      case DisputeDecision.CUSTOMER_REFUND:
        // Refund customer, worker doesn't get paid
        if (refundAmount && refundAmount > 0) {
          await prisma.customerProfile.update({
            where: { userId: customerId },
            data: { walletBalance: { increment: refundAmount } }
          });
          // Create transaction record
          await prisma.transaction.create({
            data: {
              userId: customerId,
              bookingId: booking.id,
              type: 'DISPUTE_REFUND' as any,
              amount: refundAmount,
              description: `Dispute refund for booking #${booking.bookingNumber}`,
              reference: dispute.id,
              idempotencyKey: `dispute:${dispute.id}:refund`
            }
          });
        }
        break;

      case DisputeDecision.WORKER_PAID:
        // Worker gets full payment
        await prisma.workerProfile.update({
          where: { userId: workerId },
          data: { walletBalance: { increment: amount } }
        });
        await prisma.transaction.create({
          data: {
            userId: workerId,
            bookingId: booking.id,
            type: 'DISPUTE_PAYOUT' as any,
            amount,
            description: `Dispute resolution - worker paid for booking #${booking.bookingNumber}`,
            reference: dispute.id,
            idempotencyKey: `dispute:${dispute.id}:payout`
          }
        });
        break;

      case DisputeDecision.SPLIT_50_50:
        // Split amount 50/50
        const halfAmount = amount / 2;
        if (halfAmount > 0) {
          // Customer gets half back
          await prisma.customerProfile.update({
            where: { userId: customerId },
            data: { walletBalance: { increment: halfAmount } }
          });
          await prisma.transaction.create({
            data: {
              userId: customerId,
              bookingId: booking.id,
              type: 'DISPUTE_REFUND' as any,
              amount: halfAmount,
              description: `Dispute split refund for booking #${booking.bookingNumber}`,
              reference: dispute.id,
              idempotencyKey: `dispute:${dispute.id}:customer_refund`
            }
          });

          // Worker gets half
          await prisma.workerProfile.update({
            where: { userId: workerId },
            data: { walletBalance: { increment: halfAmount } }
          });
          await prisma.transaction.create({
            data: {
              userId: workerId,
              bookingId: booking.id,
              type: 'DISPUTE_PAYOUT' as any,
              amount: halfAmount,
              description: `Dispute split payout for booking #${booking.bookingNumber}`,
              reference: dispute.id,
              idempotencyKey: `dispute:${dispute.id}:worker_payout`
            }
          });
        }
        break;

      case DisputeDecision.RE_DO_SERVICE:
        // Create a new booking for re-do service
        logger.info(`Re-do service requested for booking ${booking.id}`);
        break;

      case DisputeDecision.CLOSED_NO_ACTION:
        // No financial changes, just close the dispute
        break;
    }
  },

  async getDisputeById(disputeId: string): Promise<DisputeResponse> {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            worker: { select: { id: true, name: true, phone: true } }
          }
        }
      }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    return this.formatDispute(dispute);
  },

  async getDisputes(filters: {
    status?: DisputeDecision;
    userId?: string;
    role?: UserRole;
    page?: number;
    limit?: number;
  } = {}): Promise<{ disputes: DisputeResponse[]; total: number }> {
    const { status, userId, role, page = 1, limit = 20 } = filters;

    const where: any = {};

    if (status) {
      where.decision = status;
    }

    if (userId && role) {
      if (role === 'CUSTOMER') {
        where.booking = { customerId: userId };
      } else if (role === 'WORKER') {
        where.booking = { workerId: userId };
      }
    }

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          booking: {
            include: {
              customer: { select: { id: true, name: true, phone: true } },
              worker: { select: { id: true, name: true, phone: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.dispute.count({ where })
    ]);

    return {
      disputes: disputes.map(this.formatDispute),
      total
    };
  },

  async getDisputeByBookingId(bookingId: string): Promise<DisputeResponse | null> {
    const dispute = await prisma.dispute.findUnique({
      where: { bookingId },
      include: {
        booking: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            worker: { select: { id: true, name: true, phone: true } }
          }
        }
      }
    });

    if (!dispute) return null;
    return this.formatDispute(dispute);
  },

  formatDispute(dispute: any): DisputeResponse {
    return {
      id: dispute.id,
      bookingId: dispute.bookingId,
      bookingNumber: dispute.booking.bookingNumber,
      raisedBy: dispute.raisedBy,
      raisedByName: dispute.booking.customer.id === dispute.raisedBy
        ? dispute.booking.customer.name
        : dispute.booking.worker?.name || 'Unknown',
      raisedByRole: dispute.booking.customer.id === dispute.raisedBy ? 'CUSTOMER' : 'WORKER',
      reason: dispute.reason,
      customerEvidence: dispute.customerEvidence,
      workerEvidence: dispute.workerEvidence,
      decision: dispute.decision,
      adminNotes: dispute.adminNotes,
      refundAmount: dispute.refundAmount,
      resolvedAt: dispute.resolvedAt,
      resolvedBy: dispute.resolvedBy,
      timeline: dispute.timeline || [],
      createdAt: dispute.createdAt,
      updatedAt: dispute.updatedAt,
      customer: {
        id: dispute.booking.customer.id,
        name: dispute.booking.customer.name,
        phone: dispute.booking.customer.phone
      },
      worker: {
        id: dispute.booking.worker?.id || '',
        name: dispute.booking.worker?.name || 'Unknown',
        phone: dispute.booking.worker?.phone || ''
      }
    };
  },

  async getDisputeStats(): Promise<{
    total: number;
    pending: number;
    resolved: number;
    byDecision: Record<DisputeDecision, number>;
  }> {
    const [total, pending, byDecisionRaw] = await Promise.all([
      prisma.dispute.count(),
      prisma.dispute.count({ where: { decision: DisputeDecision.PENDING } }),
      prisma.dispute.groupBy({
        by: ['decision'],
        _count: true
      })
    ]);

    const byDecision: Record<DisputeDecision, number> = {
      PENDING: 0,
      CUSTOMER_REFUND: 0,
      WORKER_PAID: 0,
      SPLIT_50_50: 0,
      RE_DO_SERVICE: 0,
      CLOSED_NO_ACTION: 0
    };

    byDecisionRaw.forEach(item => {
      byDecision[item.decision] = item._count;
    });

    return {
      total,
      pending,
      resolved: total - pending,
      byDecision
    };
  }
};