import { logger } from '../utils/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Expo push tokens are the token type the mobile app registers via
 * `expo-notifications.getExpoPushTokenAsync()` (e.g.
 * `ExponentPushToken[xxxxxxxxxxxxx]`). They are delivered through Expo's push
 * service, NOT through Firebase Cloud Messaging directly — mixing them up is
 * the classic "FCM says invalid registration token" bug.
 */
export function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[[a-zA-Z0-9_-]+\]$/.test(token);
}

export interface PushSendResult {
  /** true when the push was accepted for delivery */
  ok: boolean;
  /** true when the token is no longer valid and should be cleared from the DB */
  invalid: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string;
  /** Android channel id (created client-side via expo-notifications) */
  channelId?: string;
  priority?: 'default' | 'high';
  /** iOS app-icon badge number */
  badge?: number;
}

/**
 * Send a push notification to a single device token, routing by token type:
 *  - Expo push token  → Expo's HTTP push API
 *  - anything else    → Firebase Cloud Messaging (native FCM tokens)
 *
 * Returns `{ ok, invalid }`; `invalid: true` signals a dead token the caller
 * should delete (prevents unbounded stale-token retries).
 */
export async function sendPushToToken(token: string, payload: PushPayload): Promise<PushSendResult> {
  if (isExpoPushToken(token)) {
    return sendViaExpo(token, payload);
  }
  return sendViaFcm(token, payload);
}

async function sendViaExpo(token: string, payload: PushPayload): Promise<PushSendResult> {
  // Hard timeout so a hung Expo endpoint can never stall a request that fans out
  // to many recipients (e.g. admin ticket replies). Default Node fetch has none.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const body: Record<string, any> = {
      to: token,
      title: payload.title,
      body: payload.body,
      sound: payload.sound || 'default',
      priority: payload.priority === 'high' ? 'high' : 'default',
      ...(payload.data ? { data: payload.data } : {}),
      ...(payload.channelId ? { channelId: payload.channelId } : {}),
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify([body]),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn('Expo push HTTP error', { status: res.status });
      return { ok: false, invalid: false };
    }

    const json: any = await res.json();
    const ticket = json?.data?.[0];
    if (ticket?.status === 'error') {
      const message = ticket.details?.error || ticket.message || '';
      if (/DeviceNotRegistered|InvalidToken|not a valid Expo push token|expo push token/i.test(String(message))) {
        return { ok: false, invalid: true };
      }
      logger.warn('Expo push rejected message', { message });
      return { ok: false, invalid: false };
    }

    return { ok: true, invalid: false };
  } catch (e) {
    logger.error('Expo push request failed', e);
    return { ok: false, invalid: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaFcm(token: string, payload: PushPayload): Promise<PushSendResult> {
  try {
    // Lazy-load Firebase (heavy dependency tree) only when actually needed.
    const { getMessaging } = await import('../config/firebase');
    const messaging = await getMessaging();
    if (!messaging) return { ok: false, invalid: false };

    await messaging.send({
      token,
      notification: { title: payload.title, body: payload.body },
      android: {
        priority: payload.priority === 'high' ? 'high' : 'normal',
        ...(payload.channelId
          ? { notification: { channelId: payload.channelId } }
          : {}),
      },
      apns: payload.badge !== undefined
        ? { payload: { aps: { badge: payload.badge } } }
        : undefined,
      data: payload.data ? { payload: JSON.stringify(payload.data) } : undefined,
    });
    return { ok: true, invalid: false };
  } catch (e: any) {
    const code = e?.errorInfo?.code || e?.code || '';
    if (/registration-token-not-registered|invalid-registration-token|messaging\/invalid-argument/i.test(code)) {
      return { ok: false, invalid: true };
    }
    logger.error('FCM send failed', e);
    return { ok: false, invalid: false };
  }
}
