import 'dotenv/config'; // Add this at the very top
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { Server } from 'socket.io';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/prisma';

// Global process-level error handling — a stray async rejection or exception
// must never silently kill the API. Unhandled rejections are logged (Node
// would otherwise crash); uncaught exceptions are logged then exit so the
// process manager restarts a clean instance.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason instanceof Error ? reason.stack || reason.message : reason);
});
process.on('uncaughtException', (err) => {
  // console.error is synchronous — guaranteed to flush before process.exit.
  console.error('UNCAUGHT EXCEPTION:', err?.stack || err?.message || err);
  logger.error('Uncaught exception:', err?.stack || err?.message || err);
  process.exit(1);
});

import { redis } from './config/redis';
import { sanitizeStrings } from './middleware/sanitize.middleware';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { ipBanMiddleware } from './middleware/security.middleware';
import { errorHandler } from './middleware/error.middleware';
import apiRoutes from './routes';

import { initSocket, registerSocketListeners } from './services/socket.service';
import { schedulePushRetryWorker, stopPushRetryWorker } from './workers/push-retry.worker';
import { ALLOWED_ORIGINS } from './config/cors';
import { StartupProfiler } from './utils/startup-profiler';
import { SubscriptionExpiryScheduler } from './services/subscription-expiry-scheduler';
import { ScheduledJobsScheduler } from './services/scheduled-jobs-scheduler';
import { connectRedisLazy } from './services/lazy-redis-factory';

// Initialize the startup profiler to measure phase durations
const profiler = new StartupProfiler();

// ============================================================================
// PHASE 1: CRITICAL PATH (database validation, Express setup, routes)
// ============================================================================
profiler.mark('phase_1_critical_path');

// Validate database connectivity before proceeding
async function validateDatabaseReady(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('[Startup] Database validation successful');
  } catch (error: any) {
    logger.error(
      '[Startup] Database validation failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Create and configure Express app with middleware
function setupExpressApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  // 'dev' format is terminal-noise; use the standard Apache format in production.
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.json({
    limit: '5mb',
    // Capture the RAW request body verbatim so the Cashfree webhook can verify
    // its HMAC signature over the exact bytes Cashfree signed.
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));
  app.use(sanitizeStrings);
  app.use(ipBanMiddleware);

  return app;
}

// Register health probes
function registerHealthProbes(app: express.Express): void {
  // Liveness probe: always returns 200 immediately
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness probe: checks database connectivity
  app.get('/readyz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not-ready' });
    }
  });
}

// Register API routes
function registerApiRoutes(app: express.Express): void {
  app.use('/api/v1', apiLimiter, apiRoutes);
  app.use(errorHandler);
}

// Run Phase 1 initialization
async function initializeCriticalPath(): Promise<express.Express> {
  await validateDatabaseReady();
  const app = setupExpressApp();
  registerHealthProbes(app);
  registerApiRoutes(app);
  return app;
}

// Initialize Phase 1 synchronously
async function main() {
  const app = setupExpressApp();
  
  // Validate database before proceeding
  try {
    await validateDatabaseReady();
  } catch (error: any) {
    logger.error('[Startup] Critical path initialization failed:', error);
    process.exit(1);
  }
  
  registerHealthProbes(app);
  registerApiRoutes(app);

  profiler.end('phase_1_critical_path');

  // ============================================================================
  // PHASE 2: HTTP READY (server listening, Socket.IO instance)
  // ============================================================================
  profiler.mark('phase_2_http_ready');

  const server = http.createServer(app);
  // Socket.IO enforces the same origin allowlist as HTTP CORS (config/cors.ts).
  // Create server instance but defer event listener registration.
  const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS } });

  // Initialize Socket.IO (deferred: listener registration happens after server.listen())
  initSocket(io);

  server.listen(env.PORT, () => {
    logger.info(`[Startup] HTTP server listening on port ${env.PORT}`);
    profiler.end('phase_2_http_ready');

    // ========================================================================
    // PHASE 3: BACKGROUND SERVICES (non-blocking, deferred initialization)
    // ========================================================================
    profiler.mark('phase_3_background_services');

    // Schedule subscription expiry check (first run +60s, then every 60min)
    const subscriptionScheduler = new SubscriptionExpiryScheduler();
    subscriptionScheduler.start();

    // Schedule background jobs (first run +10s, then per-job intervals)
    const jobsScheduler = new ScheduledJobsScheduler();
    jobsScheduler.start();

    // Schedule push notification retry worker (every 30s)
    schedulePushRetryWorker(30_000);

    // Lazy-load Redis in background (non-blocking, fallback available)
    connectRedisLazy();

    // Lazy-load Firebase (on-demand, when first used)
    // Lazy-load Twilio (on-demand, when first used)

    // Defer Socket.IO event listener registration until after server is listening
    setImmediate(() => {
      registerSocketListeners();
      logger.info('[Startup] Socket.IO event listeners registered');
    });

    profiler.end('phase_3_background_services');

    // Log startup metrics
    const totalTime = profiler.totalTime();
    logger.info(`[Startup] Total startup time: ${totalTime}ms`);
    logger.info('[Startup] Profiler report:', profiler.report());
  });

  // ============================================================================
  // GRACEFUL SHUTDOWN
  // ============================================================================
  let shuttingDown = false;
  let subscriptionScheduler: SubscriptionExpiryScheduler | null = null;
  let jobsScheduler: ScheduledJobsScheduler | null = null;

  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[Shutdown] ${signal} received, initiating graceful shutdown`);

    // Set hard timeout so we never hang
    const forceExit = setTimeout(() => {
      logger.error('[Shutdown] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    // Stop accepting new connections
    server.close(async () => {
      try {
        logger.info('[Shutdown] Stopping push notification retry worker');
        stopPushRetryWorker();
      } catch (err) {
        logger.warn('[Shutdown] Push worker stop error:', err);
      }

      try {
        logger.info('[Shutdown] Closing Socket.IO connections');
        io.close();
      } catch (err) {
        logger.warn('[Shutdown] Socket.IO close error:', err);
      }

      try {
        logger.info('[Shutdown] Disconnecting Redis');
        await redis.disconnect();
      } catch (err) {
        logger.warn('[Shutdown] Redis disconnect error:', err);
      }

      try {
        logger.info('[Shutdown] Closing Prisma connection');
        await prisma.$disconnect();
      } catch (err) {
        logger.warn('[Shutdown] Prisma disconnect error:', err);
      }

      logger.info('[Shutdown] Graceful shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('[Startup] Fatal error during initialization:', error);
  process.exit(1);
});
