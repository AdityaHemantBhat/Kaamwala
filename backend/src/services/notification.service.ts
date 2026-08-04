import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { sendPushToToken } from './push.service';

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
      // User lookup (token) + notification write run concurrently — hot path
      // costs ~1 round-trip, not 2.
      const userPromise = prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fcmToken: true },
      });

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
          },
        });
      }

      // Realtime in-app delivery (full row so the client can render + route).
      await emitNewNotification(userId, notification);

      const user = await userPromise;
      if (!meta.silent && user?.fcmToken) {
        const result = await sendPushToToken(user.fcmToken, {
          title,
          body: notification.body,
          channelId: meta.channelId,
          priority: meta.priority,
          data: dataObj ? { type, ...dataObj } : { type },
        });
        if (result.invalid) {
          // Dead token — clear it so we stop retrying it forever.
          await prisma.user.update({ where: { id: user.id }, data: { fcmToken: null } }).catch(() => {});
          logger.warn('Cleared invalid push token for user', { userId });
        }
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
};
