import { prisma } from '../config/prisma';
import { ServiceCategory } from '@prisma/client';
import { haversineDistance } from '../utils/haversine';

// Public search results — never expose bank/UPI/wallet/ban state.
const SEARCH_SELECT = {
  id: true, userId: true, category: true, subCategories: true, skills: true,
  bio: true, experienceYears: true, hourlyRate: true, rating: true, totalRatings: true,
  completedJobs: true, city: true, state: true, isFeatured: true, verificationStatus: true,
  isAvailable: true, isOnline: true, languages: true, workPhotos: true,
  latitude: true, longitude: true,
} as const;

export const workerService = {
  async searchWorkers(lat: number, lng: number, category?: ServiceCategory, minRating?: number, maxPrice?: number, radius: number = 10, page: number = 1, limit: number = 20, search?: string, city?: string, state?: string) {
    // Search is DISCOVERY — verification status and current availability are
    // surfaced as badges on the result cards, not hard filters. Only hard
    // account blocks (bans / frozen wallet) exclude a worker.
    const whereClause: any = {
      isBanned: false,
      isPermanentlyBanned: false,
      isFrozen: false,
    };
    if (category) whereClause.category = category;
    if (minRating) whereClause.rating = { gte: minRating };
    if (maxPrice) whereClause.hourlyRate = { lte: maxPrice };

    // Text search — case-insensitive substring (prefix is ranked higher in JS
    // below). NOTE: `category` is a Prisma enum and cannot be `contains`-
    // searched — use the dedicated `category` filter param for that.
    let searchLower = '';
    if (search && search.trim()) {
      const q = search.trim();
      searchLower = q.toLowerCase();
      whereClause.OR = [
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { bio: { contains: q, mode: 'insensitive' } },
      ];
    }

    const workers = await prisma.workerProfile.findMany({
      where: whereClause,
      select: {
        ...SEARCH_SELECT,
        user: { select: { id: true, name: true, avatarUrl: true, role: true } },
        services: { where: { isActive: true }, select: { id: true, name: true, description: true, basePrice: true, priceUnit: true, imageUrl: true, isActive: true } },
      },
    });

    let results = workers.map(worker => {
      const hasCoords = lat !== undefined && lat !== null && !isNaN(lat) && lng !== undefined && lng !== null && !isNaN(lng) && worker.latitude !== null && worker.latitude !== undefined && worker.longitude !== null && worker.longitude !== undefined;
      const distance = hasCoords ? haversineDistance(lat, lng, worker.latitude!, worker.longitude!) : null;
      const avatarUrl = worker.user?.avatarUrl || null;
      return { ...worker, distanceKm: distance, avatarUrl };
    });

    // ── Service-area filter (Amazon-style "serves your area") ──────────────
    // The customer's area is always passed when known: live coords when location
    // permission is on, otherwise the saved (default) address's coords + city/
    // state. Workers are hidden when they don't serve that area. City/state is
    // matched case/whitespace-insensitively because both sides are free text —
    // the same convention requests.controller.browseRequests uses for worker
    // matching.
    const hasCoords = typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);
    const hasArea = !!(city && city.trim()) || !!(state && state.trim());
    const norm = (s: any) => (s || '').toString().trim().toLowerCase();
    const inArea = (w: any) =>
      (city && city.trim() && norm(w.city) === norm(city)) ||
      (state && state.trim() && norm(w.state) === norm(state));

    if (hasCoords) {
      // Precise: filter by service radius around the customer's location.
      results = results.filter(w => (w.distanceKm ?? 9999) <= radius);
      // Broadening fallback: nobody within the radius, but workers exist in the
      // same city/state — surface them rather than an empty "no workers" screen.
      if (results.length === 0 && hasArea) {
        results = results.filter(inArea);
      }
    } else if (hasArea) {
      // No coordinates (e.g. only a saved address) — fall back to area match.
      results = results.filter(inArea);
    }

    results.forEach(w => {
      const ratingScore = (w.rating / 5) * 0.4;
      const jobsScore = (Math.min(w.completedJobs, 100) / 100) * 0.3;
      const distanceScore = (w.distanceKm == null || radius <= 0) ? 0 : ((radius - w.distanceKm) / radius) * 0.3;
      (w as any).score = ratingScore + jobsScore + distanceScore;
    });

    // Featured boost only counts while unexpired — an expired plan/boost must
    // not keep a worker pinned to the top forever.
    const now = new Date();
    const isFeaturedActive = (w: any) => !!w.isFeatured && (!w.featuredUntil || new Date(w.featuredUntil) > now);

    // Relevance first: prefix on the name > substring on the name > substring on
    // the bio. Only then featured boost and the rating/jobs/distance score.
    const relevance = (w: any): number => {
      if (!searchLower) return 0;
      const n = (w.user?.name || '').toLowerCase();
      const b = (w.bio || '').toLowerCase();
      if (n.startsWith(searchLower)) return 3;
      if (n.includes(searchLower)) return 2;
      if (b.includes(searchLower)) return 1;
      return 0;
    };

    results.sort((a, b) => {
      const ra = relevance(a);
      const rb = relevance(b);
      if (ra !== rb) return rb - ra;
      const fa = isFeaturedActive(a);
      const fb = isFeaturedActive(b);
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      return (b as any).score - (a as any).score;
    });

    return results.slice((page - 1) * limit, page * limit);
  },
};
