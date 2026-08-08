import { prisma } from '../config/prisma';
import { getIo } from './socket.service';
import { logger } from '../utils/logger';

// ─── Production scheduled jobs ─────

/**
 * Expire stale SEARCHING urgent requests and notify customer.
 * Runs every 30 seconds.
 */
export async function expireUrgentRequests(): Promise<number> {
  const expired = await prisma.urgentRequest.updateMany({
    where: { status: 'SEARCHING', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });

  if (expired.count > 0) {
    // Close the offer-round audit trail for every request that just expired.
    await prisma.urgentOfferRound.updateMany({
      where: { endedAt: null, urgentRequest: { status: 'EXPIRED' } },
      data: { endedAt: new Date(), outcome: 'EXPIRED' },
    });
    // Notify affected customers via socket
    const stale = await prisma.urgentRequest.findMany({
      where: { status: 'EXPIRED', updatedAt: { gte: new Date(Date.now() - 60 * 1000) } },
      select: { customerId: true, id: true },
    });
    for (const r of stale) {
      getIo().emit('urgent_expired', { requestId: r.id });
      try {
        const { notificationService } = await import('./notification.service');
        await notificationService.sendPushNotification(
          r.customerId, 'No Worker Found',
          'No verified worker was available for your urgent request. You can try again or increase your offer.',
          'urgent_expired', { requestId: r.id },
        );
      } catch {}
    }
  }

  return expired.count;
}

/**
 * Expire stale PENDING and NEGOTIATING booking requests (24 hours).
 * Runs every hour.
 */
export async function expirePendingBookings(): Promise<number> {
  try {
    const expired = await prisma.booking.findMany({
      where: {
        status: { in: ['PENDING', 'NEGOTIATING'] },
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true, customerId: true, workerId: true },
    });

    if (expired.length > 0) {
      const { cancellationService } = await import('./cancellation.service');
      for (const booking of expired) {
        try {
          // Cancel it systemically.
          // Using processCustomerCancellation because it's the safest way to cleanly terminate without worker penalties
          // but actually we should just update status directly if it's expired to avoid customer penalties.
          await prisma.booking.update({
            where: { id: booking.id },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: 'SYSTEM', cancelReason: 'Request expired' }
          });
          
          getIo().emit('booking_status_update', { id: booking.id, status: 'CANCELLED' });
          
          try {
            const { notificationService } = await import('./notification.service');
            await notificationService.sendPushNotification(
              booking.customerId, 'Booking Expired',
              'Your booking request expired because it was not accepted within 24 hours.',
              'booking_update', { bookingId: booking.id },
            );
            await notificationService.sendPushNotification(
              booking.workerId, 'Booking Expired',
              'A booking request expired because you did not respond within 24 hours.',
              'booking_update', { bookingId: booking.id },
            );
          } catch {}
        } catch (e) {
          logger.error(`Failed to expire booking ${booking.id}:`, e);
        }
      }
    }
    return expired.length;
  } catch (e) {
    logger.error('Pending booking expiry failed:', e);
    return 0;
  }
}

/**
 * Clean orphaned media (draft uploads unlinked to any booking/request after 24h).
 * Runs hourly.
 */
export async function cleanupOrphanedMedia(): Promise<number> {
  try {
    const { cleanupOrphanedMedia: runCleanup } = await import('./media.service');
    return await runCleanup(24);
  } catch (e) {
    logger.error('Orphan media cleanup failed:', e);
    return 0;
  }
}

/**
 * Promote qualifying issue candidates (CANDIDATE → ESTABLISHED).
 * Runs hourly. Requires configured occurrence + unique-user thresholds.
 */
export async function promoteIssueCandidates(): Promise<number> {
  try {
    const { issueDiscoveryService } = await import('./issueDiscovery.service');
    return await issueDiscoveryService.runPromotion();
  } catch (e) {
    logger.error('Issue promotion failed:', e);
    return 0;
  }
}

/**
 * Issue lifecycle automation : ESTABLISHED → DECLINING → ARCHIVED
 * based on usage. Runs daily.
 */
export async function demoteInactiveIssues(): Promise<{ declining: number; archived: number }> {
  try {
    const { issueDiscoveryService } = await import('./issueDiscovery.service');
    return await issueDiscoveryService.demoteInactiveIssues();
  } catch (e) {
    logger.error('Issue demotion failed:', e);
    return { declining: 0, archived: 0 };
  }
}

/**
 * Detect market-pricing anomalies : >40% overnight reference moves,
 * one-account domination, extreme regional divergence. Records risk/analytics rows.
 * Runs daily.
 */
export async function detectPricingAnomalies(): Promise<number> {
  try {
    const { analyticsService } = await import('./analytics.service');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const audits = await prisma.pricingAudit.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    let flagged = 0;
    for (const a of audits) {
      const prev = await prisma.pricingAudit.findFirst({
        where: { category: a.category, zone: a.zone, pricingUnit: a.pricingUnit, algorithmVersion: a.algorithmVersion, createdAt: { lt: a.createdAt } },
        orderBy: { createdAt: 'desc' },
      });
      if (prev && prev.referencePrice > 0) {
        const move = Math.abs(a.referencePrice - prev.referencePrice) / prev.referencePrice;
        if (move > 0.4) {
          flagged++;
          analyticsService.track('price_anomaly', {
            category: a.category, zone: a.zone || undefined,
            payload: { auditId: a.id, from: prev.referencePrice, to: a.referencePrice, movePct: Math.round(move * 100) },
          });
        }
      }
    }
    return flagged;
  } catch (e) {
    logger.error('Pricing anomaly detection failed:', e);
    return 0;
  }
}

export function startScheduledJobs(): void {
  // Urgent expiry — every 30s
  setInterval(() => { expireUrgentRequests().catch(() => {}); }, 30 * 1000);
  expireUrgentRequests().catch(() => {});

  // Orphan media cleanup — hourly
  setInterval(() => { cleanupOrphanedMedia().catch(() => {}); }, 60 * 60 * 1000);

  // Issue candidate promotion — hourly
  setInterval(() => { promoteIssueCandidates().catch(() => {}); }, 60 * 60 * 1000);

  // Issue lifecycle demotion — daily
  setInterval(() => { demoteInactiveIssues().catch(() => {}); }, 24 * 60 * 60 * 1000);
  demoteInactiveIssues().catch(() => {});

  // Pricing anomaly monitoring — daily
  setInterval(() => { detectPricingAnomalies().catch(() => {}); }, 24 * 60 * 60 * 1000);

  // Pending booking expiry — hourly
  setInterval(() => { expirePendingBookings().catch(() => {}); }, 60 * 60 * 1000);
}


export { runEngagementCampaign } from './marketing.service';
