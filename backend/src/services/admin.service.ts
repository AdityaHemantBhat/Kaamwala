import { Request } from 'express';
import { prisma } from '../config/prisma';
import { createAuditLog } from '../utils/audit';
import { payoutService } from './payout.service';

export const adminService = {
  async getDashboardStats() {
    const [totalUsers, totalWorkers, totalCustomers, activeBookings, pendingVerifications, pendingWithdrawals, openTickets, revenue, penalties, subscriptions] = await Promise.all([
      prisma.user.count(),
      prisma.workerProfile.count(),
      prisma.customerProfile.count(),
      prisma.booking.count({ where: { status: { in: ['IN_PROGRESS', 'ON_THE_WAY', 'ACCEPTED'] } } }),
      prisma.workerProfile.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.withdrawalRequest.count({ where: { status: 'pending' } }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.booking.aggregate({ where: { status: 'COMPLETED' }, _sum: { platformFee: true } }),
      prisma.transaction.aggregate({ where: { type: 'PENALTY', status: 'completed' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'SUBSCRIPTION_PAYMENT', status: 'completed' }, _sum: { amount: true } }),
    ]);

    const bookingRevenue = revenue._sum.platformFee || 0;
    const penaltyRevenue = penalties._sum.amount || 0;
    const subscriptionRevenue = subscriptions._sum.amount || 0;

    return { totalUsers, totalWorkers, totalCustomers, activeBookings, pendingVerifications, pendingWithdrawals, openTickets, revenue: bookingRevenue + penaltyRevenue + subscriptionRevenue };
  },

  async getAllUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip, take: limit,
        select: { id: true, name: true, phone: true, role: true, isActive: true, isBanned: true, createdAt: true, referralCode: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);
    return { users, total, page, limit };
  },

  async getPendingVerifications() {
    return prisma.workerProfile.findMany({
      where: { 
        verificationStatus: { in: ['UNVERIFIED', 'PENDING'] },
        user: { role: 'WORKER' }
      },
      select: { id: true, userId: true, verificationStatus: true, category: true, city: true, experienceYears: true, hourlyRate: true, createdAt: true, user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async verifyWorker(workerId: string, status: string, note?: string) {
    // On VERIFIED approval, grant urgent eligibility — verified + eligible only.
    const isVerified = status === 'VERIFIED';
    return prisma.workerProfile.update({
      where: { id: workerId },
      data: {
        verificationStatus: status as any,
        verificationNote: note,
        verifiedAt: isVerified ? new Date() : undefined,
        isUrgentEligible: isVerified ? true : undefined,
        urgentEligibilityReason: isVerified ? 'Verified by admin' : undefined,
      },
      select: { id: true, verificationStatus: true, userId: true },
    });
  },

  async toggleUrgentEligibility(workerId: string, eligible: boolean, reason: string, adminId: string, req?: Request) {
    const updated = await prisma.workerProfile.update({
      where: { id: workerId },
      data: { isUrgentEligible: eligible, urgentEligibilityReason: reason },
    });
    await createAuditLog(prisma, req, {
      userId: adminId, action: 'URGENT_ELIGIBILITY_TOGGLED', resource: 'WorkerProfile', resourceId: workerId, newValue: { eligible, reason },
    });
    return updated;
  },

  async getWorkerDetails(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, phone: true, email: true, isActive: true,
        workerProfile: {
          select: { id: true, category: true, city: true, hourlyRate: true, rating: true, completedJobs: true, totalEarned: true, verificationStatus: true, isGuaranteed: true, upiId: true, walletBalance: true },
        },
      },
    });
    return user;
  },

  async getAllBookings(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        skip, take: limit,
        select: { id: true, bookingNumber: true, status: true, paymentStatus: true, totalAmount: true, serviceName: true, serviceCategory: true, scheduledAt: true, createdAt: true, customer: { select: { name: true } }, worker: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.count(),
    ]);
    return { bookings, total, page, limit };
  },

  async getWithdrawals(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return prisma.withdrawalRequest.findMany({
      where,
      select: {
        id: true, amount: true, method: true, upiId: true, bankAccount: true, status: true, createdAt: true,
        workerProfile: { select: { id: true, user: { select: { name: true, phone: true } } } },
        customerProfile: { select: { id: true, user: { select: { name: true, phone: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  },

  async processWithdrawal(id: string, status: string, notes?: string) {
    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id },
      include: {
        workerProfile: { include: { user: true } },
        customerProfile: { include: { user: true } },
      },
    });
    if (!withdrawal) throw new Error('Withdrawal not found');
    if (withdrawal.status !== 'pending') throw new Error('Withdrawal already processed');

    // A withdrawal belongs to exactly one wallet (worker or customer).
    const isWorker = !!withdrawal.workerProfileId;
    const owner = isWorker ? withdrawal.workerProfile : withdrawal.customerProfile;
    if (!owner?.user) throw new Error('Withdrawal owner not found');
    const ledgerKey = `withdraw:${withdrawal.id}`;

    return prisma.$transaction(async (tx) => {
      if (status === 'rejected') {
        // Refund the wallet (worker or customer) — same transactional debit that
        // created the withdrawal is reversed.
        if (isWorker) {
          await tx.workerProfile.update({
            where: { id: withdrawal.workerProfileId! },
            data: { walletBalance: { increment: withdrawal.amount } },
          });
        } else {
          await tx.customerProfile.update({
            where: { id: withdrawal.customerProfileId! },
            data: { walletBalance: { increment: withdrawal.amount } },
          });
        }
        // Create refund transaction log
        await tx.transaction.create({
          data: {
            userId: owner.userId,
            type: 'WALLET_CREDIT',
            amount: withdrawal.amount,
            description: `Refund for rejected withdrawal`,
            status: 'completed',
            idempotencyKey: `withdraw:refund:${withdrawal.id}`,
          }
        });
        // Close out the original pending debit so the ledger never shows an
        // eternal pending WALLET_WITHDRAWAL.
        await tx.transaction.updateMany({
          where: { idempotencyKey: ledgerKey },
          data: { status: 'failed' },
        });
      }

      if (status === 'approved') {
        // The destination depends on the method: UPI needs a UPI id, BANK needs
        // account + IFSC. (The old code threw "no UPI ID" even for BANK
        // withdrawals, which could never be approved.)
        const upiId = withdrawal.upiId;
        if (withdrawal.method === 'UPI' && !upiId) throw new Error('UPI ID missing for UPI withdrawal');
        if (withdrawal.method === 'BANK' && (!withdrawal.bankAccount || !withdrawal.ifscCode)) {
          throw new Error('Bank details missing for bank withdrawal');
        }
        if (!upiId) throw new Error('UPI ID missing for withdrawal');

        // This will throw if the API fails, aborting the transaction.
        // Uses the owner's REAL phone + a stable per-user beneficiary id.
        const payoutResult = await payoutService.processPayout({
          transferId: withdrawal.id, // idempotent: retries reuse the withdrawal id
          amount: withdrawal.amount,
          upiId,
          name: owner.user.name || 'Worker Partner',
          phone: owner.user.phone || undefined,
          email: `${owner.user.phone || 'user'}@kaamwala.app`,
          beneficiaryKey: owner.userId,
        });

        // Log the successful transfer in notes if we got a reference
        notes = notes ? `${notes} | Ref: ${payoutResult.referenceId}` : `Payout Ref: ${payoutResult.referenceId}`;

        // Close out the original pending debit as completed with the payout ref.
        await tx.transaction.updateMany({
          where: { idempotencyKey: ledgerKey },
          data: { status: 'completed', reference: payoutResult.referenceId },
        });
      }

      return tx.withdrawalRequest.update({
        where: { id },
        data: { status, adminNotes: notes, processedAt: new Date() },
      });
    });
  },

  async getTickets(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return prisma.supportTicket.findMany({
      where,
      select: { 
        id: true, subject: true, description: true, status: true, priority: true, createdAt: true, 
        user: { 
          select: { 
            id: true, name: true, phone: true, role: true,
            subscription: { select: { plan: true } },
            workerSubscription: { select: { plan: true } },
            workerProfile: { select: { completedJobs: true, rating: true, verificationStatus: true } }
          } 
        } 
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  },

  async getRevenueStats() {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [
      total, monthly, byCategory,
      penaltyTotal, penaltyMonthly, penaltyCount,
      subTotal, subMonthly,
      activeCustomerSubs, activeWorkerSubs,
    ] = await Promise.all([
      prisma.booking.aggregate({ where: { status: 'COMPLETED' }, _sum: { platformFee: true, totalAmount: true } }),
      prisma.booking.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: monthStart } }, _sum: { platformFee: true, totalAmount: true } }),
      prisma.booking.groupBy({ by: ['serviceCategory'], where: { status: 'COMPLETED' }, _sum: { platformFee: true }, orderBy: { _sum: { platformFee: 'desc' } }, take: 5 }),
      // Penalties
      prisma.transaction.aggregate({ where: { type: 'PENALTY', status: 'completed' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'PENALTY', status: 'completed', createdAt: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.transaction.count({ where: { type: 'PENALTY', status: 'completed' } }),
      // Subscription payments
      prisma.transaction.aggregate({ where: { type: 'SUBSCRIPTION_PAYMENT', status: 'completed' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'SUBSCRIPTION_PAYMENT', status: 'completed', createdAt: { gte: monthStart } }, _sum: { amount: true } }),
      // Active subscriber counts
      prisma.userSubscription.count({ where: { status: 'active', plan: { not: 'BASIC' } } }),
      prisma.workerSubscription.count({ where: { status: 'active', plan: { not: 'FREE' } } }),
    ]);

    const platformFeeTotal = total._sum.platformFee || 0;
    const platformFeeMonthly = monthly._sum.platformFee || 0;
    const penaltyRevTotal = Math.abs(penaltyTotal._sum.amount || 0);
    const penaltyRevMonthly = Math.abs(penaltyMonthly._sum.amount || 0);
    const subRevTotal = subTotal._sum.amount || 0;
    const subRevMonthly = subMonthly._sum.amount || 0;

    return {
      totalRevenue: platformFeeTotal + penaltyRevTotal + subRevTotal,
      totalGMV: total._sum.totalAmount || 0,
      monthlyRevenue: platformFeeMonthly + penaltyRevMonthly + subRevMonthly,
      monthlyFees: monthly._sum.totalAmount || 0,
      topCategories: byCategory.map(c => ({ category: c.serviceCategory, revenue: c._sum.platformFee || 0 })),
      // Revenue breakdown by stream
      breakdown: {
        platformFees:   { total: platformFeeTotal, monthly: platformFeeMonthly },
        subscriptions:  { total: subRevTotal, monthly: subRevMonthly },
        penalties:      { total: penaltyRevTotal, monthly: penaltyRevMonthly, count: penaltyCount },
      },
      // Active subscriber counts
      subscribers: {
        customers: activeCustomerSubs,
        workers: activeWorkerSubs,
      },
    };
  },
};
