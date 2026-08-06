import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { apiClient } from '../api/client';
import { notificationBus } from './notificationBus';
import { useAuthStore } from '../store/auth.store';
import { useNotificationsStore } from '../store/notifications.store';
import { resolveNotificationRoute } from './notificationMeta';

/**
 * `executionEnvironment === 'storeClient'` is Expo Go (no native push module).
 * Standalone + dev-client builds report `standalone`, where expo-notifications
 * works normally.
 */
const isExpoGo = Constants.executionEnvironment === 'storeClient';

let Notifications: typeof import('expo-notifications') | null = null;
let notificationHandlerInstalled = false;

// Android channels — one per notification category so users can control sound/
// importance per type from system settings. Ids match the backend `channelId`.
const ANDROID_CHANNELS: Array<{ id: string; name: string; importance: number; description: string }> = [
  { id: 'urgent', name: 'Urgent', importance: 5, description: 'Urgent requests and urgent-booking updates' },
  { id: 'bookings', name: 'Bookings', importance: 4, description: 'Booking updates and status changes' },
  { id: 'requests', name: 'Requests', importance: 4, description: 'New requests, quotes and offers' },
  { id: 'messages', name: 'Messages', importance: 4, description: 'Chat messages' },
  { id: 'payments', name: 'Payments', importance: 3, description: 'Payments, refunds and wallet activity' },
  { id: 'wallet', name: 'Wallet', importance: 3, description: 'Wallet credits and withdrawals' },
  { id: 'verification', name: 'Verification', importance: 3, description: 'Profile and document verification' },
  { id: 'subscription', name: 'Subscription', importance: 3, description: 'Subscription and plan updates' },
  { id: 'support', name: 'Support', importance: 3, description: 'Support tickets and disputes' },
  { id: 'general', name: 'General', importance: 3, description: 'Other notifications' },
  { id: 'promo', name: 'Promotions', importance: 2, description: 'Promotions and announcements' },
];

async function loadNotifications() {
  if (isExpoGo) return null;
  if (Notifications) return Notifications;
  Notifications = await import('expo-notifications');

  if (!notificationHandlerInstalled) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerInstalled = true;
  }

  return Notifications;
}

/** Parse the backend's `{ payload: "<json>" }` FCM envelope, or a plain object. */
function extractData(contentData: any): Record<string, any> {
  if (!contentData) return {};
  if (typeof contentData.payload === 'string') {
    try {
      return JSON.parse(contentData.payload);
    } catch {
      return {};
    }
  }
  return contentData;
}

export async function getExpoPushToken(): Promise<string | null> {
  try {
    const NotificationsModule = await loadNotifications();
    if (!NotificationsModule) return null;

    const { status: existingStatus } = await NotificationsModule.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await NotificationsModule.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // SDK 53+ requires the EAS projectId to mint a push token.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    let tokenData: { data: string };
    try {
      tokenData = await NotificationsModule.getExpoPushTokenAsync(projectId ? { projectId } : {});
    } catch {
      // Some setups reject the explicit projectId (or it is missing) — retry
      // without it so a token can still be minted where the SDK allows.
      tokenData = await NotificationsModule.getExpoPushTokenAsync();
    }
    return tokenData.data;
  } catch {
    return null;
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const token = await getExpoPushToken();
    if (!token) return null;

    // Only sync to the backend when authenticated — an unauthenticated PUT would
    // 401 (and could even trigger the client's logout-on-401 path).
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      await apiClient.put('/notifications/push-token', { token, platform: Platform.OS }).catch(() => {});
    }

    if (Platform.OS === 'android') {
      const NotificationsModule = await loadNotifications();
      if (NotificationsModule) {
        for (const ch of ANDROID_CHANNELS) {
          await NotificationsModule.setNotificationChannelAsync(ch.id, {
            name: ch.name,
            importance: ch.importance,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF5C00',
            description: ch.description,
          });
        }
      }
    }

    return token;
  } catch {
    return null;
  }
}

export function setupNotificationListeners() {
  let sub: { remove: () => void } | null = null;
  let sub2: { remove: () => void } | null = null;
  let appStateSubscription: any = null;

  const setup = async () => {
    const NotificationsModule = await loadNotifications();
    if (!NotificationsModule) return;

    // Foreground push received → in-app banner + badge increment.
    // Mark as "delivered" on the backend so we don't retry sending it.
    sub = NotificationsModule.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = extractData(content.data);
      const notificationId = data.id;
      
      // Mark as delivered on backend (prevents retry)
      if (notificationId) {
        apiClient.post(`/notifications/${notificationId}/mark-delivered`).catch(() => {});
      }

      const payload = {
        id: notificationId || undefined,
        type: data.type || 'general',
        title: content.title || 'Notification',
        body: content.body || '',
        data,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      notificationBus.emit(payload);
      const { unreadCount } = useNotificationsStore.getState();
      NotificationsModule.setBadgeCountAsync(unreadCount + 1).catch(() => {});
    });

    // Tap → navigate to the correct screen, mark as delivered, and clear the OS badge.
    sub2 = NotificationsModule.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      const data = extractData(content.data);
      const notificationId = data.id;

      // Mark as delivered/opened on backend
      if (notificationId) {
        apiClient.post(`/notifications/${notificationId}/mark-delivered`).catch(() => {});
      }

      const payload = { type: data.type || 'general', title: content.title || '', body: content.body || '', data };
      const role = useAuthStore.getState().user?.role as any;
      NotificationsModule.setBadgeCountAsync(0).catch(() => {});
      const route = resolveNotificationRoute(payload, role);
      if (route) {
        // Defer one tick so the tapped app finishes opening before we navigate.
        setTimeout(() => router.push(route as never), 0);
      }
    });

    // Cold-start deep link: the app was launched by tapping a notification. The
    // auth store may not be hydrated yet (we need the role to resolve the route),
    // so retry until it is, bounded so a stuck launch never spins forever.
    NotificationsModule.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response?.notification) return;
        const content = response.notification.request.content;
        const data = extractData(content.data);
        const notificationId = data.id;

        // Mark as delivered
        if (notificationId) {
          apiClient.post(`/notifications/${notificationId}/mark-delivered`).catch(() => {});
        }

        const payload = { type: data.type || 'general', title: content.title || '', body: content.body || '', data };

        const tryNavigate = () => {
          const role = useAuthStore.getState().user?.role;
          if (!role) return false;
          NotificationsModule.setBadgeCountAsync(0).catch(() => {});
          const route = resolveNotificationRoute(payload, role as any);
          if (route) setTimeout(() => router.push(route as never), 0);
          return true;
        };

        if (!tryNavigate()) {
          let attempts = 0;
          const iv = setInterval(() => {
            attempts++;
            if (tryNavigate() || attempts > 20) clearInterval(iv);
          }, 250);
        }
      })
      .catch(() => {});

    // Re-register token immediately when app comes to foreground (not with cooldown).
    // This ensures backend has the latest token after OS updates, reinstalls, etc.
    // The backend deduplicates token updates, so frequent re-registers are safe.
    appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && useAuthStore.getState().isAuthenticated) {
        registerForPushNotifications().catch(() => {});
      }
    });
  };

  setup();

  return () => {
    sub?.remove();
    sub2?.remove();
    appStateSubscription?.remove?.();
  };
}
