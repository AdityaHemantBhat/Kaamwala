import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { sendPushToToken } from './push.service';
import { pushDeliveryService } from './push-delivery.service';

/**
 * Per-type delivery rules.
 *  - channelId: Android channel (created client-side). Grouping + per-channel
 *    sound/importance live here.
 *  - priority: 'high' for time-sensitive pushes (bookings, urgent, chat).
 *  - silent: persist + emit in-app but never fire a device push (e.g. promo).
 *  - coalesceMs: collapse repeated notifications of the same type to the same
 *    conversation within the window (chat spam prevention).
 */
interface NotificationMeta {
  channelId: string;
  priority: 'default' | 'high';
  silent?: boolean;
  coalesceMs?: number;
}

const TYPE_META: Record<string, NotificationMeta> = {
  // Bookings (both roles)
  booking_update: { channelId: 'bookings', priority: 'high' },
  booking_confirmed: { channelId: 'bookings', priority: 'high' },
  new_request: { channelId: 'bookings', priority: 'high' },
  new_booking: { channelId: 'bookings', priority: 'high' },
  cancel_request: { channelId: 'bookings', priority: 'default' },
  scope_change: { channelId: 'bookings', priority: 'default' },
  negotiation: { channelId: 'bookings', priority: 'default' },
  promotional: { channelId: 'promo', priority: 'default', silent: true },
  // Urgent
  urgent_request: { channelId: 'urgent', priority: 'high' },
  urgent_accepted: { channelId: 'urgent', priority: 'high' },
  urgent_expired: { channelId: 'urgent', priority: 'default' },
  // Requests / marketplace
  request_matched: { channelId: 'requests', priority: 'high', coalesceMs: 20_000 },
  worker_interest: { channelId: 'requests', priority: 'default', coalesceMs: 15_000 },
  worker_quote: { channelId: 'requests', priority: 'default' },
  request_counter: { channelId: 'requests', priority: 'default' },
  request_accepted: { channelId: 'requests', priority: 'high' },
  // Chat
  chat_message: { channelId: 'messages', priority: 'high', coalesceMs: 30_000 },
  // Payments / wallet
  payment_received: { channelId: 'payments', priority: 'default' },
  payment_success: { channelId: 'payments', priority: 'default' },
  payment_failed: { channelId: 'payments', priority: 'default' },
  cancellation_fee: { channelId: 'payments', priority: 'default' },
  refund: { channelId: 'payments', priority: 'default' },
  wallet: { channelId: 'wallet', priority: 'default' },
  wallet_credited: { channelId: 'wallet', priority: 'default' },
  withdrawal: { channelId: 'wallet', priority: 'default' },
  // Accounts
  subscription: { channelId: 'subscription', priority: 'default' },
  verification: { channelId: 'verification', priority: 'default' },
  support_reply: { channelId: 'support', priority: 'default' },
  dispute_update: { channelId: 'support', priority: 'default' },
  // General
  review_received: { channelId: 'general', priority: 'default' },
  rating_received: { channelId: 'general', priority: 'default' },
  broadcast: { channelId: 'promo', priority: 'default' },
};

const DEFAULT_META: NotificationMeta = { channelId: 'general', priority: 'default' };

/** Which field on `data` identifies the "conversation" for coalescing. */
function coalesceKeyFor(type: string, data?: Record<string, any>): string | null {
  if (!data) return null;
  if (data.bookingId) return `booking:${data.bookingId}`;
  if (data.requestId) return `request:${data.requestId}`;
  if (data.changeId) return `change:${data.changeId}`;
  return null;
}

/**
 * Role-aware deep link for a notification — the same routes the mobile app
 * navigates to (see mobile/src/utils/notificationMeta.ts). Persisted on the
 * Notification row so the link survives independently of the client resolver
 * and is queryable for analytics / support.
 */
