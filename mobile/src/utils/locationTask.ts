import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { socketService } from '../api/socket';

/**
 * Shared worker live-location producer.
 *
 * Runs via expo-task-manager so the worker's position keeps streaming even when
 * the app is backgrounded — a single source of truth for BOTH foreground and
 * background fixes. The worker's own map, and the customer's map, both render
 * from the server echo (`worker_location_updated`), so there is exactly one
 * location pipeline for every booking type.
 *
 * Falls back to disabled (callers use a foreground `watchPositionAsync`
 * instead) when the TaskManager isn't available, e.g. Expo Go on Android.
 */
export const LOCATION_TASK_NAME = 'kaamwalla-worker-live-location';

let activeBookingId: string | null = null;

export function getActiveTrackingBooking(): string | null {
  return activeBookingId;
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;
  if (!activeBookingId) return;
  const locations = (data as any)?.locations;
  if (!Array.isArray(locations) || locations.length === 0) return;

  const coords = locations[locations.length - 1]?.coords;
  if (!coords) return;
  const { latitude, longitude } = coords as { latitude: number; longitude: number };

  // Reject malformed / placeholder fixes — never (0,0) or beyond the globe.
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
  if (!isFinite(latitude) || !isFinite(longitude)) return;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  if (Math.abs(latitude) < 1 && Math.abs(longitude) < 1) return;

  // Ensure the socket is up (it may have dropped while backgrounded), then push.
  socketService.connect();
  socketService.emitLocationUpdate(activeBookingId, latitude, longitude);
});

/** Whether background location tracking is supported in this runtime. */
export async function isBackgroundLocationAvailable(): Promise<boolean> {
  try {
    return await TaskManager.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Start the shared location task for `bookingId`. Returns `true` when the
 * background task was started, `false` when the caller should fall back to a
 * foreground-only (watchPositionAsync) stream.
 */
export async function startWorkerLocationSharing(bookingId: string): Promise<boolean> {
  if (!(await isBackgroundLocationAvailable())) return false;
  activeBookingId = bookingId;
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,
      distanceInterval: 1,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Live location sharing',
        notificationBody: 'Sharing your location with the customer',
        notificationColor: '#FF5C00',
      },
    });
    return true;
  } catch {
    // Fallback to foreground watch.
    activeBookingId = null;
    return false;
  }
}

/** Stop streaming. Idempotent and safe to call on unmount/cancel. */
export async function stopWorkerLocationSharing(): Promise<void> {
  activeBookingId = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // Ignore — nothing to clean up.
  }
}