import { prisma } from '../config/prisma';
import { haversineDistance } from '../utils/haversine';

// ─── Matching Engine ─────────────────────────────
// Server-side eligibility: who should receive a request? Never a blind broadcast.
// Availability toggling feeds matching, NOT the normal market price.

export interface MatchQuery {
  category: string;
  latitude?: number | null;
  longitude?: number | null;
  urgent?: boolean; // require isUrgentEligible
  excludeUserIds?: string[];
  limit?: number;
}

export const matchingService = {
 /**
 * Eligible workers for a category/request:
 * verified + (urgent-eligible when urgent) + active + account standing +
 * service-area radius + not currently busy.
 */
  async findEligibleWorkers(q: MatchQuery) {
    const where: any = {
      category: q.category,
      isAvailable: true,
      verificationStatus: 'VERIFIED',
      isFrozen: false,
      isBanned: false,
      isPermanentlyBanned: false,
    };
    if (q.urgent) where.isUrgentEligible = true;
    if (q.excludeUserIds?.length) where.userId = { notIn: q.excludeUserIds };

    // Only the fields the matcher + callers consume — never bank/wallet columns.
    const workers = await prisma.workerProfile.findMany({
      where,
      select: {
        userId: true, latitude: true, longitude: true, serviceRadiusKm: true,
      },
    });

    // Remove workers with a conflicting active booking
    const busy = await this.busyWorkerIds();
    const idle = workers.filter(w => !busy.has(w.userId));

    const withDistance = idle
      .map(w => ({
        w,
        distance: q.latitude != null && q.longitude != null
          ? haversineDistance(q.latitude, q.longitude, w.latitude || 0, w.longitude || 0)
          : 0,
      }))
      .filter(({ w, distance }) => {
        if (q.latitude == null || q.longitude == null) return true;
        if (w.latitude == null || w.longitude == null) return true; // Include workers without a set location
        return distance <= (w.serviceRadiusKm || 10);
      })
      .sort((a, b) => a.distance - b.distance);

    if (q.limit) return withDistance.slice(0, q.limit).map(x => x.w);
    return withDistance.map(x => x.w);
  },

 /** Set of worker userIds currently occupied (active booking in flight). */
  async busyWorkerIds(): Promise<Set<string>> {
    const active = await prisma.booking.findMany({
      where: { status: { in: ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'] } },
      select: { workerId: true },
    });
    return new Set(active.map(b => b.workerId));
  },
};
