import { Request } from 'express';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { BookingStatus, CancellationFeeStatus, PaymentStatus, SubscriptionPlan } from '@prisma/client';
import { createAuditLog } from '../utils/audit';
import { emitToUser, emitToAdmins } from './socket.service';
import { notificationService } from './notification.service';
import { chatService } from './chat.service';
import { workerHealthService } from './workerHealth.service';
import { logger } from '../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getLateCancellationFeeDefault(): Promise<number> {
  // Single source: CANCELLATION_COMPENSATION in MarketConfig (admin-managed), env as fallback.
  const comp = await getConfig('CANCELLATION_COMPENSATION', '');
  if (comp) return parseFloat(comp) || 50;
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'LATE_CANCELLATION_FEE' } });
    if (cfg) return parseFloat(cfg.value) || 50;
  } catch {}
  return parseFloat(env.LATE_CANCELLATION_FEE || '50');
}

async function getConfig(key: string, fallback: string): Promise<string> {
  try {
    const cfg = await prisma.marketConfig.findUnique({ where: { key } });
    return cfg?.value || fallback;
  } catch { return fallback; }
}

/**
 * Snapshot the customer's subscription at cancellation time.
 * Returns BASIC if no active plan found.
 *
 * Validity: the plan must be status 'active' AND within its billing period
 * (currentPeriodEnd in the future). Nothing in the system auto-expires
 * subscriptions, so the period end is the only reliable "is this benefit live"
 * check — an expired plan must never bypass the cancellation fee.
 */
async function getSubscriptionPlanAtTime(userId: string): Promise<SubscriptionPlan> {
  try {
    const sub = await prisma.userSubscription.findUnique({ where: { userId } });
    if (
      sub &&
      sub.status === 'active' &&
      sub.plan !== 'BASIC' &&
      (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date())
    ) {
      return sub.plan;
    }
  } catch {}
  return SubscriptionPlan.BASIC;
}

/**
 * Single authoritative "has the worker crossed On My Way" check. The
 * travelProtectionEligibleAt timestamp is set by the server on the
 * ACCEPTED → ON_THE_WAY transition; status is the fallback so legacy rows and
 * IN_PROGRESS bookings are treated identically everywhere.
 */
function isPostOnTheWay(booking: {
  status: BookingStatus | string;
  travelProtectionEligibleAt?: Date | null;
}): boolean {
  if (booking.travelProtectionEligibleAt) return true;
  return booking.status === BookingStatus.ON_THE_WAY || booking.status === BookingStatus.IN_PROGRESS;
}

// Predefined reasons a worker may give for cancelling after "On My Way".
// The reason is MANDATORY post-OMW (Rule 3) and must come from this set;
// OTHER additionally requires a free-text description from the worker.
const WORKER_POST_OMW_REASONS = [
  'CUSTOMER_REQUESTED',
  'CUSTOMER_UNREACHABLE',
  'WRONG_LOCATION',
  'UNABLE_TO_PERFORM',
  'EMERGENCY',
  'SAFETY',
  'OTHER',
];

function validateWorkerCancellationReason(
  reasonCategory: string | undefined,
  cancelReason: string | undefined,
): void {
  if (!reasonCategory || !WORKER_POST_OMW_REASONS.includes(reasonCategory)) {
    throw new Error('Invalid cancellation reason. Pick a valid reason for cancelling.');
  }
  if (reasonCategory === 'OTHER' && (!cancelReason || cancelReason.trim().length < 3)) {
    throw new Error('Invalid cancellation reason. Please describe why you are cancelling (at least 3 characters).');
  }
}

/**
 * Create a cancellation record, mapping the bookingId @unique constraint to the
 * friendly "already cancelled" error. Two concurrent cancel requests race to
 * create the record; the unique index guarantees exactly one wins and the
 * loser gets a clean 400 instead of a raw Prisma P2002.
 */
async function createCancellationRecord(tx: any, data: any) {
  try {
    return await tx.cancellationRecord.create({ data });
  } catch (e: any) {
    if (e?.code === 'P2002') throw new Error('Booking already cancelled');
    throw e;
  }
}

