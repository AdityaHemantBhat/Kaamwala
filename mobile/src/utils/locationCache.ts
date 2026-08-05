/**
 * Location Cache
 *
 * Caches the last known location for quick retrieval on repeated screen opens.
 * Useful for displaying previous positions immediately while fresh data loads.
 *
 * Cache expires after 30 seconds (avoids stale data).
 */

interface CachedLocation {
  lat: number;
  lng: number;
  timestamp: number;
  bookingId: string;
}

const CACHE_TIMEOUT_MS = 30000; // 30 seconds
const locationCache = new Map<string, CachedLocation>();

export function cacheLocation(bookingId: string, lat: number, lng: number): void {
  locationCache.set(bookingId, {
    lat,
    lng,
    timestamp: Date.now(),
    bookingId,
  });
}

export function getCachedLocation(bookingId: string): { lat: number; lng: number } | null {
  const cached = locationCache.get(bookingId);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TIMEOUT_MS) {
    locationCache.delete(bookingId);
    return null;
  }

  return { lat: cached.lat, lng: cached.lng };
}

export function isCacheValid(bookingId: string): boolean {
  const cached = locationCache.get(bookingId);
  if (!cached) return false;

  const age = Date.now() - cached.timestamp;
  return age <= CACHE_TIMEOUT_MS;
}

export function clearLocationCache(bookingId?: string): void {
  if (bookingId) {
    locationCache.delete(bookingId);
  } else {
    locationCache.clear();
  }
}

export function getCacheAge(bookingId: string): number {
  const cached = locationCache.get(bookingId);
  if (!cached) return -1;
  return Date.now() - cached.timestamp;
}
