import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Lazily-initialized Firebase Messaging. `firebase-admin` pulls a large
 * transitive dependency tree (gax/google-cloud/auth/axios…), so it is only
 * loaded on the FIRST push notification instead of at process start.
 *
 * Production: init failure fails closed (returns null — callers skip the FCM
 * send but still persist the notification row). Development: falls back to a
 * mock so local testing works without real credentials.
 */
let messagingInstance: any = null;
let initFailed = false;

export async function getMessaging(): Promise<any | null> {
  if (messagingInstance) return messagingInstance;
  if (initFailed) return null;

  try {
    const admin = await import('firebase-admin');
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);

    if (Object.keys(serviceAccount).length === 0 || !serviceAccount.private_key) {
      throw new Error('Missing private_key in Firebase Service Account');
    }

    // Handle cases where dotenv/JSON parsing leaves literal \n in the string
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    messagingInstance = admin.messaging();
    return messagingInstance;
  } catch (error: any) {
    initFailed = true;
    if (process.env.NODE_ENV === 'production') {
      logger.error(`Firebase init failed (push notifications disabled): ${error.message || error}`);
      return null;
    }
    logger.warn(`Firebase init failed (dev mock): ${error.message || error}`);
    messagingInstance = {
      send: async () => { logger.warn('Mock Firebase: message sent'); return 'mock-message-id'; },
      sendEach: async () => ({ responses: [], successCount: 0, failureCount: 0 }),
      sendEachForMulticast: async () => ({ responses: [], successCount: 0, failureCount: 0 }),
    };
    return messagingInstance;
  }
}