/**
 * Single source of truth for the customer late-cancellation fee and the worker
 * compensation. Fee and compensation are computed independently:
 *   - Before On My Way: both are 0 (Rule 1).
 *   - After On My Way, BASIC: fee = compensation (Rule 2).
 *   - After On My Way, active PLUS/PRO: fee = 0, worker compensation unchanged.
 *   - Worker-requested cancel: fee = 0 and compensation = 0 (Rule 3).
 * Used by both the cancellation flow and the cancel-preview endpoint.
 */
async function computeCustomerCancellationFee(
  booking: any,
  customerPlan: SubscriptionPlan,
  reasonCategory: string,
): Promise<{ feeAmount: number; workerCompensation: number; reason: string }> {
  const { feeAmount: baseFee, reason: baseReason } = await calculateCancellationFee(booking.status, customerPlan);

  const WORKER_REQUESTED_REASONS = ['WORKER_REQUESTED_CANCEL', 'WORKER_ASKED_TO_CANCEL', 'WORKER_SUGGESTED_CANCEL'];
  if (WORKER_REQUESTED_REASONS.includes(reasonCategory)) {
    return { feeAmount: 0, workerCompensation: 0, reason: 'Worker requested cancellation — no charge to customer' };
  }

  let feeAmount = baseFee;
  let workerCompensation = 0;
  if (isPostOnTheWay(booking)) {
    const compensation = await getConfig('CANCELLATION_COMPENSATION', '50');
    workerCompensation = parseFloat(compensation);
    if (customerPlan === SubscriptionPlan.PLUS || customerPlan === SubscriptionPlan.PRO) {
      feeAmount = 0;
      return { feeAmount, workerCompensation, reason: 'Free late cancellation with your plan' };
    }
    feeAmount = workerCompensation;
    return { feeAmount, workerCompensation, reason: `Late cancellation charge of ₹${workerCompensation}` };
  }
  return { feeAmount, workerCompensation, reason: baseReason };
}

/**
 * Calculate cancellation fee based on booking status and customer plan.
 * Returns { feeAmount, reason } where reason is a display message.
 */
async function calculateCancellationFee(
  status: BookingStatus,
  customerPlan: SubscriptionPlan,
): Promise<{ feeAmount: number; reason: string }> {
  // Completed / already cancelled — can't cancel
  if (status === BookingStatus.COMPLETED || status === BookingStatus.CANCELLED || status === BookingStatus.DISPUTED) {
    throw new Error('Booking cannot be cancelled at this stage');
  }

  // Free if before ON_THE_WAY (PENDING, NEGOTIATING, ACCEPTED)
  if (status === BookingStatus.PENDING || status === BookingStatus.NEGOTIATING || status === BookingStatus.ACCEPTED) {
    return { feeAmount: 0, reason: '' };
  }

  // ON_THE_WAY or IN_PROGRESS — check plan
  if (customerPlan === SubscriptionPlan.PLUS || customerPlan === SubscriptionPlan.PRO) {
    return { feeAmount: 0, reason: 'Free cancellation with your plan' };
  }

  // BASIC / Normal — late fee applies
  const fee = await getLateCancellationFeeDefault();
  return { feeAmount: fee, reason: `Late cancellation fee of ₹${fee}` };
}

// ─── Core Service ─────────────────────────────────────────────────────────────

