import { logger } from '../utils/logger';

/**
 * ScheduledJobsScheduler: Defers production scheduled jobs to avoid blocking startup.
 *
 * Strategy:
 * - Jobs are NOT initialized during startup (critical path)
 * - After 10 seconds, all scheduled jobs are started
 * - Individual job failures do not block other jobs
 * - Each job has its own error handling and logging
 *
 * Jobs managed:
 * 1. Urgent expiry (every 30s) — expire SEARCHING urgent requests
 * 2. Orphan media cleanup (hourly) — clean draft uploads after 24h
 * 3. Issue promotion (hourly) — promote CANDIDATE → ESTABLISHED issues
 * 4. Issue demotion (daily) — demote ESTABLISHED → DECLINING → ARCHIVED issues
 * 5. Pricing anomalies (daily) — detect market pricing anomalies
 */

type JobName = 'urgentExpiry' | 'orphanMediaCleanup' | 'issuePromotion' | 'issueDemotion' | 'pricingAnomalies' | 'pendingBookingExpiry';

export class ScheduledJobsScheduler {
  private jobTimers: Map<JobName, NodeJS.Timeout> = new Map();
  private initTimer: NodeJS.Timeout | null = null;

  /**
   * Start the scheduler: initialize all jobs after 10 seconds.
   */
  start(): void {
    logger.info('[Startup] Scheduled jobs scheduler: scheduling initialization in 10 seconds');

    const INIT_DELAY = 10 * 1000; // 10 seconds

    this.initTimer = setTimeout(() => {
      logger.info('[Startup] Scheduled jobs scheduler: initializing jobs');
      this.initializeJobs();
    }, INIT_DELAY);
  }

  /**
   * Initialize all scheduled jobs with proper error handling.
   * Each job failure does not block the others.
   */
  private initializeJobs(): void {
    this.startUrgentExpiryJob();
    this.startOrphanMediaCleanupJob();
    this.startIssuePromotionJob();
    this.startIssueDemotionJob();
    this.startPricingAnomaliesJob();
    this.startPendingBookingExpiryJob();
  }

  /**
   * Urgent expiry job: expire SEARCHING urgent requests every 30 seconds.
   */
  private startUrgentExpiryJob(): void {
    const interval = 30 * 1000; // 30 seconds

    const runJob = async () => {
      try {
        const { expireUrgentRequests } = await import('./scheduledJobs.service');
        const count = await expireUrgentRequests();
        if (count > 0) {
          logger.debug(`[Jobs] Urgent expiry: expired ${count} requests`);
        }
      } catch (error: any) {
        logger.error(
          '[Jobs] Urgent expiry job failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    logger.info('[Startup] Starting urgent expiry job (every 30s)');

    // Run immediately on startup
    runJob().catch((err) => logger.error('[Jobs] Initial urgent expiry run failed:', err));

    // Then run at regular intervals
    const timer = setInterval(runJob, interval);
    this.jobTimers.set('urgentExpiry', timer);
  }

  /**
   * Orphan media cleanup job: runs hourly.
   */
  private startOrphanMediaCleanupJob(): void {
    const interval = 60 * 60 * 1000; // 1 hour

    const runJob = async () => {
      try {
        const { cleanupOrphanedMedia } = await import('./scheduledJobs.service');
        const count = await cleanupOrphanedMedia();
        if (count > 0) {
          logger.debug(`[Jobs] Orphan media cleanup: cleaned ${count} items`);
        }
      } catch (error: any) {
        logger.error(
          '[Jobs] Orphan media cleanup job failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    logger.info('[Startup] Starting orphan media cleanup job (hourly)');

    const timer = setInterval(runJob, interval);
    this.jobTimers.set('orphanMediaCleanup', timer);
  }

  /**
   * Issue promotion job: promote CANDIDATE → ESTABLISHED every hour.
   */
  private startIssuePromotionJob(): void {
    const interval = 60 * 60 * 1000; // 1 hour

    const runJob = async () => {
      try {
        const { promoteIssueCandidates } = await import('./scheduledJobs.service');
        const count = await promoteIssueCandidates();
        if (count > 0) {
          logger.debug(`[Jobs] Issue promotion: promoted ${count} issues`);
        }
      } catch (error: any) {
        logger.error(
          '[Jobs] Issue promotion job failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    logger.info('[Startup] Starting issue promotion job (hourly)');

    const timer = setInterval(runJob, interval);
    this.jobTimers.set('issuePromotion', timer);
  }

  /**
   * Issue demotion job: demote ESTABLISHED → DECLINING → ARCHIVED daily.
   */
  private startIssueDemotionJob(): void {
    const interval = 24 * 60 * 60 * 1000; // 1 day

    const runJob = async () => {
      try {
        const { demoteInactiveIssues } = await import('./scheduledJobs.service');
        const result = await demoteInactiveIssues();
        logger.debug(
          `[Jobs] Issue demotion: declining=${result.declining}, archived=${result.archived}`,
        );
      } catch (error: any) {
        logger.error(
          '[Jobs] Issue demotion job failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    logger.info('[Startup] Starting issue demotion job (daily)');

    const timer = setInterval(runJob, interval);
    this.jobTimers.set('issueDemotion', timer);
  }

  /**
   * Pricing anomalies job: detect pricing anomalies daily.
   */
  private startPricingAnomaliesJob(): void {
    const interval = 24 * 60 * 60 * 1000; // 1 day

    const runJob = async () => {
      try {
        const { detectPricingAnomalies } = await import('./scheduledJobs.service');
        const count = await detectPricingAnomalies();
        if (count > 0) {
          logger.debug(`[Jobs] Pricing anomalies: detected ${count} anomalies`);
        }
      } catch (error: any) {
        logger.error(
          '[Jobs] Pricing anomalies job failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    logger.info('[Startup] Starting pricing anomalies job (daily)');

    const timer = setInterval(runJob, interval);
    this.jobTimers.set('pricingAnomalies', timer);
  }

  /**
   * Pending booking expiry job: expire PENDING/NEGOTIATING requests after 24h.
   * Runs hourly.
   */
  private startPendingBookingExpiryJob(): void {
    const interval = 60 * 60 * 1000; // 1 hour

    const runJob = async () => {
      try {
        const { expirePendingBookings } = await import('./scheduledJobs.service');
        const count = await expirePendingBookings();
        if (count > 0) {
          logger.debug(`[Jobs] Pending booking expiry: expired ${count} requests`);
        }
      } catch (error: any) {
        logger.error(
          '[Jobs] Pending booking expiry job failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    logger.info('[Startup] Starting pending booking expiry job (hourly)');

    const timer = setInterval(runJob, interval);
    this.jobTimers.set('pendingBookingExpiry', timer);
  }

  /**
   * Stop all scheduled jobs (for graceful shutdown).
   */
  stop(): void {
    if (this.initTimer) clearTimeout(this.initTimer);

    for (const [jobName, timer] of this.jobTimers.entries()) {
      clearInterval(timer);
      logger.info(`[Shutdown] Stopped scheduled job: ${jobName}`);
    }

    this.jobTimers.clear();
  }
}
