import { prisma } from '../config/prisma';

// Throttle window: at most one lastActiveAt write per user within this window,
// so a busy user costs at most ~288 writes/day instead of one per request.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 10_000;

// Timestamp (ms) of the last write we issued for each user.
const lastTouch = new Map<string, number>();

/**
 * Fire-and-forget realtime "last seen" heartbeat. Never blocks or fails the
 * request it runs under — DB errors are swallowed, writes are throttled.
 */
export function touchUserActivity(userId: string): void {
  const now = Date.now();
  const last = lastTouch.get(userId) ?? 0;
  if (now - last < WINDOW_MS) return;

  // Reserve the slot immediately; the write below is idempotent so a lost race
  // between two concurrent requests is harmless.
  lastTouch.set(userId, now);

  prisma.user
    .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
    .then(() => {
      // Keep the cache bounded on long-lived servers.
      if (lastTouch.size > MAX_CACHE_SIZE) {
        const cutoff = now - WINDOW_MS * 4;
        for (const [key, value] of lastTouch) {
          if (value < cutoff) lastTouch.delete(key);
        }
      }
    })
    .catch(() => {
      // Best-effort only — the request that triggered this must not fail.
    });
}

/**
 * Consecutive-day "daily streak" for workers.
 *
 * A worker keeps the streak alive by being active each calendar day — going
 * online, or accepting/completing a booking. The day boundary is the server's
 * local timezone, the same `setHours(0,0,0,0)` convention the rest of the app
 * uses for "today":
 *   - never recorded before  → streak = 1
 *   - already active today   → unchanged (idempotent, no double-count)
 *   - active yesterday       → streak + 1
 *   - gap of ≥ 1 day         → streak resets to 1
 *
 * Best-effort: swallows DB errors so the request that triggered it never fails.
 */
export async function recordWorkerStreak(userId: string): Promise<void> {
  try {
    const profile = await prisma.workerProfile.findUnique({
      where: { userId },
      select: { streakDays: true, lastStreakAt: true },
    });
    if (!profile) return;

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    let streak = 1;
    if (profile.lastStreakAt) {
      const lastDay = new Date(profile.lastStreakAt);
      lastDay.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - lastDay.getTime()) / 86400000);
      if (diffDays === 0) return;              // already counted today
      if (diffDays === 1) streak = profile.streakDays + 1;
      // diffDays > 1 → streak broken, reset to 1 (already the default)
    }

    await prisma.workerProfile.update({
      where: { userId },
      data: { streakDays: streak, lastStreakAt: now },
    });
  } catch {
    // Best-effort only — never block the underlying action.
  }
}
