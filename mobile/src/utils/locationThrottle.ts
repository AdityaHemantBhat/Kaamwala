/**
 * Location Update Throttle
 *
 * Prevents excessive socket emissions for location updates by enforcing a
 * minimum interval between emits. This reduces server load, bandwidth usage,
 * and improves socket.io throughput while maintaining adequate tracking accuracy.
 *
 * Default: 2000ms (0.5 updates/sec) instead of 1-5 updates/sec from GPS.
 */

let lastEmitTime = 0;
const THROTTLE_INTERVAL_MS = 2000; // Only emit every 2 seconds

export function shouldEmitLocation(): boolean {
  const now = Date.now();
  if (now - lastEmitTime >= THROTTLE_INTERVAL_MS) {
    lastEmitTime = now;
    return true;
  }
  return false;
}

export function resetThrottle(): void {
  lastEmitTime = 0;
}

export function getLastEmitTime(): number {
  return lastEmitTime;
}

export function getThrottleIntervalMs(): number {
  return THROTTLE_INTERVAL_MS;
}
