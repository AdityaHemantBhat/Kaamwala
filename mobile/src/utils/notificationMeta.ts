/**
 * Notification type → display metadata + deep-link resolution.
 *
 * Shared by the in-app banner, the notification history screens, and push-tap
 * navigation so every surface renders the same icon/color and opens the same
 * screen for a given notification type.
 */

export interface NotificationMeta {
  icon: string;
  color: string;
}

export const NOTIFICATION_TYPE_META: Record<string, NotificationMeta> = {
  // Bookings
  booking_update: { icon: 'clipboard-check', color: '#1A5C2A' },
  booking_confirmed: { icon: 'clipboard-check', color: '#1A5C2A' },
  new_request: { icon: 'clipboard-text', color: '#FF5C00' },
  new_booking: { icon: 'clipboard-check', color: '#FF5C00' },
  cancel_request: { icon: 'close-circle', color: '#8B1A1A' },
  scope_change: { icon: 'file-document-edit', color: '#B06000' },
  negotiation: { icon: 'handshake', color: '#6C5CE7' },
  promotional: { icon: 'ticket-percent', color: '#FF5C00' },
  // Urgent
  urgent_request: { icon: 'alarm-light', color: '#D32F2F' },
  urgent_accepted: { icon: 'check-decagram', color: '#2E7D32' },
  urgent_expired: { icon: 'alarm-off', color: '#6B6B6B' },
  // Marketplace requests
  request_matched: { icon: 'bell-ring', color: '#FF5C00' },
  worker_interest: { icon: 'account-hard-hat', color: '#6C5CE7' },
  worker_quote: { icon: 'currency-inr', color: '#1A5C2A' },
  request_counter: { icon: 'swap-vertical', color: '#FF5C00' },
  request_accepted: { icon: 'check-decagram', color: '#1A5C2A' },
  // Chat
  chat_message: { icon: 'message-text', color: '#25D366' },
  // Payments / wallet
  payment_received: { icon: 'wallet', color: '#1A5C2A' },
  payment_success: { icon: 'check-circle', color: '#1A5C2A' },
  payment_failed: { icon: 'alert-circle', color: '#D32F2F' },
  cancellation_fee: { icon: 'currency-inr', color: '#E65100' },
  refund: { icon: 'arrow-u-left-top', color: '#1A5C2A' },
  wallet: { icon: 'wallet', color: '#1A5C2A' },
  wallet_credited: { icon: 'wallet-plus', color: '#2E7D32' },
  withdrawal: { icon: 'bank-transfer-out', color: '#6C5CE7' },
  // Accounts
  subscription: { icon: 'crown', color: '#D4A017' },
  verification: { icon: 'shield-check', color: '#1A3A5C' },
  support_reply: { icon: 'headset', color: '#2196F3' },
  dispute_update: { icon: 'shield-alert', color: '#8B1A1A' },
  // General
  review_received: { icon: 'star', color: '#D4A017' },
  rating_received: { icon: 'star', color: '#D4A017' },
  referral_bonus: { icon: 'gift', color: '#6C5CE7' },
  broadcast: { icon: 'bullhorn', color: '#FF5C00' },
  // Achievements
  achievement: { icon: 'trophy-award', color: '#D4A017' },
};

export function getNotificationMeta(type: string): NotificationMeta {
  return NOTIFICATION_TYPE_META[type] || { icon: 'bell-outline', color: '#6B6B6B' };
}

/**
 * Resolve where a tap on this notification should navigate. Uses the role to
 * disambiguate customer vs worker routes (chat is worker-only today) and the
 * `data` payload for ids. Falls back to the notifications list itself.
 */
export function resolveNotificationRoute(
  notification: any,
  role: 'CUSTOMER' | 'WORKER' | 'ADMIN' | 'SUPER_ADMIN',
): string | null {
  if (!notification) return null;
  const type = notification.type || '';
  const data = (notification.data && typeof notification.data === 'object' ? notification.data : {}) as Record<string, any>;
  const bookingId = data.bookingId;
  const requestId = data.requestId;
  const ticketId = data.ticketId;
  const isWorker = role === 'WORKER';

  const bookings = isWorker ? '/(worker)/bookings' : '/(customer)/bookings';
  const home = isWorker ? '/(worker)/dashboard' : '/(customer)/home';

  switch (type) {
    case 'chat_message':
      return bookingId && isWorker ? `/(worker)/chat?bookingId=${bookingId}` : bookings;
    case 'urgent_request':
      return '/(worker)/browse-requests';
    case 'urgent_accepted':
      return bookingId && !isWorker
        ? `/(customer)/live-tracking?bookingId=${bookingId}`
        : bookings;
    case 'urgent_expired':
      return !isWorker ? '/(customer)/urgent' : '/(worker)/browse-requests';
    case 'request_matched':
    case 'request_accepted':
    case 'request_counter':
      return isWorker ? '/(worker)/browse-requests' : home;
    case 'worker_interest':
    case 'worker_quote':
      return !isWorker ? '/(customer)/bookings' : home;
    case 'verification':
      return isWorker ? '/(worker)/verification' : home;
    case 'subscription':
      return isWorker ? '/(worker)/subscription' : '/(customer)/subscription';
    case 'achievement':
      return isWorker ? '/(worker)/achievements' : home;
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
      return isWorker
        ? (ticketId ? `/(worker)/support/${ticketId}` : '/(worker)/support')
        : home;
    case 'dispute_update':
      return home;
    case 'scope_change':
    case 'negotiation':
      return bookings;
    case 'review_received':
    case 'rating_received':
    case 'booking_update':
    case 'booking_confirmed':
    case 'new_request':
    case 'new_booking':
    case 'cancel_request':
      return bookings;
    case 'referral_bonus':
      return !isWorker ? '/(customer)/referrals' : home;
    default:
      if (bookingId) return bookings;
      if (requestId) return isWorker ? '/(worker)/browse-requests' : '/(customer)/bookings';
      return isWorker ? '/(worker)/notifications' : '/(customer)/notifications';
  }
}
