import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';

/**
 * SubscriptionExpiryScheduler: Defers subscription expiry checks to avoid blocking startup.
 *
 * Strategy:
 * - First check runs after 60 seconds (allowing other initialization to complete)
 * - Subsequent checks run every 60 minutes (3600 seconds)
 * - Errors are caught and logged; failures do not crash the application
 *
 * This service moves subscription expiry logic from synchronous index.ts startup
 * to background operation, improving startup time to <2 seconds.
 */

export class SubscriptionExpiryScheduler {
  private firstCheckTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  /**
   * Start the scheduler: first check after 60s, then every 60 minutes.
   */
  start(): void {
    logger.info('[Startup] Subscription expiry scheduler: scheduling first check in 60 seconds');

    const FIRST_CHECK_DELAY = 60 * 1000; // 60 seconds
    const INTERVAL = 60 * 60 * 1000; // 60 minutes

    this.firstCheckTimer = setTimeout(async () => {
      logger.info('[Startup] Subscription expiry scheduler: running first check');
      await this.check();

      // Schedule recurring checks every 60 minutes
      this.intervalTimer = setInterval(async () => {
        await this.check();
      }, INTERVAL);
    }, FIRST_CHECK_DELAY);
  }

  /**
   * Perform the subscription expiry check:
   * - Expire customer plans (BASIC/PLUS/PRO)
   * - Expire worker plans (FREE/PRO/ELITE)
   * - Update related profile data (guaranteed status, etc.)
   */
  private async check(): Promise<void> {
    try {
      const now = new Date();

      // === Customer subscriptions ===
      // Find expired customer premium subscriptions
      const expiredCustomers = await prisma.user.findMany({
        where: {
          isPremium: true,
          premiumExpiresAt: { lt: now },
        },
        select: { id: true },
      });

      if (expiredCustomers.length > 0) {
        const ids = expiredCustomers.map((u) => u.id);

        // Update user table: set isPremium = false, plan = BASIC, expiresAt = null
        await prisma.user.updateMany({
          where: {
            id: { in: ids },
            isPremium: true,
            premiumExpiresAt: { lt: now },
          },
          data: {
            isPremium: false,
            premiumPlan: 'BASIC',
            premiumExpiresAt: null,
          },
        });

        // Update corresponding UserSubscription records
        await prisma.userSubscription.updateMany({
          where: {
            userId: { in: ids },
            status: 'active',
          },
          data: {
            plan: 'BASIC',
            status: 'expired',
          },
        });

        for (const u of expiredCustomers) {
          await notificationService.sendPushNotification(
            u.id, 'Subscription Expired',
            'Your KaamWala subscription has ended. Resubscribe to keep enjoying discounts.',
            'subscription',
          ).catch(() => {});
        }

        logger.info(`[Subscription] Expired ${expiredCustomers.length} customer subscriptions`);
      }

      // === Worker subscriptions ===
      // Find expired worker subscriptions (FREE plan never expires)
      const expiredWorkerSubs = await prisma.workerSubscription.findMany({
        where: {
          status: 'active',
          plan: { not: 'FREE' },
          currentPeriodEnd: { lt: now },
        },
        select: {
          id: true,
          userId: true,
          plan: true,
        },
      });

      if (expiredWorkerSubs.length > 0) {
        // Update workerSubscription records: set status = expired, plan = FREE, period = null
        await prisma.workerSubscription.updateMany({
          where: {
            id: { in: expiredWorkerSubs.map((s) => s.id) },
          },
          data: {
            status: 'expired',
            plan: 'FREE',
            currentPeriodEnd: null,
          },
        });

        // If any ELITE subscriptions expired, update workerProfile: remove guaranteed status
        const eliteUserIds = expiredWorkerSubs
          .filter((s) => s.plan === 'ELITE')
          .map((s) => s.userId);

        if (eliteUserIds.length > 0) {
          await prisma.workerProfile.updateMany({
            where: { userId: { in: eliteUserIds } },
            data: {
              isGuaranteed: false,
              guaranteedSince: null,
            },
          });

          logger.info(`[Subscription] Removed guaranteed status from ${eliteUserIds.length} workers`);
        }

        for (const s of expiredWorkerSubs) {
          await notificationService.sendPushNotification(
            s.userId, 'Plan Expired',
            'Your KaamWala worker plan has ended and you are back on the FREE plan.',
            'subscription', { plan: s.plan },
          ).catch(() => {});
        }

        logger.info(`[Subscription] Expired ${expiredWorkerSubs.length} worker subscriptions`);
      }
    } catch (error: any) {
      logger.error(
        '[Subscription] Expiry check failed:',
        error instanceof Error ? error.message : String(error),
      );
      // Intentionally do NOT re-throw: failures do not crash the application
    }
  }

  /**
   * Stop the scheduler (for graceful shutdown).
   */
  stop(): void {
    if (this.firstCheckTimer) clearTimeout(this.firstCheckTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    logger.info('[Shutdown] Subscription expiry scheduler stopped');
  }
}
