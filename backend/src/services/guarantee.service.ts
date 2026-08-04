import { prisma } from '../config/prisma';
import { GuaranteeClaimStatus } from '@prisma/client';
import { linkMediaToScope } from './media.service';

const DEFAULT_WARRANTY_MONTHS = 3;
const MAX_EVIDENCE_IMAGES = 6;

async function getConfig(key: string, fallback: string): Promise<string> {
  try {
    const cfg = await prisma.marketConfig.findUnique({ where: { key } });
    return cfg?.value || fallback;
  } catch {
    return fallback;
  }
}

/** Admin-configurable warranty length in months (0 disables warranty). */
export async function getWarrantyMonths(): Promise<number> {
  const raw = await getConfig('WARRANTY_MONTHS', String(DEFAULT_WARRANTY_MONTHS));
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_WARRANTY_MONTHS;
}

/**
 * Stamp the warranty window onto a booking once it is completed. Only applies
 * to bookings marked warranty-eligible (warrantyEligible). No-op if the admin
 * has set WARRANTY_MONTHS to 0.
 */
export async function applyWarranty(bookingId: string, completedAt: Date): Promise<void> {
  const months = await getWarrantyMonths();
  if (months <= 0) return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { warrantyEligible: true },
  });
  if (!booking?.warrantyEligible) return;

  const expiresAt = new Date(completedAt.getTime());
  expiresAt.setMonth(expiresAt.getMonth() + months);
  await prisma.booking.update({
    where: { id: bookingId },
    data: { warrantyExpiresAt: expiresAt },
  });
}

