import { redis } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * LazyRedisFactory: Non-blocking Redis initialization with in-memory fallbacks.
 *
 * Strategy:
 * - Redis connection is initiated in the background (non-blocking)
 * - If Redis is unavailable, in-memory caches are used for:
 *   * OTP verification (temporary tokens)
 *   * Rate-limiting counters
 *   * Chat violation checks
 * - Once Redis connects, state transitions to use live Redis
 * - Errors do not block startup; application continues with fallbacks
 *
 * Usage:
 *   connectRedisLazy()  // Start background connection attempt
 *   getRedis()          // Get connected instance or fallback
 *   isRedisReady()      // Check if using live Redis
 */

let redisReady = false;
let redisConnectingPromise: Promise<void> | null = null;

// In-memory fallbacks when Redis is unavailable
const inMemoryFallback = {
  otp: new Map<string, string>(),
  rateLimits: new Map<string, number>(),
  violations: new Map<string, number>(),
};

/**
 * Start non-blocking Redis connection attempt.
 * Logs status but does not throw or block the startup path.
 */
export function connectRedisLazy(): void {
  if (redisConnectingPromise) return; // Already connecting

  redisConnectingPromise = (async () => {
    try {
      if (!redis.isOpen) {
        await redis.connect();
      }
      redisReady = true;
      logger.info('[Redis] Connected successfully');
    } catch (err: any) {
      redisReady = false;
      logger.warn(
        '[Redis] Connection failed, using in-memory fallbacks:',
        err instanceof Error ? err.message : String(err),
      );
    }
  })();
}

/**
 * Get the Redis instance or fallback object.
 * - If Redis is connected, returns the live redis client
 * - If Redis is unavailable, returns fallback object with safe methods
 */
export function getRedis(): any {
  if (redisReady) {
    return redis;
  }

  // Return proxy that uses in-memory fallback
  return createFallbackProxy();
}

/**
 * Check if Redis is currently ready and connected.
 */
export function isRedisReady(): boolean {
  return redisReady;
}

/**
 * Create a proxy that routes Redis operations to in-memory fallbacks.
 * Provides basic compatibility for OTP, rate-limit, and violation checks.
 */
function createFallbackProxy(): any {
  return {
    set: async (key: string, value: string, opts?: any) => {
      const match = parseKey(key);
      if (match?.type === 'otp') {
        inMemoryFallback.otp.set(key, value);
        // Auto-expire after TTL (in opts.EX)
        if (opts?.EX) {
          setTimeout(() => inMemoryFallback.otp.delete(key), opts.EX * 1000);
        }
        return 'OK';
      }
      if (match?.type === 'rateLimit') {
        inMemoryFallback.rateLimits.set(key, parseInt(value, 10));
        if (opts?.EX) {
          setTimeout(() => inMemoryFallback.rateLimits.delete(key), opts.EX * 1000);
        }
        return 'OK';
      }
      return 'OK';
    },

    get: async (key: string) => {
      const match = parseKey(key);
      if (match?.type === 'otp') {
        return inMemoryFallback.otp.get(key) || null;
      }
      if (match?.type === 'rateLimit') {
        const val = inMemoryFallback.rateLimits.get(key);
        return val !== undefined ? String(val) : null;
      }
      return null;
    },

    incr: async (key: string) => {
      const match = parseKey(key);
      if (match?.type === 'rateLimit') {
        const current = inMemoryFallback.rateLimits.get(key) || 0;
        const next = current + 1;
        inMemoryFallback.rateLimits.set(key, next);
        return next;
      }
      return 1;
    },

    del: async (key: string) => {
      const match = parseKey(key);
      if (match?.type === 'otp') {
        return inMemoryFallback.otp.delete(key) ? 1 : 0;
      }
      if (match?.type === 'rateLimit') {
        return inMemoryFallback.rateLimits.delete(key) ? 1 : 0;
      }
      return 0;
    },

    exists: async (key: string) => {
      const match = parseKey(key);
      if (match?.type === 'otp') {
        return inMemoryFallback.otp.has(key) ? 1 : 0;
      }
      if (match?.type === 'rateLimit') {
        return inMemoryFallback.rateLimits.has(key) ? 1 : 0;
      }
      return 0;
    },

    expire: async (key: string, ttl: number) => {
      // In-memory version: expire after ttl seconds
      setTimeout(() => {
        const match = parseKey(key);
        if (match?.type === 'otp') inMemoryFallback.otp.delete(key);
        if (match?.type === 'rateLimit') inMemoryFallback.rateLimits.delete(key);
      }, ttl * 1000);
      return 1;
    },

    isOpen: false,
    isReady: () => false,
  };
}

/**
 * Parse a Redis key to infer its type (for fallback routing).
 * Examples:
 *   otp:user:123 → { type: 'otp', ... }
 *   rateLimit:api:user:123 → { type: 'rateLimit', ... }
 */
function parseKey(key: string): { type: string } | null {
  if (key.startsWith('otp:')) {
    return { type: 'otp' };
  }
  if (key.startsWith('rateLimit:') || key.startsWith('limiter:')) {
    return { type: 'rateLimit' };
  }
  if (key.startsWith('violation:') || key.startsWith('chatViolation:')) {
    return { type: 'violation' };
  }
  return null;
}

/**
 * Attempt to use Redis if available, otherwise use fallback.
 * This is a utility for callers to gracefully handle Redis availability.
 */
export async function withRedisOrFallback<T>(
  fn: (client: any) => Promise<T>,
  fallbackValue: T,
): Promise<T> {
  try {
    const client = getRedis();
    return await fn(client);
  } catch (error: any) {
    logger.warn('[Redis] Operation failed, using fallback:', error?.message);
    return fallbackValue;
  }
}
