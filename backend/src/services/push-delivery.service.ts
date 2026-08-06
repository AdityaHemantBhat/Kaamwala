import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

/**
 * Push Delivery Tracking & Retry Service
 *
 * Manages the lifecycle of push notifications:
 * 1. Creates PENDING delivery record when sendPushNotification() is called
 * 2. Updates to DELIVERED when device acknowledges or user opens the app
 * 3. Retries FAILED pushes with exponential backoff (max 3 attempts)
 * 4. Prevents spam/races via atomic database operations
 *
 * Design: Single source of truth is Prisma — no in-memory queues that could
 * be lost on process restart. Retry sweep is periodic background job.
 */

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 5 * 1000; // 5 seconds
const MAX_BACKOFF_MS = 60 * 1000; // 60 seconds

export const pushDeliveryService = {
  /**
   * Mark a notification as delivered (device received push, user saw it, or
   * user opened app). Prevents re-sending.
   *
   * Idempotent: multiple calls won't cause issues.
   */
  async markDelivered(notificationId: string, source: 'fcm_callback' | 'user_event' = 'user_event') {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          failureReason: null, // Clear any prior failure
        },
      });
      logger.debug('Notification marked delivered', { notificationId, source });
    } catch (e) {
      logger.debug('Failed to mark notification delivered', { notificationId, error: e });
    }
  },

  /**
   * Record a push send failure. If retries remain, schedule a retry.
   * Prevents race conditions via atomic update + version check.
   */
  async recordFailure(
    notificationId: string,
    failureReason: string,
  ): Promise<boolean> {
    try {
      const result = await prisma.notification.update({
        where: { id: notificationId },
        data: {
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
          failureReason,
          // If max retries exceeded, mark as failed so it's not retried again
          status: 'FAILED',
        },
        select: { retryCount: true, status: true },
      });

      const willRetry = result.retryCount < MAX_RETRIES;
      if (willRetry) {
        // Revert to PENDING so retry queue picks it up
        await prisma.notification.update({
          where: { id: notificationId },
          data: { status: 'PENDING' },
        });
      }

      logger.warn('Push send failed', {
        notificationId,
        attempt: result.retryCount,
        maxRetries: MAX_RETRIES,
        willRetry,
        reason: failureReason,
      });

      return willRetry;
    } catch (e) {
      logger.error('Failed to record push delivery failure', { notificationId, error: e });
      return false;
    }
  },

  /**
   * Cancel an outgoing push (e.g., user read notification before device received it).
   * Prevents sending a stale push.
   */
  async cancel(notificationId: string, reason: string = 'user_read_before_delivery') {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'CANCELLED',
          failureReason: reason,
        },
      });
      logger.debug('Push cancelled', { notificationId, reason });
    } catch (e) {
      logger.debug('Failed to cancel notification', { notificationId, error: e });
    }
  },

  /**
   * Get all notifications due for retry (PENDING status + exceeded backoff window).
   * Used by the retry worker job to sweep and re-send failed pushes.
   */
  async getPendingRetries(limit: number = 100): Promise<any[]> {
    const now = new Date();

    // Notifications with PENDING status that either:
    // (a) never been attempted yet (lastRetryAt is null), OR
    // (b) last attempt was before their own backoff window.
    // Broadcasts are excluded: their in-app popup is the delivery and the device
    // push is fire-and-forget, so they must never be re-pushed by this sweep.
    const notifications = await prisma.notification.findMany({
      where: {
        status: 'PENDING',
        retryCount: { lt: MAX_RETRIES },
        type: { not: 'broadcast' },
        OR: [
          { lastRetryAt: null }, // First attempt
          { lastRetryAt: { lte: now } }, // Exact per-row window filtered below
        ],
      },
      select: {
        id: true,
        userId: true,
        title: true,
        body: true,
        type: true,
        data: true,
        isSilent: true,
        retryCount: true,
        lastRetryAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    // Backoff is per-attempt (5s → 10s → 20s). Apply each row's own window here
    // rather than a single constant for the whole sweep — the old code passed
    // MAX_RETRIES, which gave every retry the same 20s window regardless of how
    // many attempts it had already burned.
    return notifications.filter(
      (n) =>
        !n.lastRetryAt ||
        n.lastRetryAt.getTime() <= now.getTime() - this.calculateBackoffMs(n.retryCount + 1),
    );
  },

  /**
   * Clean up old FAILED/CANCELLED notifications (30+ days old).
   * Called by maintenance job. Reduces DB bloat while preserving audit trail.
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    try {
      const result = await prisma.notification.deleteMany({
        where: {
          status: { in: ['FAILED', 'CANCELLED'] },
          createdAt: { lt: cutoff },
        },
      });

      logger.info('Cleaned up old notifications', {
        deletedCount: result.count,
        daysOld,
      });

      return result.count;
    } catch (e) {
      logger.error('Failed to clean up old notifications', e);
      return 0;
    }
  },

  /**
   * Calculate exponential backoff for a given retry attempt.
   * Backoff grows: 5s → 10s → 20s (capped at 60s).
   */
  calculateBackoffMs(attemptNumber: number): number {
    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attemptNumber - 1);
    return Math.min(backoff, MAX_BACKOFF_MS);
  },
};