export const guaranteeService = {
  /**
   * Customer raises a claim on a completed booking they own, within the
   * warranty window. Evidence is photo URLs (worker before/after job photos
   * plus any customer-uploaded images).
   */
  async createClaim(
    customerId: string,
    input: { bookingId: string; reason: string; evidence?: string[] },
  ) {
    const { bookingId, reason, evidence = [] } = input;
    if (!bookingId) throw new Error('Booking is required');
    if (!reason || !reason.trim()) throw new Error('Please describe the problem');

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true, customerId: true, workerId: true, status: true,
        warrantyEligible: true, warrantyExpiresAt: true,
      },
    });
    if (!booking) throw new Error('Booking not found');
    if (booking.customerId !== customerId) throw new Error('Access denied');
    if (booking.status !== 'COMPLETED') throw new Error('Only completed bookings are covered by warranty');
    if (!booking.warrantyEligible || !booking.warrantyExpiresAt) {
      throw new Error('This booking is not covered by warranty');
    }
    if (booking.warrantyExpiresAt < new Date()) throw new Error('The warranty for this booking has expired');

    const openClaim = await prisma.guaranteeClaim.findFirst({
      where: { bookingId, status: GuaranteeClaimStatus.PENDING },
    });
    if (openClaim) throw new Error('A claim for this booking is already under review');

    const workerProfile = await prisma.workerProfile.findUnique({
      where: { userId: booking.workerId },
      select: { id: true },
    });
    if (!workerProfile) throw new Error('Worker profile not found');

    const claim = await prisma.guaranteeClaim.create({
      data: {
        bookingId,
        customerId,
        workerProfileId: workerProfile.id,
        reason: reason.trim(),
        evidence: evidence.slice(0, MAX_EVIDENCE_IMAGES),
        status: GuaranteeClaimStatus.PENDING,
      },
      include: {
        booking: {
          select: {
            id: true, bookingNumber: true, serviceName: true, completedAt: true,
            warrantyExpiresAt: true,
          },
        },
      },
    });

    // Link claim evidence to the booking so the orphan cleanup never deletes
    // evidence referenced by a live claim.
    await linkMediaToScope(evidence, { bookingId }).catch(() => {});

    return claim;
  },

  /** Completed, in-warranty bookings a customer owns, with their job photos. */
  async listEligibleBookings(customerId: string) {
    const now = new Date();
    return prisma.booking.findMany({
      where: {
        customerId,
        status: 'COMPLETED',
        warrantyEligible: true,
        warrantyExpiresAt: { gt: now },
      },
      select: {
        id: true, bookingNumber: true, serviceName: true, serviceCategory: true,
        completedAt: true, warrantyExpiresAt: true,
        worker: { select: { id: true, name: true } },
        jobPhotos: { select: { id: true, beforeUrl: true, afterUrl: true, caption: true } },
        guaranteeClaims: { select: { id: true, status: true, reason: true, createdAt: true } },
      },
      orderBy: { completedAt: 'desc' },
    });
  },

  /** All claims a customer has raised. */
  async listClaimsForCustomer(customerId: string) {
    return prisma.guaranteeClaim.findMany({
      where: { customerId },
      include: {
        booking: {
          select: {
            id: true, bookingNumber: true, serviceName: true, completedAt: true,
            warrantyExpiresAt: true,
            jobPhotos: { select: { id: true, beforeUrl: true, afterUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** A claim is visible to its customer, the booking's worker, or admins. */
  async getClaimForUser(claimId: string, userId: string, role: string) {
    const claim = await prisma.guaranteeClaim.findUnique({
      where: { id: claimId },
      include: {
        booking: {
          select: {
            id: true, bookingNumber: true, serviceName: true, completedAt: true,
            warrantyExpiresAt: true, customerId: true, workerId: true,
            jobPhotos: { select: { id: true, beforeUrl: true, afterUrl: true, caption: true } },
          },
        },
      },
    });
    if (!claim) throw new Error('Claim not found');
    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    const isOwner = claim.customerId === userId || claim.booking.workerId === userId;
    if (!isAdmin && !isOwner) throw new Error('Access denied');
    return claim;
  },

  /** Admin listing with an optional status filter. */
  async listClaimsForAdmin(status?: string) {
    const where = status ? { status: status as GuaranteeClaimStatus } : {};
    return prisma.guaranteeClaim.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        booking: {
          select: {
            id: true, bookingNumber: true, serviceName: true, completedAt: true,
            warrantyExpiresAt: true,
          },
        },
        workerProfile: { select: { id: true, user: { select: { id: true, name: true, phone: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Admin decides a claim. Idempotent — resolved claims can't be re-decided. */
  async resolveClaim(claimId: string, decision: string, note: string | undefined, adminId: string) {
    if (decision !== GuaranteeClaimStatus.APPROVED && decision !== GuaranteeClaimStatus.REJECTED) {
      throw new Error('Decision must be APPROVED or REJECTED');
    }
    const claim = await prisma.guaranteeClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new Error('Claim not found');
    if (claim.status !== GuaranteeClaimStatus.PENDING) throw new Error('Claim is already resolved');

    return prisma.guaranteeClaim.update({
      where: { id: claimId },
      data: {
        status: decision,
        resolutionNote: note || null,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
    });
  },

  /** Worker submits before/after completion photos — evidence for guarantee claims. */
  async recordJobPhotos(
    workerId: string,
    bookingId: string,
    input: { beforeUrl: string; afterUrl: string; caption?: string },
  ) {
    if (!input.beforeUrl || !input.afterUrl) throw new Error('Before and after photos are required');
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { workerId: true },
    });
    if (!booking) throw new Error('Booking not found');
    if (booking.workerId !== workerId) throw new Error('Only the assigned worker can submit job photos');

    const workerProfile = await prisma.workerProfile.findUnique({
      where: { userId: workerId },
      select: { id: true },
    });
    if (!workerProfile) throw new Error('Worker profile not found');

    const photo = await prisma.jobPhoto.create({
      data: {
        workerProfileId: workerProfile.id,
        bookingId,
        beforeUrl: input.beforeUrl,
        afterUrl: input.afterUrl,
        caption: input.caption || null,
      },
    });

    // Link the before/after images to the booking so the orphan cleanup never
    // deletes job photos referenced by a booking/claim.
    await linkMediaToScope([input.beforeUrl, input.afterUrl], { bookingId }).catch(() => {});

    return photo;
  },
};
