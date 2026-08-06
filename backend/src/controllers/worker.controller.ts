import { Request, Response } from 'express';
import { workerService } from '../services/worker.service';
import { sendResponse, sendError } from '../utils/response';
import { recordWorkerStreak } from '../utils/activity';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// Public-facing worker view — NEVER include bank/UPI/wallet/ban fields here.
const WORKER_PUBLIC_SELECT = {
  id: true, userId: true, category: true, subCategories: true, skills: true,
  bio: true, experienceYears: true, hourlyRate: true, rating: true, totalRatings: true,
  completedJobs: true, city: true, state: true, isFeatured: true, featuredUntil: true,
  verificationStatus: true, isAvailable: true, isOnline: true, languages: true, workPhotos: true,
} as const;

export const workerController = {
  getWorkers: async (req: Request, res: Response) => {
    try {
      const workers = await prisma.workerProfile.findMany({
        select: {
          ...WORKER_PUBLIC_SELECT,
          user: { select: { id: true, name: true, avatarUrl: true, role: true } },
          services: { where: { isActive: true }, select: { id: true, name: true, description: true, basePrice: true, priceUnit: true, imageUrl: true, isActive: true } },
        },
      });
      sendResponse(res, 200, workers);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getStats: async (req: AuthRequest, res: Response) => {
    try {
      // OPTIMIZATION: Batch queries into a single Promise.all() instead of sequential round-trips
      // This reduces latency from ~4-5 separate database calls to 1-2 concurrent batches
      
      const workerProfilePromise = prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId }
      });

      const [workerProfile, counts, recentAccepts, cityData, openRequests] = await Promise.all([
        workerProfilePromise,
        // Batch both count queries together
        Promise.all([
          prisma.booking.count({ where: { workerId: req.user!.userId } }),
          prisma.booking.count({
            where: { workerId: req.user!.userId, status: { in: ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'] } },
          }),
        ]) as Promise<[number, number]>,
        prisma.booking.findMany({
          where: { workerId: req.user!.userId, acceptedAt: { not: null } },
          select: { createdAt: true, acceptedAt: true },
          take: 10,
          orderBy: { acceptedAt: 'desc' },
        }),
        // Get city rank in a single query with sorting (avoid fetching all workers in-memory)
        // OPTIMIZATION: Use database-side sorting instead of JS filtering
        (async () => {
          const profile = await workerProfilePromise;
          if (!profile?.city) return null;
          // Get worker's rank using window functions would be ideal, but Prisma doesn't support
          // them directly. Instead, fetch paginated top earners and find within top N (e.g., top 1000)
          const topEarners = await prisma.workerProfile.findMany({
            where: { city: profile.city, isBanned: false },
            select: { id: true, totalEarned: true },
            orderBy: { totalEarned: 'desc' as const },
            take: 1000, // Reasonable limit for city rankings
          });
          const rankIndex = topEarners.findIndex((w: any) => w.id === profile.id);
          if (rankIndex !== -1) {
            return { rank: rankIndex + 1, percentile: Math.max(1, Math.ceil(((rankIndex + 1) / Math.max(1, topEarners.length)) * 100)) };
          }
          return null;
        })(),
        // Get open requests count (separate query is fine, uses indexed filter)
        (async () => {
          const profile = await workerProfilePromise;
          if (!profile?.city || !profile?.category) return 0;
          return prisma.customerJobRequest.count({
            where: { 
              city: profile.city,
              category: profile.category,
              status: 'OPEN'
            }
          });
        })(),
      ]);

      if (!workerProfile) return sendResponse(res, 200, {});

      const [totalBookings, acceptedBookings] = counts;
      const acceptanceRate = totalBookings > 0 ? Math.round((acceptedBookings / totalBookings) * 100) : 0;

      let avgResponseSec = 0;
      if (recentAccepts.length > 0) {
        // Response time = time between request creation and the worker's
        // accept. Measured in seconds (not rounded minutes) so sub-minute
        // responses — the norm in this request/quote model — don't collapse
        // to "0m". Outliers (>2h) are excluded as noise.
        const diffs = recentAccepts
          .map((b: any) => (b.acceptedAt!.getTime() - b.createdAt.getTime()) / 1000)
          .filter((d: number) => d > 0 && d < 7200);
        if (diffs.length > 0) {
          avgResponseSec = diffs.reduce((a: number, b: number) => a + b, 0) / diffs.length;
        }
      }

      const cityRank = (cityData as any)?.rank || 1;
      const cityPercentile = (cityData as any)?.percentile || 5;
      const openRequestsCount = (openRequests as any) || 0;

      sendResponse(res, 200, { ...workerProfile, acceptanceRate, responseTimeMinutes: avgResponseSec > 0 ? Math.round(avgResponseSec) / 60 : 0, cityRank, cityPercentile, openRequestsCount });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  setOnlineStatus: async (req: AuthRequest, res: Response) => {
    try {
      const { isAvailable, lat, lng } = req.body;
      const payload: any = {
        isAvailable: Boolean(isAvailable),
        isOnline: Boolean(isAvailable),
        updatedAt: new Date(),
      };

      if (lat !== undefined && lng !== undefined) {
        const parsedLat = parseFloat(lat as any);
        const parsedLng = parseFloat(lng as any);
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
          payload.latitude = parsedLat;
          payload.longitude = parsedLng;
          payload.lastLocationAt = new Date();
        }
      }

      const updated = await prisma.workerProfile.update({
        where: { userId: req.user!.userId },
        data: payload,
      });

      // Going online counts as an active day for the daily streak.
      if (Boolean(isAvailable)) {
        await recordWorkerStreak(req.user!.userId);
      }

      sendResponse(res, 200, updated);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  searchWorkers: async (req: Request, res: Response) => {
    try {
      const { lat, lng, category, radius, minRating, maxPrice, page, limit, search } = req.query;
      const workers = await workerService.searchWorkers(
        parseFloat(lat as string),
        parseFloat(lng as string),
        category as any,
        minRating ? parseFloat(minRating as string) : undefined,
        maxPrice ? parseFloat(maxPrice as string) : undefined,
        radius ? parseInt(radius as string) : undefined,
        page ? parseInt(page as string) : 1,
        limit ? parseInt(limit as string) : 20,
        search as string | undefined
      );
      sendResponse(res, 200, workers);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getVerificationStatus: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { verificationStatus: true, verificationNote: true, verifiedAt: true, idProofType: true, idProofUrl: true, selfieUrl: true },
      });
      if (!profile) return sendError(res, 404, 'Worker profile not found');
      sendResponse(res, 200, profile);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  requestVerification: async (_req: AuthRequest, res: Response) => {
    // Deprecated : the old endpoint accepted arbitrary client URLs and
    // set PENDING with no documents/consent. Use the guided flow:
    // GET /workers/verification/config → POST /start → /documents → /submit.
    return sendError(res, 410, 'Verification flow updated. Please use the guided verification flow in the app.');
  },

  appealBan: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Worker profile not found');
      if (!profile.isBanned) return sendError(res, 400, 'Account is not banned');
      if (profile.isPermanentlyBanned) return sendError(res, 403, 'Permanent ban. Cannot appeal.');

      const existing = await prisma.supportTicket.findFirst({
        where: { userId: req.user!.userId, subject: 'Ban Appeal', status: { in: ['open', 'in_progress'] } },
      });
      if (existing) return sendError(res, 400, 'You already have an open appeal. Please wait for admin response.');

      const ticket = await prisma.supportTicket.create({
        data: {
          userId: req.user!.userId,
          subject: 'Ban Appeal',
          description: req.body.reason || 'I would like to appeal my ban. Please review.',
          priority: 'high',
          status: 'open',
        },
      });

      await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: req.user!.userId,
          message: 'BAN APPEAL: ' + (req.body.reason || 'Worker is appealing their ban. Please review audit logs.'),
          isSystemMessage: true,
        },
      });

      try {
        const { emitToUser } = await import('../services/socket.service');
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
        for (const a of admins) {
          try { emitToUser(a.id, 'ban_appeal', { userId: req.user!.userId, ticketId: ticket.id, name: (req.user as any)?.name || 'Worker' }); } catch {}
        }
      } catch {}

      sendResponse(res, 201, { ticketId: ticket.id }, 'Appeal submitted. An admin will review your case and respond in the support chat.');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getBanStatus: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { isBanned: true, isPermanentlyBanned: true, isFrozen: true, walletBalance: true, banReason: true, bannedAt: true, appealCount: true },
      });
      sendResponse(res, 200, profile || {});
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getLeaderboard: async (req: AuthRequest, res: Response) => {
    try {
      const scope = ['city', 'area', 'global'].includes(req.query.scope as string)
        ? (req.query.scope as string) : 'city';
      const metric = req.query.metric === 'rating' ? 'rating' : 'earnings';
      const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);

      const me = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { city: true, state: true },
      });

      const where: any = { isBanned: false };
      if (scope === 'city' && me?.city) where.city = me.city;
      else if (scope === 'area' && me?.state) where.state = me.state;

      // Earnings is the primary rank; rating breaks ties (and vice versa).
      const orderBy = metric === 'rating'
        ? [{ rating: 'desc' as const }, { totalEarned: 'desc' as const }]
        : [{ totalEarned: 'desc' as const }, { rating: 'desc' as const }];

      const [workers, total] = await Promise.all([
        prisma.workerProfile.findMany({
          where,
          select: {
            id: true, userId: true, city: true, state: true, rating: true, totalEarned: true,
            user: { select: { name: true, avatarUrl: true } },
          },
          orderBy,
          take: limit,
        }),
        prisma.workerProfile.count({ where }),
      ]);

      const ranked = workers.map((w: any, i: number) => ({ rank: i + 1, ...w }));

      // The caller's own rank — it may sit beyond the returned top-N slice.
      let myRank: number | null = ranked.find((w: any) => w.userId === req.user!.userId)?.rank ?? null;
      let myStats = ranked.find((w: any) => w.userId === req.user!.userId) || null;

      if (!myStats) {
        const mine = await prisma.workerProfile.findUnique({
          where: { userId: req.user!.userId },
          select: { totalEarned: true, rating: true },
        });
        if (mine) {
          myStats = mine;
          const ahead = await prisma.workerProfile.count({
            where: {
              ...where,
              ...(metric === 'rating'
                ? { OR: [
                    { rating: { gt: mine.rating } },
                    { rating: mine.rating, totalEarned: { gt: mine.totalEarned } },
                  ] }
                : { OR: [
                    { totalEarned: { gt: mine.totalEarned } },
                    { totalEarned: mine.totalEarned, rating: { gt: mine.rating } },
                  ] }),
            },
          });
          myRank = ahead + 1;
        }
      }

      sendResponse(res, 200, { scope, metric, total, myRank, myStats, workers: ranked });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getWorkerById: async (req: Request, res: Response) => {
    try {
      const worker = await prisma.workerProfile.findUnique({
        where: { userId: req.params.userId },
        select: {
          ...WORKER_PUBLIC_SELECT,
          // No phone here — contact info is only shared after a booking is accepted.
          user: { select: { name: true, avatarUrl: true } },
          services: { where: { isActive: true }, select: { id: true, name: true, description: true, basePrice: true, priceUnit: true, imageUrl: true, isActive: true } },
        },
      });
      if (!worker) return sendError(res, 404, 'Worker not found');

      const photos = await prisma.jobPhoto.findMany({
        where: { workerProfileId: worker.id, isPublic: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      sendResponse(res, 200, { ...worker, photos });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getMyProfile: async (req: AuthRequest, res: Response) => {
    try {
      const worker = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: {
          ...WORKER_PUBLIC_SELECT,
          healthStatus: true,
          cancellationRate: true,
          reliabilityScore: true,
          isUrgentEligible: true,
          isGuaranteed: true,
          user: { select: { name: true, avatarUrl: true } },
        },
      });
      if (!worker) return sendError(res, 404, 'Worker profile not found');
      sendResponse(res, 200, worker);
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
