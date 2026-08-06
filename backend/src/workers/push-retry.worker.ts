import { notificationService } from '../services/notification.service';
import { pushDeliveryService } from '../services/push-delivery.service';
import { logger } from '../utils/logger';

/**
 * Background worker for push notification delivery retry and maintenance.
 *
 * Runs periodically to:
 * 1. Retry PENDING notifications that have failed
 * 2. Clean up old FAILED/CANCELLED notifications
 *
 * Production: integrate into Bull, Temporal, or Kubernetes CronJob.
 * For now, can be triggered via endpoint or scheduled internally.
 */

export async function pushRetryWorker() {
  try {
    logger.info('Starting push notification retry worker');

    // Retry failed pushes with exponential backoff
    const retriedCount = await notificationService.retryFailedPushes(100);
    logger.info('Push retry sweep completed', { retriedCount });

    // Clean up old notifications (30+ days old)
    const cleanedCount = await pushDeliveryService.cleanupOldNotifications(30);
    logger.info('Old notifications cleanup completed', { cleanedCount });

    return {
      success: true,
      retriedCount,
      cleanedCount,
    };
  } catch (e) {
    logger.error('Push retry worker failed', e);
    return {
      success: false,
      error: String(e),
    };
  }
}

/**
 * Simple scheduler: runs the push retry worker every 30 seconds.
 * For production, use a dedicated scheduler (Bull, node-cron, Kubernetes, etc).
 *
 * Usage: call this once at server startup:
 *   schedulePushRetryWorker();
 */
let pushRetryInterval: NodeJS.Timeout | null = null;
let isSweepRunning = false;

export function schedulePushRetryWorker(intervalMs: number = 30_000) {
  if (pushRetryInterval) {
    logger.warn('Push retry worker already scheduled');
    return;
  }

  pushRetryInterval = setInterval(() => {
    // Never let a slow sweep overlap with the next tick — otherwise a hung push
    // (or slow DB call) piles up overlapping sweeps and the worker looks like it
    // "runs forever".
    if (isSweepRunning) {
      logger.debug('Skipping push retry sweep — previous sweep still running');
      return;
    }
    isSweepRunning = true;
    pushRetryWorker()
      .catch((e) => {
        logger.error('Unhandled error in push retry worker', e);
      })
      .finally(() => {
        isSweepRunning = false;
      });
  }, intervalMs);

  logger.info('Push retry worker scheduled', { intervalMs });
}

export function stopPushRetryWorker() {
  if (pushRetryInterval) {
    clearInterval(pushRetryInterval);
    pushRetryInterval = null;
    logger.info('Push retry worker stopped');
  }
}