export function buildDeepLink(role: string | null | undefined, type: string, data?: Record<string, any>): string | null {
  const d = data && typeof data === 'object' ? data : {};
  const bookingId = d.bookingId;
  const requestId = d.requestId;
  const ticketId = d.ticketId;
  const isWorker = role === 'WORKER';
  const bookings = isWorker ? '/(worker)/bookings' : '/(customer)/bookings';

  switch (type) {
    case 'chat_message':
      return bookingId && isWorker ? `/(worker)/chat?bookingId=${bookingId}` : bookings;
    case 'urgent_request':
      return '/(worker)/browse-requests';
    case 'urgent_expired':
      return !isWorker ? '/(customer)/urgent' : '/(worker)/browse-requests';
    case 'request_matched':
    case 'request_accepted':
    case 'request_counter':
      return isWorker ? '/(worker)/browse-requests' : '/(customer)/home';
    case 'worker_interest':
    case 'worker_quote':
      return !isWorker ? '/(customer)/bookings' : '/(customer)/home';
    case 'verification':
      return isWorker ? '/(worker)/verification' : '/(customer)/home';
    case 'subscription':
      return isWorker ? '/(worker)/subscription' : '/(customer)/subscription';
    case 'withdrawal':
    case 'wallet':
    case 'wallet_credited':
    case 'payment_received':
    case 'payment_success':
    case 'payment_failed':
    case 'refund':
    case 'cancellation_fee':
      return isWorker ? '/(worker)/earnings' : '/(customer)/payments';
    case 'support_reply':
      return isWorker ? (ticketId ? `/(worker)/support/${ticketId}` : '/(worker)/support') : '/(customer)/notifications';
    case 'scope_change':
    case 'negotiation':
    case 'booking_update':
    case 'booking_confirmed':
    case 'new_request':
    case 'new_booking':
    case 'cancel_request':
      return bookings;
    case 'referral_bonus':
      return !isWorker ? '/(customer)/referrals' : '/(customer)/home';
    default:
      if (bookingId) return bookings;
      if (requestId) return isWorker ? '/(worker)/browse-requests' : '/(customer)/bookings';
      return isWorker ? '/(worker)/notifications' : '/(customer)/notifications';
  }
}

async function emitNewNotification(userId: string, notification: any) {
  try {
    // Circular-safe: socket.service imports notification.service (chat push).
    const { emitToUser } = await import('./socket.service');
    emitToUser(userId, 'new_notification', notification);
  } catch (e) {
    logger.debug('Socket emit failed for notification', e);
  }
}

