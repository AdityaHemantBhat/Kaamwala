import { createClient } from 'redis';
import { env } from './env';
import { logger } from '../utils/logger';

// Production-grade Redis client:
//  - explicit reconnect strategy (exponential backoff, keeps retrying) so a
//    transient socket drop never kills the process or leaves the client dead
//  - clean logging via the app logger (no console.error spam)
// The app has in-memory fallbacks for OTP / rate-limit / chat-violation paths,
// so a Redis outage degrades gracefully instead of crashing.
export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff capped at 30s; never give up.
      return Math.min(1000 * 2 ** retries, 30000);
    },
  },
});

redis.on('error', (err) => logger.warn('Redis socket error (auto-reconnecting):', err?.message || err));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));
redis.on('ready', () => logger.info('Redis connected'));
redis.on('end', () => logger.warn('Redis connection closed'));

// Connect lazily and resiliently — a transient Redis outage must not crash boot.
export const connectRedis = async (): Promise<void> => {
  try {
    if (!redis.isOpen) await redis.connect();
  } catch (e: any) {
    logger.error('Redis connect failed (continuing with in-memory fallbacks):', e?.message || e);
  }
};