export const cancellationService = {
 /**
 * Process a customer-initiated cancellation with full business logic.
 */
  async processCustomerCancellation(
    bookingId: string,
    customerId: string,
    reasonCategory: string = 'OTHER',
    cancelReason?: string,
  ) {
    // Fetch booking with customer info
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { name: true } },
        worker: { select: { id: true, name: true, fcmToken: true } },
      },
    });

    if (!booking) throw new Error('Booking not found');
    if (booking.customerId !== customerId) throw new Error('Access denied');

    // State validation
    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.DISPUTED) {
      throw new Error('Booking cannot be cancelled at this stage');
    }

    // Idempotency check — already cancelled?
    const existing = await prisma.cancellationRecord.findUnique({ where: { bookingId } });
    if (existing) throw new Error('Booking already cancelled');

    // Snapshot subscription at cancellation time
    const customerPlan = await getSubscriptionPlanAtTime(customerId);

    // Calculate fee + worker compensation via the single policy helper.
    const { feeAmount, workerCompensation: workerCompensationAmount, reason } =
      await computeCustomerCancellationFee(booking, customerPlan, reasonCategory);

    // Compensation-farming detection — repeated pair pattern: request→accept→travel→cancel
    let reviewFlag: string | null = null;
    if (workerCompensationAmount > 0) {
      const recentCompensations = await prisma.cancellationRecord.count({
        where: {
          booking: { customerId, workerId: booking.workerId },
          workerCompensation: { gt: 0 },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
      if (recentCompensations >= 3) reviewFlag = 'COMPENSATION_FARMING';
    }

    // Exec transactional update
    const result = await prisma.$transaction(async (tx) => {
      // Create cancellation record
      const record = await createCancellationRecord(tx, {
        bookingId,
        cancelledBy: 'CUSTOMER',
        cancelReason: cancelReason || null,
        reasonCategory,
        customerPlan,
        feeAmount,
        feeStatus: feeAmount > 0 ? CancellationFeeStatus.PENDING : CancellationFeeStatus.PAID,
        workerCompensation: workerCompensationAmount,
        reviewFlag,
      });

      // Update booking
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: 'CUSTOMER',
          cancelReason: cancelReason || null,
          cancellationCharge: feeAmount,
          workerCompensation: workerCompensationAmount,
          updatedAt: new Date(),
        },
      });

      // If fee applies, add to customer's pending balance + independent ledger row
      if (feeAmount > 0) {
        const custProfile = await tx.customerProfile.findUnique({ where: { userId: customerId }, select: { walletBalance: true } });
        await tx.customerProfile.update({
          where: { userId: customerId },
          data: { pendingCancellationFee: { increment: feeAmount } },
        });
        await tx.transaction.create({
          data: {
            userId: customerId,
            bookingId: booking.id,
            type: 'CANCELLATION_FEE',
            amount: feeAmount,
            description: `Late cancellation fee for booking #${booking.bookingNumber}`,
            status: 'completed',
            idempotencyKey: `cancel:fee:${bookingId}`, // no double charge on retry
          },
        }).catch(() => {});
      }

      // If worker compensation applies, pay worker immediately
      // (unless flagged as possible compensation farming → pending review)
      if (workerCompensationAmount > 0 && !reviewFlag) {
        const workerWallet = await tx.workerProfile.findUnique({ where: { userId: booking.workerId }, select: { walletBalance: true } });
        await tx.workerProfile.update({
          where: { userId: booking.workerId },
          data: {
            walletBalance: { increment: workerCompensationAmount },
            totalEarned: { increment: workerCompensationAmount }
          }
        });

        await tx.transaction.create({
          data: {
            userId: booking.workerId,
            bookingId: booking.id,
            type: 'URGENT_CANCELLATION_COMPENSATION',
            amount: workerCompensationAmount,
            description: `Cancellation compensation for booking #${booking.bookingNumber}`,
            status: 'completed',
            idempotencyKey: `cancel:comp:${bookingId}`, //
            balanceBefore: workerWallet?.walletBalance ?? null,
            balanceAfter: workerWallet ? (workerWallet.walletBalance + workerCompensationAmount) : null,
          }
        });
      }

      return { record, updatedBooking };
    });

    // Chat system message
    const msgContent = cancelReason
      ? `Booking cancelled by you. Reason: ${reasonCategory} — ${cancelReason}`
      : `Booking cancelled by you. Reason: ${reasonCategory}`;
    try {
      await chatService.createSystemMessage(bookingId, customerId, msgContent);
    } catch (e) {
      logger.error('Failed to create system message for cancellation:', e);
    }

    // Notifications
    const friendlyReasonCategory = reasonCategory
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());

    const notificationTitle = 'Booking Cancelled';
    const notificationBody = `Booking #${booking.bookingNumber} was cancelled. Reason: ${friendlyReasonCategory}`;
    await notificationService.sendPushNotification(
      booking.workerId,
      notificationTitle,
      notificationBody,
      'booking_update',
      { bookingId },
    );

    if (feeAmount > 0) {
      await notificationService.sendPushNotification(
        customerId,
        'Cancellation Fee Added',
        `A late cancellation fee of ₹${feeAmount} has been added to your account.`,
        'cancellation_fee',
        { bookingId, feeAmount },
      );
    }

    // Socket events — emit once per participant's personal room (they are always
    // in `user_<id>`; a room broadcast would re-deliver to anyone who joined).
    emitToUser(booking.workerId, 'booking_status_update', result.updatedBooking);
    emitToAdmins('admin_refresh', { type: 'cancellation' });

    return { booking: result.updatedBooking, cancellationRecord: result.record };
  },

 /**
 * Process a worker-initiated cancellation.
 */
  async processWorkerCancellation(
    bookingId: string,
    workerId: string,
    cancelReason?: string,
    reasonCategory: string = 'WORKER_CANCELLED'
  ) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true, fcmToken: true } },
        worker: { select: { id: true, name: true } },
      },
    });

    if (!booking) throw new Error('Booking not found');
    if (booking.workerId !== workerId) throw new Error('Access denied');

    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.DISPUTED) {
      throw new Error('Booking cannot be cancelled at this stage');
    }

    const existing = await prisma.cancellationRecord.findUnique({ where: { bookingId } });
    if (existing) throw new Error('Booking already cancelled');

    // Snapshot subscription at cancellation time
    const customerPlan = await getSubscriptionPlanAtTime(booking.customerId);

    // Rule 3: when the worker cancels, the customer pays nothing. If they had
    // already paid, refund the full amount to their wallet.
    const refundAmount =
      booking.paymentStatus === PaymentStatus.PAID && (booking.totalAmount || 0) > 0
        ? booking.totalAmount
        : 0;

    // Execute transactional update
    const result = await prisma.$transaction(async (tx) => {
      const record = await createCancellationRecord(tx, {
        bookingId,
        cancelledBy: 'WORKER',
        cancelReason: cancelReason || null,
        reasonCategory,
        customerPlan,
        feeAmount: 0,
        feeStatus: CancellationFeeStatus.PAID,
        workerPenaltyApplied: false,
      });

      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: 'WORKER',
          cancelReason: cancelReason || null,
          // Clear any in-flight cancel-request handshake.
          cancelRequestStatus: null,
          ...(refundAmount > 0 ? { paymentStatus: PaymentStatus.REFUNDED } : {}),
          updatedAt: new Date(),
        },
      });

      // Increment worker cancelled jobs
      await tx.workerProfile.update({
        where: { userId: workerId },
        data: { cancelledJobs: { increment: 1 } },
      });

      // Refund the customer for an already-paid booking (idempotent per booking).
      if (refundAmount > 0) {
        await tx.customerProfile.update({
          where: { userId: booking.customerId },
          data: { walletBalance: { increment: refundAmount } },
        });
        await tx.transaction.create({
          data: {
            userId: booking.customerId,
            bookingId: booking.id,
            type: 'CANCELLATION_REFUND',
            amount: refundAmount,
            description: `Refund — worker cancelled booking #${booking.bookingNumber}`,
            reference: booking.id,
            status: 'completed',
            idempotencyKey: `cancel:refund:booking:${bookingId}`,
          },
        }).catch(() => {});
      }

      return { record, updatedBooking };
    });

    // Worker account health — post-OMW cancellations feed the reliability
    // ladder (warn → restrict → suspend). Record the derived risk on the record.
    try {
      const health = await workerHealthService.computeWorkerHealth(workerId);
      if (health) {
        await prisma.cancellationRecord.update({
          where: { id: result.record.id },
          data: {
            workerRiskScore: Math.round(health.cancellationRate * 100),
            workerPenaltyApplied: health.healthStatus !== 'ACTIVE',
          },
        });
      }
    } catch (e) {
      logger.error('Worker health update failed during worker cancellation:', e);
    }

    // Chat system message
    const msgContent = cancelReason
      ? `Booking cancelled by the worker. Reason: ${cancelReason}`
      : 'Booking cancelled by the worker.';
    try {
      await chatService.createSystemMessage(bookingId, workerId, msgContent);
    } catch (e) {
      logger.error('Failed to create system message for worker cancellation:', e);
    }

    // Notifications
    await notificationService.sendPushNotification(
      booking.customerId,
      'Booking Cancelled',
      `The worker cancelled booking #${booking.bookingNumber}. Reason: ${cancelReason || 'N/A'}`,
      'booking_update',
      { bookingId },
    );

    if (refundAmount > 0) {
      await notificationService.sendPushNotification(
        booking.customerId,
        'Refund Issued',
        `Booking cancelled by the worker. ₹${refundAmount} refunded to your wallet.`,
        'refund',
        { bookingId, amount: refundAmount },
      );
    }

    // Socket events — emit once per participant's personal room.
    emitToUser(booking.customerId, 'booking_status_update', result.updatedBooking);
    emitToAdmins('admin_refresh', { type: 'cancellation' });

    return { booking: result.updatedBooking, cancellationRecord: result.record };
  },

  // ─── User Queries ─────────────────────────────────────────────────────────

  async getUserCancellationHistory(userId: string, role: string) {
    const where = role === 'CUSTOMER'
      ? { booking: { customerId: userId } }
      : { booking: { workerId: userId } };

    return prisma.cancellationRecord.findMany({
      where,
      include: {
        booking: {
          select: {
            id: true,
            bookingNumber: true,
            serviceName: true,
            serviceCategory: true,
            totalAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async getPendingCancellationFee(userId: string): Promise<number> {
    try {
      const profile = await prisma.customerProfile.findUnique({
        where: { userId },
        select: { pendingCancellationFee: true },
      });
      return profile?.pendingCancellationFee || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Reconcile a customer's pendingCancellationFee against their PENDING
   * cancellation records so the profile aggregate never drifts from the
   * ledger. Runs inside a transaction that has already moved the profile.
   */
  async reconcilePendingFeeTx(tx: any, userId: string) {
    const agg = await tx.cancellationRecord.aggregate({
      where: {
        booking: { customerId: userId },
        feeStatus: CancellationFeeStatus.PENDING,
        feeAmount: { gt: 0 },
      },
      _sum: { feeAmount: true },
    });
    const sum = agg._sum.feeAmount || 0;
    await tx.customerProfile.update({
      where: { userId },
      data: { pendingCancellationFee: sum },
    });
  },

  // ─── Admin Methods ────────────────────────────────────────────────────────

  async adminGetCancellationRecords(page = 1, limit = 20, filters: any = {}) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters.feeStatus) where.feeStatus = filters.feeStatus;
    if (filters.cancelledBy) where.cancelledBy = filters.cancelledBy;

    const [records, total] = await Promise.all([
      prisma.cancellationRecord.findMany({
        skip,
        take: limit,
        where,
        include: {
          booking: {
            select: {
              id: true,
              bookingNumber: true,
              serviceName: true,
              totalAmount: true,
              customer: { select: { id: true, name: true } },
              worker: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cancellationRecord.count({ where }),
    ]);

    return { records, total, page, limit };
  },

  async adminWaiveFee(recordId: string, adminId: string, reason: string = 'Admin waived', req?: Request) {
    const record = await prisma.cancellationRecord.findUnique({
      where: { id: recordId },
      include: { booking: { select: { customerId: true } } },
    });
    if (!record) throw new Error('Cancellation record not found');
    if (record.feeStatus !== CancellationFeeStatus.PENDING) throw new Error('Fee is not in PENDING status');
    if (record.feeAmount <= 0) throw new Error('No fee to waive');

    await prisma.$transaction(async (tx) => {
      await tx.cancellationRecord.update({
        where: { id: recordId },
        data: {
          feeStatus: CancellationFeeStatus.WAIVED,
          feeWaivedBy: adminId,
          feeWaivedReason: reason,
        },
      });

      // Decrement the pending fee on customer profile
      await tx.customerProfile.update({
        where: { userId: record.booking.customerId },
        data: { pendingCancellationFee: { decrement: record.feeAmount } },
      });

      // Heal any drift between the profile aggregate and the records.
      await this.reconcilePendingFeeTx(tx, record.booking.customerId);

      await createAuditLog(tx, req, {
        userId: adminId,
        action: 'CANCELLATION_FEE_WAIVED',
        resource: 'CancellationRecord',
        resourceId: recordId,
        newValue: { feeAmount: record.feeAmount, reason },
      });
    });

    return prisma.cancellationRecord.findUnique({ where: { id: recordId } });
  },

  async adminRefundFee(recordId: string, adminId: string, req?: Request) {
    const record = await prisma.cancellationRecord.findUnique({
      where: { id: recordId },
      include: { booking: { select: { customerId: true } } },
    });
    if (!record) throw new Error('Cancellation record not found');
    if (record.feeStatus !== CancellationFeeStatus.PAID && record.feeStatus !== CancellationFeeStatus.PENDING) {
      throw new Error('Fee cannot be refunded');
    }
    if (record.feeAmount <= 0) throw new Error('No fee to refund');

    await prisma.$transaction(async (tx) => {
      await tx.cancellationRecord.update({
        where: { id: recordId },
        data: {
          feeStatus: CancellationFeeStatus.REFUNDED,
          feeRefundedBy: adminId,
          feeRefundedAt: new Date(),
        },
      });

      if (record.feeStatus === CancellationFeeStatus.PENDING) {
        // Money was never collected — just clear the pending liability.
        await tx.customerProfile.update({
          where: { userId: record.booking.customerId },
          data: { pendingCancellationFee: { decrement: record.feeAmount } },
        });
      } else {
        // PAID — the fee was actually collected; return the money to the wallet.
        await tx.customerProfile.update({
          where: { userId: record.booking.customerId },
          data: { walletBalance: { increment: record.feeAmount } },
        });
        await tx.transaction.create({
          data: {
            userId: record.booking.customerId,
            bookingId: record.bookingId,
            type: 'CANCELLATION_REFUND',
            amount: record.feeAmount,
            description: `Refund of cancellation fee (₹${record.feeAmount})`,
            status: 'completed',
            reference: recordId,
            idempotencyKey: `cancel:refund:${recordId}`,
          },
        }).catch(() => {});
      }

      // Heal any drift between the profile aggregate and the records.
      await this.reconcilePendingFeeTx(tx, record.booking.customerId);

      await createAuditLog(tx, req, {
        userId: adminId,
        action: 'CANCELLATION_FEE_REFUNDED',
        resource: 'CancellationRecord',
        resourceId: recordId,
        newValue: { feeAmount: record.feeAmount },
      });
    });

    return prisma.cancellationRecord.findUnique({ where: { id: recordId } });
  },

  async getCancellationStats() {
    const [
      totalCancellations,
      byReason,
      byFeeStatus,
      byPlan,
      totalFeeRevenue,
      topCancellers,
    ] = await Promise.all([
      prisma.cancellationRecord.count(),
      prisma.cancellationRecord.groupBy({
        by: ['reasonCategory'],
        _count: true,
        orderBy: { _count: { reasonCategory: 'desc' } },
      }),
      prisma.cancellationRecord.groupBy({
        by: ['feeStatus'],
        _count: true,
      }),
      prisma.cancellationRecord.groupBy({
        by: ['customerPlan'],
        _count: true,
      }),
      prisma.cancellationRecord.aggregate({
        where: { feeStatus: { in: [CancellationFeeStatus.PAID, CancellationFeeStatus.PENDING] } },
        _sum: { feeAmount: true },
      }),
      prisma.cancellationRecord.groupBy({
        by: ['cancelledBy'],
        _count: true,
        orderBy: { _count: { cancelledBy: 'desc' } },
      }),
    ]);

    return {
      totalCancellations,
      byReason,
      byFeeStatus,
      byPlan,
      totalFeeRevenue: totalFeeRevenue._sum.feeAmount || 0,
      topCancellers,
    };
  },

 /**
 * Collect pending cancellation fee after a successful payment.
 * Called from payment verification flow.
 */
  async collectPendingFee(userId: string, bookingId: string, paymentAmount: number): Promise<number> {
    const pendingFee = await this.getPendingCancellationFee(userId);
    if (pendingFee <= 0) return 0;

    const collectAmount = Math.min(pendingFee, paymentAmount);
    if (collectAmount <= 0) return 0;

    await prisma.$transaction(async (tx) => {
      // FIFO: apply the collected amount across the oldest PENDING fees first.
      // A record becomes PAID only when fully covered; a partially covered
      // record has its remaining feeAmount reduced so the records always agree
      // with the profile aggregate.
      let remaining = collectAmount;
      const pendingRecords = await tx.cancellationRecord.findMany({
        where: {
          booking: { customerId: userId },
          feeStatus: CancellationFeeStatus.PENDING,
          feeAmount: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const rec of pendingRecords) {
        if (remaining <= 0) break;
        if (remaining >= rec.feeAmount) {
          remaining -= rec.feeAmount;
          await tx.cancellationRecord.update({
            where: { id: rec.id },
            data: { feeStatus: CancellationFeeStatus.PAID, feeCollectedAt: new Date() },
          });
        } else {
          await tx.cancellationRecord.update({
            where: { id: rec.id },
            data: { feeAmount: rec.feeAmount - remaining },
          });
          remaining = 0;
        }
      }

      // Heal any drift: profile.pendingCancellationFee = sum of PENDING fees.
      await this.reconcilePendingFeeTx(tx, userId);

      // Create collection transaction (idempotent per booking payment).
      await tx.transaction.create({
        data: {
          userId,
          bookingId,
          type: 'CANCELLATION_RECOVERY',
          amount: collectAmount,
          description: `Previous cancellation fee collection (₹${collectAmount})`,
          status: 'completed',
          idempotencyKey: `cancel:recover:${bookingId}`,
        },
      }).catch(() => {});
    });

    return collectAmount;
  },

  async initiateCancellation(bookingId: string, userId: string, role: string, reasonCategory: string, cancelReason?: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });
    if (!booking) throw new Error('Booking not found');
    
    if (role === 'WORKER' && booking.workerId !== userId) throw new Error('Access denied');
    if (role === 'CUSTOMER' && booking.customerId !== userId) throw new Error('Access denied');

    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.DISPUTED) {
      throw new Error('Booking cannot be cancelled at this stage');
    }

    if (role === 'CUSTOMER') {
      return this.processCustomerCancellation(bookingId, userId, reasonCategory, cancelReason);
    }

    // Role is WORKER
    const beforeOnTheWay = !isPostOnTheWay(booking);

    if (beforeOnTheWay) {
      // Free for both sides (Rule 1); reason is optional before OMW.
      return this.processWorkerCancellation(bookingId, userId, cancelReason, reasonCategory);
    }

    // After ON_THE_WAY the reason is MANDATORY and must come from the
    // predefined set (Rule 3). OTHER additionally requires a description.
    validateWorkerCancellationReason(reasonCategory, cancelReason);

    if (reasonCategory === 'CUSTOMER_REQUESTED') {
      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          cancelRequestBy: 'WORKER',
          cancelRequestReason: reasonCategory,
          cancelRequestStatus: 'PENDING_CUSTOMER',
          cancelRequestAt: new Date()
        }
      });
      emitToUser(booking.customerId, 'booking_status_update', updated);
      emitToUser(booking.workerId, 'booking_status_update', updated);
      await notificationService.sendPushNotification(booking.customerId, 'Cancellation Request', 'Your worker says you requested to cancel.', 'cancel_request', { bookingId });
      return { booking: updated, requires_confirmation: true };
    }

    if (reasonCategory === 'CUSTOMER_UNREACHABLE') {
      if (booking.cancelRequestStatus === 'PENDING_CUSTOMER') {
        const diff = Date.now() - new Date(booking.cancelRequestAt!).getTime();
        if (diff < 5 * 60 * 1000) {
          throw new Error('You must wait 5 minutes before marking customer as unreachable.');
        }
        return this.processWorkerCancellation(bookingId, userId, cancelReason, reasonCategory);
      } else {
        const updated = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            cancelRequestBy: 'WORKER',
            cancelRequestReason: 'CUSTOMER_UNREACHABLE',
            cancelRequestStatus: 'PENDING_CUSTOMER',
            cancelRequestAt: new Date()
          }
        });
        emitToUser(booking.customerId, 'booking_status_update', updated);
        emitToUser(booking.workerId, 'booking_status_update', updated);
        return { booking: updated, requires_confirmation: true, waiting: true };
      }
    }
    
    return this.processWorkerCancellation(bookingId, userId, cancelReason, reasonCategory);
  },

  async confirmCancellationRequest(bookingId: string, customerId: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.customerId !== customerId) throw new Error('Not found');
    if (booking.cancelRequestStatus !== 'PENDING_CUSTOMER') throw new Error('No pending request');

    // The request was initiated by the worker (cancelRequestBy === 'WORKER'), so this is a
    // worker-initiated cancellation. Per policy, a worker cancelling after "On My Way" is free
    // for the customer: no fee, no wallet deduction, no compensation. Never route this through
    // processCustomerCancellation, which would charge the customer and pay worker compensation.
    return this.processWorkerCancellation(bookingId, booking.workerId, 'Confirmed by customer', 'CUSTOMER_REQUESTED');
  },

  async denyCancellationRequest(bookingId: string, customerId: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.customerId !== customerId) throw new Error('Not found');
    if (booking.cancelRequestStatus !== 'PENDING_CUSTOMER') throw new Error('No pending request');

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        cancelRequestStatus: 'CUSTOMER_DENIED',
        updatedAt: new Date()
      }
    });
    emitToUser(booking.workerId, 'booking_status_update', updated);
    emitToUser(booking.customerId, 'booking_status_update', updated);
    return { booking: updated };
  },

  /**
   * Cancel preview for the UI — server-computed fee / refund / reason-required
   * info so the client never hardcodes amounts. Read-only, no state changes.
   */
  async previewCancellation(bookingId: string, userId: string, role: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');
    if (role === 'WORKER' && booking.workerId !== userId) throw new Error('Access denied');
    if (role === 'CUSTOMER' && booking.customerId !== userId) throw new Error('Access denied');

    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.DISPUTED) {
      throw new Error('Booking cannot be cancelled at this stage');
    }

    const postOnTheWay = isPostOnTheWay(booking);

    if (role === 'CUSTOMER') {
      const customerPlan = await getSubscriptionPlanAtTime(userId);
      const { feeAmount, workerCompensation, reason } = await computeCustomerCancellationFee(booking, customerPlan, '');
      return {
        postOnTheWay,
        customerPlan,
        fee: feeAmount,
        feeReason: reason,
        isFree: feeAmount <= 0,
        workerCompensation,
      };
    }

    // Worker view: post-OMW cancels require a reason and refund the customer
    // in full if the booking was already paid.
    return {
      postOnTheWay,
      reasonRequired: postOnTheWay,
      refundIfCancelled:
        booking.paymentStatus === PaymentStatus.PAID && (booking.totalAmount || 0) > 0
          ? booking.totalAmount
          : 0,
    };
  }
};
