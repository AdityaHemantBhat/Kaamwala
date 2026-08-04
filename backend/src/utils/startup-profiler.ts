import { logger } from './logger';

/**
 * StartupProfiler: Lightweight instrumentation for tracking startup phase timings.
 * Measures elapsed time from process start, records individual phase durations,
 * and provides reporting and total time calculation.
 *
 * Used to verify startup completes within 2-second target and to identify
 * performance bottlenecks in the initialization sequence.
 */
export class StartupProfiler {
  private phases: Map<string, { start: number; duration: number }> = new Map();
  private startTime: number = Date.now();

  /**
   * Mark the beginning of a phase.
   * Records the relative start time (ms since process start).
   */
  mark(phaseName: string): void {
    const relativeTime = Date.now() - this.startTime;
    this.phases.set(phaseName, {
      start: relativeTime,
      duration: 0,
    });
  }

  /**
   * End a previously marked phase and calculate its duration.
   * Logs the phase name and duration immediately.
   */
  end(phaseName: string): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      logger.warn(`[Startup] Phase '${phaseName}' was not marked; cannot end`);
      return;
    }

    const currentTime = Date.now() - this.startTime;
    phase.duration = currentTime - phase.start;

    logger.info(`[Startup] ${phaseName}: ${phase.duration}ms`);
  }

  /**
   * Get a report of all recorded phases with their durations.
   * Returns an array of {phaseName, durationMs} objects.
   */
  report(): Array<{ phase: string; ms: number }> {
    return Array.from(this.phases.entries()).map(([phaseName, data]) => ({
      phase: phaseName,
      ms: data.duration,
    }));
  }

  /**
   * Get the total elapsed time since process start (in milliseconds).
   */
  totalTime(): number {
    return Date.now() - this.startTime;
  }
}
