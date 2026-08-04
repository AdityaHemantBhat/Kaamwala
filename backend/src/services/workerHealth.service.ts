import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

export const HEALTH_ACTIVE = 'ACTIVE';
export const HEALTH_WARNED = 'WARNED';
export const HEALTH_RESTRICTED = 'RESTRICTED';
export const HEALTH_SUSPENDED = 'SUSPENDED';

// Thresholds (rate of post-"On My Way" worker cancellations over total jobs).
// Configurable via MarketConfig so admins can tune without a deploy.
const DEFAULT_THRESHOLDS = {
  warn: 0.15,       // >15%  → WARNED (notify, flag for review)
  restrict: 0.30,   // >30%  → RESTRICTED (lose urgent/guaranteed eligibility)
  suspend: 0.60,    // >60%  → SUSPENDED (banned)
};

async function threshold(key: string, fallback: number): Promise<number> {
  try {
    const cfg = await prisma.marketConfig.findUnique({ where: { key } });
    if (cfg?.value) {
      const n = parseFloat(cfg.value);
      if (!Number.isNaN(n)) return n;
    }
  } catch {}
  return fallback;
}

export const workerHealthService = {
  /**
   * Recompute a worker's cancellation-rate health ladder from post-"On My Way"
   * cancellations. Escalation is derived purely from the current rate, so a
   * worker's status can improve once their rate drops back below a threshold;
   * warningCount only ever accumulates (history of warnings).
   */
  async computeWorkerHealth(workerId: string) {
    const [worker, postOmwCancellations] = await Promise.all([
      prisma.workerProfile.findUnique({
        where: { userId: workerId },
        select: { completedJobs: true, cancelledJobs: true, cancellationWarningCount: true },
      }),
      prisma.cancellationRecord.count({
        where: {
          cancelledBy: 'WORKER',
          booking: { workerId, travelProtectionEligibleAt: { not: null } },
        },
      }),
    ]);

    if (!worker) return null;

    const totalJobs = worker.completedJobs + worker.cancelledJobs;
    // Require a minimum sample so a single bad day doesn't ban a new worker.
    const minJobs = await threshold('WORKER_HEALTH_MIN_JOBS', 5);
    const cancellationRate = totalJobs > 0 ? postOmwCancellations / totalJobs : 0;

    const [warnRate, restrictRate, suspendRate] = await Promise.all([
      threshold('WORKER_HEALTH_WARN_RATE', DEFAULT_THRESHOLDS.warn),
      threshold('WORKER_HEALTH_RESTRICT_RATE', DEFAULT_THRESHOLDS.restrict),
      threshold('WORKER_HEALTH_SUSPEND_RATE', DEFAULT_THRESHOLDS.suspend),
    ]);

    let healthStatus = HEALTH_ACTIVE;
    if (totalJobs > minJobs && cancellationRate > suspendRate) {
      healthStatus = HEALTH_SUSPENDED;
    } else if (totalJobs > minJobs && cancellationRate > restrictRate) {
      healthStatus = HEALTH_RESTRICTED;
    } else if (totalJobs > minJobs && cancellationRate > warnRate) {
      healthStatus = HEALTH_WARNED;
    }

    const warningCount = healthStatus === HEALTH_ACTIVE
      ? worker.cancellationWarningCount
      : (worker.cancellationWarningCount || 0) + 1;

    // Quality score 0–100 (higher = healthier); risk score = 100 − quality.
    const reliabilityScore = Math.round(Math.max(0, 100 - cancellationRate * 100));

    await prisma.workerProfile.update({
      where: { userId: workerId },
      data: {
        healthStatus,
        cancellationRate: Number(cancellationRate.toFixed(4)),
        reliabilityScore,
        cancellationWarningCount: warningCount,
        healthUpdatedAt: new Date(),
        // RESTRICTED / SUSPENDED lose urgent + guaranteed eligibility.
        ...(healthStatus === HEALTH_RESTRICTED || healthStatus === HEALTH_SUSPENDED
          ? {
              isUrgentEligible: false,
              isGuaranteed: false,
              urgentEligibilityReason: `High post-OMW cancellation rate (${healthStatus})`,
            }
          : {}),
        ...(healthStatus === HEALTH_SUSPENDED
          ? { isBanned: true, banReason: 'High post-OMW cancellation rate (SUSPENDED)', bannedAt: new Date() }
          : {}),
      },
    });

    logger.info(`Worker health recomputed for ${workerId}: status=${healthStatus} rate=${cancellationRate.toFixed(3)}`);

    return {
      healthStatus,
      cancellationRate,
      reliabilityScore,
      warningCount,
    };
  },
};
