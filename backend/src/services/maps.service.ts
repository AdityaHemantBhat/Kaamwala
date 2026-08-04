import { prisma } from '../config/prisma';
import { haversineDistance } from '../utils/haversine';

// No external maps provider. ETA is derived from straight-line (haversine)
// distance at an assumed urban speed; route polylines are generated on-device
// via OSRM (see the live-tracking WebViews). The backend calls no Google Maps API.
const AVG_KM_PER_MIN = 0.5; // ~30 km/h urban average

export const mapsService = {
  /**
   * Straight-line ETA in SECONDS, or `null` when the destination is too far /
   * invalid. Callers divide by 60 for minutes. (Same unit contract the socket
   * handler already expects.)
   */
  async getETA(originLat: number, originLng: number, destLat: number, destLng: number): Promise<number | null> {
    const distKm = haversineDistance(originLat, originLng, destLat, destLng);
    if (distKm > 10) return null; // too far — don't show an unreliable ETA
    const minutes = distKm < 0.2 ? 0 : distKm / AVG_KM_PER_MIN;
    return Math.round(minutes * 60);
  },

  async updateWorkerLocation(workerProfileId: string, bookingId: string, lat: number, lng: number, accuracy?: number) {
    // Store the fix as history, and keep the worker's current position fresh.
    await prisma.workerLocation.create({
      data: { workerProfileId, bookingId, latitude: lat, longitude: lng, accuracy },
    });

    await prisma.workerProfile.update({
      where: { id: workerProfileId },
      data: { latitude: lat, longitude: lng, lastLocationAt: new Date() },
    });

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { address: true },
    });

    const etaSeconds = booking?.address
      ? await this.getETA(lat, lng, booking.address.latitude, booking.address.longitude)
      : null;
    const eta = etaSeconds !== null ? Math.round(etaSeconds / 60) : null;

    // Persist the live position on every update so a polling customer always
    // has the latest fix, even when the destination is too far for an ETA.
    await prisma.booking.update({
      where: { id: bookingId },
      data: { workerLat: lat, workerLng: lng, workerEta: eta },
    });

    return { lat, lng, eta };
  },

  async getWorkerLocation(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { workerLat: true, workerLng: true, workerEta: true },
    });
    return booking || { workerLat: null, workerLng: null, workerEta: null };
  },

  async getLocationHistory(workerProfileId: string, bookingId: string) {
    return prisma.workerLocation.findMany({
      where: { workerProfileId, bookingId },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    });
  },

  // Alert when worker is 5 min away
  async checkEtaAlert(bookingId: string, etaMinutes: number): Promise<boolean> {
    if (etaMinutes <= 5 && etaMinutes > 0) {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (booking && !booking.safetyAlertSentAt) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: { safetyAlertSentAt: new Date() },
        });
        return true; // should trigger notification
      }
    }
    return false;
  },

  /**
   * Route polylines are produced on-device via OSRM in the live-tracking
   * WebViews. Kept as a no-op for API parity — the app never calls it.
   */
  async getDirections(
    _originLat?: number, _originLng?: number, _destLat?: number, _destLng?: number,
  ): Promise<null> {
    return null;
  },
};
