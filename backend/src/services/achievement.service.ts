import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';

/**
 * Badge auto-granting.
 *
 * Achievements were previously only ever written by the seed script — a real
 * worker could never earn a badge through usage. This service evaluates a
 * worker's current stats and grants any newly-earned badges, idempotently.
 * It is called after a paid booking completes, after a rating is recorded, and
 * lazily when the worker opens the achievements screen (so pre-existing stats
 * backfill instantly).
 *
 * Only badges whose criteria are derivable from data the schema tracks are
 * auto-grantable. SPEED_DEMON (10 jobs within estimate time) and PERFECT_WEEK
 * (7 jobs in 7 days, all 5-star) need per-booking on-time / date-window data
 * that isn't stored, so they remain seed/manual-only and render as locked.
 */

interface EarnedStats {
  completedJobs: number;
  rating: number;
  disputedJobs: number;
  totalEarned: number;
  approvedPhotos: number;
}

type BadgeRule = (s: EarnedStats) => boolean;

const BADGE_RULES: Record<string, BadgeRule> = {
  FIRST_JOB: (s) => s.completedJobs >= 1,
  RISING_STAR: (s) => s.completedJobs >= 10 && s.rating >= 4.5,
  TRUSTED_PRO: (s) => s.completedJobs >= 50 && s.rating >= 4.7 && s.disputedJobs === 0,
  CENTURY: (s) => s.completedJobs >= 100,
  TOP_EARNER: (s) => s.totalEarned >= 50000,
  PHOTO_PRO: (s) => s.approvedPhotos >= 20,
};

const BADGE_LABELS: Record<string, string> = {
  FIRST_JOB: 'First Job',
  RISING_STAR: 'Rising Star',
  TRUSTED_PRO: 'Trusted Pro',
  CENTURY: 'Century',
  TOP_EARNER: 'Top Earner',
  PHOTO_PRO: 'Photo Pro',
};

/**
 * Evaluate a worker's stats and create any newly-earned badge rows.
 *
 * Idempotency: the `@@unique([workerProfileId, badge])` constraint is the
 * source of truth — a concurrent/duplicate evaluation hits P2002 and is
 * treated as "already granted". Newly granted badges trigger a push
 * notification. Best-effort: this function should never throw for a caller to
 * handle (it is fire-and-forget from booking/review/read paths), so internal
 * notification failures are logged and swallowed.
 */
export async function grantEarnedBadges(workerId: string): Promise<string[]> {
  const profile = await prisma.workerProfile.findUnique({
    where: { userId: workerId },
    select: {
      id: true,
      completedJobs: true,
      rating: true,
      disputedJobs: true,
      totalEarned: true,
    },
  });
  if (!profile) return [];

  const approvedPhotos = await prisma.jobPhoto.count({
    where: { workerProfileId: profile.id, customerApproved: true },
  });

  const stats: EarnedStats = {
    completedJobs: profile.completedJobs,
    rating: profile.rating,
    disputedJobs: profile.disputedJobs,
    totalEarned: profile.totalEarned,
    approvedPhotos,
  };

  const earned = Object.keys(BADGE_RULES).filter((badge) => BADGE_RULES[badge](stats));
  if (!earned.length) return [];

  const existing = await prisma.workerAchievement.findMany({
    where: { workerProfileId: profile.id },
    select: { badge: true },
  });
  const have = new Set(existing.map((row) => row.badge));

  const granted: string[] = [];
  for (const badge of earned) {
    if (have.has(badge)) continue;
    try {
      await prisma.workerAchievement.create({
        data: { workerProfileId: profile.id, badge, notified: true },
      });
      granted.push(badge);
    } catch (e: any) {
      if (e?.code === 'P2002') continue; // concurrent grant — already earned
      throw e;
    }
  }

  for (const badge of granted) {
    try {
      await notificationService.sendPushNotification(
        workerId,
        'Badge Earned!',
        `You earned the ${BADGE_LABELS[badge] || badge} badge. Keep it up!`,
        'achievement',
        { badge },
      );
    } catch (e: any) {
      logger.warn('Badge notification failed', { workerId, badge, error: e?.message });
    }
  }

  if (granted.length) {
    logger.info('Badges granted', { workerId, badges: granted });
  }
  return granted;
}
