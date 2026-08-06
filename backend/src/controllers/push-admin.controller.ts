import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { notificationService } from '../services/notification.service';
import { pushDeliveryService } from '../services/push-delivery.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Admin endpoints for push notification monitoring and manual intervention.
 * Requires admin authentication.
 */

/**
 * GET /admin/push/stats
 * Get push notification delivery statistics (success rate, pending count, failure reasons).
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Overall delivery stats
    const [total, pending, delivered, failed, cancelled] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({ where: { status: 'PENDING' } }),
      prisma.notification.count({ where: { status: 'DELIVERED' } }),
      prisma.notification.count({ where: { status: 'FAILED' } }),
      prisma.notification.count({ where: { status: 'CANCELLED' } }),
    ]);

    // Failure reason breakdown (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failureReasons = await prisma.notification.groupBy({
      by: ['failureReason'],
      where: {
        status: 'FAILED',
        createdAt: { gte: oneDayAgo },
      },
      _count: true,
    });

    // High-retry notifications (≥2 attempts)
    const highRetryCount = await prisma.notification.count({
      where: {
        retryCount: { gte: 2 },
        createdAt: { gte: oneDayAgo },
      },
    });

    const successRate = total > 0 ? ((delivered / total) * 100).toFixed(2) : 'N/A';

    res.json({
      timestamp: new Date().toISOString(),
      summary: {
        total,
        successRate: `${successRate}%`,
        delivered,
        pending,
        failed,
        cancelled,
      },
      failures24h: {
        highRetryCount,
        reasonBreakdown: failureReasons.map((r) => ({
          reason: r.failureReason || 'unknown',
          count: r._count,
        })),
      },
    });
  } catch (e) {
    logger.error('Failed to get push stats', e);
    res.status(500).json({ error: 'Failed to retrieve push stats' });
  }
});

/**
 * GET /admin/push/pending
 * List all PENDING notifications awaiting retry (with pagination).
 */
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [pending, count] = await Promise.all([
      prisma.notification.findMany({
        where: { status: 'PENDING' },
        select: {
          id: true,
          userId: true,
          title: true,
          body: true,
          type: true,
          retryCount: true,
          lastRetryAt: true,
          createdAt: true,
          failureReason: true,
        },
        orderBy: { lastRetryAt: 'asc' }, // Oldest retries first
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where: { status: 'PENDING' } }),
    ]);

    res.json({
      pending,
      pagination: {
        limit,
        offset,
        total: count,
        hasMore: offset + limit < count,
      },
    });
  } catch (e) {
    logger.error('Failed to list pending notifications', e);
    res.status(500).json({ error: 'Failed to retrieve pending notifications' });
  }
});

/**
 * POST /admin/push/retry
 * Manually trigger a retry sweep for all PENDING notifications.
 */
router.post('/retry', async (req: Request, res: Response) => {
  try {
    logger.info('Admin triggered push retry sweep');
    const retriedCount = await notificationService.retryFailedPushes(100);

    res.json({
      success: true,
      retriedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('Manual push retry failed', e);
    res.status(500).json({ error: 'Failed to trigger retry sweep', details: String(e) });
  }
});

/**
 * DELETE /admin/push/cleanup
 * Manually clean up old FAILED/CANCELLED notifications.
 */
router.delete('/cleanup', async (req: Request, res: Response) => {
  try {
    const daysOld = parseInt(req.query.daysOld as string) || 30;
    logger.info('Admin triggered push notification cleanup', { daysOld });

    const cleanedCount = await pushDeliveryService.cleanupOldNotifications(daysOld);

    res.json({
      success: true,
      cleanedCount,
      daysOld,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('Manual push cleanup failed', e);
    res.status(500).json({ error: 'Failed to cleanup notifications', details: String(e) });
  }
});

/**
 * POST /admin/push/:notificationId/mark-delivered
 * Manually mark a notification as delivered (for testing or manual intervention).
 */
router.post('/:notificationId/mark-delivered', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    await pushDeliveryService.markDelivered(notificationId, 'user_event');

    res.json({
      success: true,
      notificationId,
      status: 'DELIVERED',
    });
  } catch (e) {
    logger.error('Failed to mark notification as delivered', e);
    res.status(500).json({ error: 'Failed to mark notification as delivered' });
  }
});

/**
 * POST /admin/push/:notificationId/cancel
 * Cancel a pending push (e.g., user already read it).
 */
router.post('/:notificationId/cancel', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const reason = req.body.reason || 'admin_cancelled';
    await pushDeliveryService.cancel(notificationId, reason);

    res.json({
      success: true,
      notificationId,
      status: 'CANCELLED',
    });
  } catch (e) {
    logger.error('Failed to cancel notification', e);
    res.status(500).json({ error: 'Failed to cancel notification' });
  }
});

export default router;
