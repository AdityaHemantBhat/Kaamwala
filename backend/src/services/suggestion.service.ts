import { prisma } from '../config/prisma';
import { haversineDistance } from '../utils/haversine';

interface SuggestionResult {
  workerId: string;
  score: number;
  reasons: string[];
  user?: { name: string | null };
}

export const suggestionService = {
  async getSuggestions(customerId: string, city?: string, latitude?: number, longitude?: number): Promise<SuggestionResult[]> {
    // 1. Fetch customer's booking history — only needed fields
    const customerBookings = await prisma.booking.findMany({
      where: { customerId, status: { in: ['COMPLETED', 'CANCELLED', 'DISPUTED'] } },
      select: {
        id: true,
        workerId: true,
        serviceCategory: true,
        totalAmount: true,
        worker: {
          select: { workerProfile: { select: { id: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 2. Analyze category preferences
    const categoryCount = new Map<string, number>();
    for (const b of customerBookings) {
      categoryCount.set(b.serviceCategory, (categoryCount.get(b.serviceCategory) || 0) + 1);
    }

    const topCategories = [...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    // 3. Get candidate workers. Deliberately NOT filtered by isOnline (a
    // volatile per-second flag that would empty the pool whenever workers close
    // the app) — recommendations are built on stable signals. The pool
    // progressively relaxes (drop category, then drop city) so the section
    // always has something to show.
    const select: any = {
      userId: true,
      category: true,
      rating: true,
      completedJobs: true,
      isGuaranteed: true,
      latitude: true,
      longitude: true,
      user: { select: { name: true } },
      services: { where: { isActive: true }, select: { id: true, name: true, basePrice: true } },
      _count: { select: { jobs: true } },
    };
    const baseWhere: any = { isAvailable: true, isFrozen: false, verificationStatus: 'VERIFIED' };

    let workers: any[] = await prisma.workerProfile.findMany({
      where: {
        ...baseWhere,
        ...(topCategories.length > 0 ? { category: { in: topCategories as any[] } } : {}),
        ...(city ? { city } : {}),
      },
      select,
      take: 30,
    });
    if (workers.length === 0 && topCategories.length > 0) {
      workers = await prisma.workerProfile.findMany({
        where: { ...baseWhere, ...(city ? { city } : {}) },
        select,
        take: 30,
      });
    }
    if (workers.length === 0 && city) {
      workers = await prisma.workerProfile.findMany({
        where: baseWhere,
        select,
        take: 30,
      });
    }

    // 4. Batch fetch previous reviews for workers that have history with this customer
    const previousWorkerIds = customerBookings.map(b => b.workerId);
    const previousReviews = await prisma.review.findMany({
      where: {
        authorId: customerId,
        targetId: { in: previousWorkerIds },
      },
      select: { targetId: true, rating: true, bookingId: true },
    });
    const reviewMap = new Map(previousReviews.map(r => [r.targetId, r]));

    // 5. Score each worker — no individual DB queries
    const scored = workers.map(worker => {
      let score = 0;
      const reasons: string[] = [];

      // Rating score (0-40)
      score += (worker.rating / 5) * 40;

      // Completed jobs (0-25)
      score += Math.min(worker.completedJobs / 100, 1) * 25;

      // Category match (0-20)
      if (topCategories.includes(worker.category)) {
        score += 20;
        reasons.push(`Expert in ${worker.category.replace(/_/g, ' ')} services`);
      }

      // Previously worked with (bonus)
      const prevBooking = customerBookings.find(b => b.workerId === worker.userId);
      if (prevBooking) {
        score += 15;
        reasons.push('You have worked together before');
        const review = reviewMap.get(worker.userId);
        if (review && review.rating >= 4) {
          score += 10;
          reasons.push(`You rated ${review.rating}/5 previously`);
        }
      }

      // Distance (0-15)
      if (latitude && longitude && worker.latitude && worker.longitude) {
        const dist = haversineDistance(latitude, longitude, worker.latitude, worker.longitude);
        score += dist < 5 ? 15 : dist < 10 ? 10 : 5;
        if (dist < 5) reasons.push('Located near you');
        else if (dist < 10) reasons.push('Within your area');
      }

      // Guaranteed (10)
      if (worker.isGuaranteed) {
        score += 10;
        reasons.push('KaamWala Guaranteed');
      }

      return {
        workerId: worker.userId,
        score: Math.round(score * 100) / 100,
        reasons: reasons.slice(0, 3),
        user: worker.user,
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, 10);
  },
};