export const notificationService = {
  /**
   * Persist a notification, stream it to the user's open app in realtime, and
   * deliver a device push. This is the single source of truth for all three
   * delivery channels — call sites never emit `new_notification` themselves.
   *
   * Returns the persisted notification row (or null when coalesced).
   */
  async sendPushNotification(userId: string, title: string, body: string, type: string, data?: any): Promise<any> {
    const meta = TYPE_META[type] || DEFAULT_META;
    const dataObj = data !== undefined ? (typeof data === 'object' ? data : { value: data }) : undefined;

    try {
      // Resolve the recipient first (token + role) so the persisted row can
      // carry a correct role-aware deep link.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fcmToken: true, role: true },
      });

      const deepLink = buildDeepLink(user?.role as any, type, dataObj);

      const existing = meta.coalesceMs ? await this.findCoalescable(userId, type, dataObj, meta.coalesceMs) : null;
      let notification;
      if (existing) {
        const count = ((existing.data as any)?.count || 1) + 1;
        notification = await prisma.notification.update({
          where: { id: existing.id },
          data: {
            createdAt: new Date(),
            body: type === 'chat_message'
              ? `You have ${count} new messages`
              : body,
            data: { ...(dataObj || {}), count },
            ...(deepLink ? { deepLink } : {}),
          },
        });
      } else {
        notification = await prisma.notification.create({
          data: {
            userId,
            title,
            body,
            type,
            isSilent: !!meta.silent,
            ...(dataObj !== undefined ? { data: dataObj } : {}),
            ...(deepLink ? { deepLink } : {}),
          },
        });
      }

      // Realtime in-app delivery (full row so the client can render + route).
      await emitNewNotification(userId, notification);

      if (!meta.silent && user?.fcmToken) {
        const result = await sendPushToToken(user.fcmToken, {
          title,
          body: notification.body,
          channelId: meta.channelId,
          priority: meta.priority,
          data: dataObj ? { type, ...dataObj } : { type },
        });

        // Track delivery attempt and handle failures
        if (result.invalid) {
          // Dead token — clear it atomically via versioned update to prevent race condition
          const updated = await prisma.user.updateMany({
            where: { id: user.id, fcmToken: user.fcmToken }, // Only clear if token hasn't changed
            data: { fcmToken: null },
          });
          if (updated.count > 0) {
            logger.warn('Cleared invalid push token for user', { userId });
            await pushDeliveryService.recordFailure(notification.id, 'invalid_fcm_token');
          }
        } else if (!result.ok) {
          // Temporary failure (network, rate limit) — record for retry
          const willRetry = await pushDeliveryService.recordFailure(notification.id, 'send_failed');
          if (!willRetry) {
            logger.error('Push notification delivery exhausted retries', { notificationId: notification.id, userId });
          }
        } else {
          // Send succeeded — update status to DELIVERED (or await FCM callback)
          await pushDeliveryService.markDelivered(notification.id, 'fcm_callback');
        }
      } else if (!meta.silent) {
        // No token available — record for potential retry when token is available
        await pushDeliveryService.recordFailure(notification.id, 'no_fcm_token_available');
      }

      return notification;
    } catch (e) {
      logger.error('Failed to send push notification', e);
      return null;
    }
  },

  /** Find a recent unread notification of the same type+conversation to collapse into. */
  async findCoalescable(userId: string, type: string, data: any, coalesceMs: number) {
    const key = coalesceKeyFor(type, data);
    if (!key) return null;
    const recent = await prisma.notification.findFirst({
      where: { userId, type, isRead: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, data: true, createdAt: true },
    });
    if (!recent) return null;
    const rowKey = coalesceKeyFor(type, recent.data as any);
    const age = Date.now() - new Date(recent.createdAt).getTime();
    if (rowKey && rowKey === key && age < coalesceMs) return recent;
    return null;
  },

  /**
   * Retry worker: processes failed push notifications with backoff.
   * Called periodically (e.g., every 30s) to sweep and retry PENDING notifications.
   * 
   * Production: integrate into a background job service (Bull, Temporal, etc).
   * For now, can be triggered manually or via cron. Returns count of retried notifications.
   */
  async retryFailedPushes(limit: number = 50): Promise<number> {
    const notifications = await pushDeliveryService.getPendingRetries(limit);
    
    if (notifications.length === 0) {
      return 0;
    }

    logger.info('Processing push delivery retries', { count: notifications.length });

    for (const notification of notifications) {
      try {
        // Re-fetch user to get current token (may have changed since original send)
        const user = await prisma.user.findUnique({
          where: { id: notification.userId },
          select: { id: true, fcmToken: true, role: true },
        });

        if (!user?.fcmToken) {
          // Token still missing — record failure but keep as PENDING for later
          await pushDeliveryService.recordFailure(notification.id, 'no_token_on_retry');
          continue;
        }

        // Attempt to send
        const result = await sendPushToToken(user.fcmToken, {
          title: notification.title,
          body: notification.body,
          channelId: 'general',
          priority: (notification.data as any)?.priority || 'default',
          data: notification.data as any,
        });

        if (result.invalid) {
          // Dead token — clear it
          await prisma.user.updateMany({
            where: { id: user.id, fcmToken: user.fcmToken },
            data: { fcmToken: null },
          });
          await pushDeliveryService.recordFailure(notification.id, 'invalid_token_on_retry');
        } else if (!result.ok) {
          // Temporary failure — record and let backoff handle next retry
          await pushDeliveryService.recordFailure(notification.id, 'send_failed_on_retry');
        } else {
          // Success — mark delivered
          await pushDeliveryService.markDelivered(notification.id, 'fcm_callback');
          logger.info('Push notification delivered on retry', { notificationId: notification.id });
        }
      } catch (e) {
        logger.error('Failed to retry push notification', { notificationId: notification.id, error: e });
      }
    }

    return notifications.length;
  },
};
