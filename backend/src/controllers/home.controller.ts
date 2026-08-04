import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { suggestionService } from '../services/suggestion.service';
import { feedService } from '../services/feed.service';
import { demandService } from '../services/demand.service';
import { AuthRequest } from '../middleware/auth.middleware';

export const homeController = {
  getHomeData: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const city = (req.query.city as string) || 'Delhi';
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        banners, cp, savedCount, activeCount, maintCount,
        suggestions, feed, demandSignals, upcomingMaint,
        recentTxns, completedCount,
        todayBookings, cityWorkersCount, topWorkers,
        rebookWorkers, newWorkers, userSubData,
        referralStats, communityCustomers, communityWorkers,
        communityCompleted, bookingsThisWeek,
      ] = await Promise.all([
        prisma.appBanner.findMany({
          where: { isActive: true },
          select: { id: true, title: true, subtitle: true, imageUrl: true, deepLink: true, bgColor: true, type: true },
          orderBy: { sortOrder: 'asc' }, take: 5,
        }),
        prisma.customerProfile.findUnique({
          where: { userId },
          select: { walletBalance: true, loyaltyPoints: true, loyaltyTier: true, totalSaved: true, totalBookings: true, totalSpent: true, createdAt: true },
        }),
        prisma.savedWorker.count({ where: { userId } }),
        prisma.booking.count({ where: { customerId: userId, status: { in: ['PENDING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'] } } }),
        prisma.maintenancePlan.count({ where: { customerId: userId, isActive: true } }),
        suggestionService.getSuggestions(userId, city).catch(() => []),
        feedService.getCityFeed(city).catch(() => []),
        demandService.getAllCityDemands(city).catch(() => []),
        prisma.maintenancePlan.findMany({
          where: { customerId: userId, isActive: true, nextServiceAt: { gte: new Date() } },
          select: { id: true, serviceName: true, nextServiceAt: true, frequencyMonths: true, serviceCategory: true },
          orderBy: { nextServiceAt: 'asc' }, take: 3,
        }),
        prisma.transaction.findMany({
          where: { userId },
          select: { id: true, type: true, amount: true, description: true, createdAt: true, status: true },
          orderBy: { createdAt: 'desc' }, take: 5,
        }).catch(() => []),
        prisma.booking.count({ where: { customerId: userId, status: 'COMPLETED' } }).catch(() => 0),
        prisma.booking.count({ where: { address: { city }, createdAt: { gte: today } } }).catch(() => 0),
        prisma.workerProfile.count({ where: { city, isAvailable: true,
          isFrozen: false, isOnline: true, verificationStatus: 'VERIFIED' } }).catch(() => 0),
        // "Top rated" = best rated verified workers in the city. Deliberately NOT
        // filtered by isOnline (a volatile per-second flag that empties the pool
        // whenever workers close the app) — online status is for real-time
        // matching, not recommendations. Falls back city-wide if the city has none.
        (async () => {
          const select: any = { id: true, userId: true, category: true, rating: true, completedJobs: true, hourlyRate: true, isGuaranteed: true, user: { select: { name: true } } };
          const where: any = { isAvailable: true, isFrozen: false, verificationStatus: 'VERIFIED', rating: { gt: 0 } };
          let list: any[] = await prisma.workerProfile.findMany({ where: { ...where, city }, select, orderBy: { rating: 'desc' }, take: 6 }).catch(() => []);
          if (!list.length) list = await prisma.workerProfile.findMany({ where, select, orderBy: { rating: 'desc' }, take: 6 }).catch(() => []);
          return list;
        })(),
        prisma.booking.findMany({
          where: { customerId: userId, status: 'COMPLETED' },
          select: {
            id: true, workerId: true, serviceName: true, serviceCategory: true,
            baseAmount: true, pricingUnit: true, estimatedDuration: true,
            scheduledAt: true, completedAt: true,
            address: { select: { id: true, city: true, label: true, line1: true } },
            worker: {
              select: {
                name: true, avatarUrl: true,
                workerProfile: { select: { category: true, rating: true, hourlyRate: true } },
              },
            },
          },
          orderBy: { completedAt: 'desc' }, take: 6,
        }).catch(() => []),
        prisma.workerProfile.findMany({
          where: { city, isAvailable: true, isOnline: true, isFrozen: false, verificationStatus: 'VERIFIED', createdAt: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } },
          select: { id: true, userId: true, category: true, rating: true, user: { select: { name: true } } },
          take: 4,
        }).catch(() => []),
        prisma.userSubscription.findUnique({
          where: { userId },
          select: { plan: true, status: true, currentPeriodEnd: true },
        }).catch(() => null),
        prisma.referralEvent.aggregate({ where: { referrerId: userId, bonusPaidAt: { not: null } }, _count: { id: true }, _sum: { referrerBonus: true } }).catch(() => ({ _count: { id: 0 }, _sum: { referrerBonus: 0 } })),
        prisma.user.count({ where: { role: 'CUSTOMER' } }).catch(() => 0),
        prisma.user.count({ where: { role: 'WORKER' } }).catch(() => 0),
        prisma.booking.count({ where: { status: 'COMPLETED' } }).catch(() => 0),
        prisma.booking.count({ where: { customerId: userId, createdAt: { gte: new Date(today.getTime() - today.getDay() * 86400000) } } }).catch(() => 0),
      ]);

      const subData = userSubData as any;
      const refStats = referralStats as any;

      sendResponse(res, 200, {
        createdAt: cp?.createdAt,
        walletBalance: cp?.walletBalance || 0,
        loyaltyPoints: cp?.loyaltyPoints || 0,
        loyaltyTier: cp?.loyaltyTier || 'BRONZE',
        totalSaved: cp?.totalSaved || 0,
        totalSpent: cp?.totalSpent || 0,
        totalBookings: cp?.totalBookings || 0,
        completedBookings: completedCount,
        savedWorkerCount: savedCount,
        activeBookingCount: activeCount,
        maintenancePlanCount: maintCount,
        greeting: (() => {
          const h = new Date().getHours();
          if (h < 12) return 'Good morning';
          if (h < 17) return 'Good afternoon';
          return 'Good evening';
        })(),
        city,
        todayCityBookings: todayBookings,
        availableWorkers: cityWorkersCount,
        communityStats: {
          totalCustomers: communityCustomers,
          totalWorkers: communityWorkers,
          totalCompleted: communityCompleted,
        },
        banners,
        suggestions,
        feed,
        demandSignals,
        upcomingMaintenance: upcomingMaint,
        recentTransactions: recentTxns,
        topWorkers,
        rebookWorkers,
        newWorkers,
        subscription: subData?.plan ? { plan: subData.plan, status: subData.status, expiresAt: subData.currentPeriodEnd } : { plan: 'BASIC', status: 'active' },
        referralCount: refStats?._count?.id || 0,
        referralEarnings: refStats?._sum?.referrerBonus || 0,
        weeklyChallenge: {
          bookingsThisWeek,
          target: 3,
          reward: 50,
        },
      });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getCategories: async (_req: any, res: Response) => {
    const categories = [
      { key: 'PLUMBER', label: 'Plumber', icon: 'pipe-wrench' },
      { key: 'ELECTRICIAN', label: 'Electrician', icon: 'lightning-bolt' },
      { key: 'CARPENTER', label: 'Carpenter', icon: 'saw-blade' },
      { key: 'MAID', label: 'Maid', icon: 'broom' },
      { key: 'DRIVER', label: 'Driver', icon: 'car' },
      { key: 'PAINTER', label: 'Painter', icon: 'format-paint' },
      { key: 'AC_TECHNICIAN', label: 'AC Technician', icon: 'air-conditioner' },
      { key: 'PEST_CONTROL', label: 'Pest Control', icon: 'bug' },
      { key: 'GARDENER', label: 'Gardener', icon: 'flower' },
      { key: 'COOK', label: 'Cook', icon: 'food-apple' },
      { key: 'TUTOR', label: 'Tutor', icon: 'school' },
      { key: 'SECURITY_GUARD', label: 'Security', icon: 'shield' },
      { key: 'NURSE', label: 'Nurse', icon: 'medical-bag' },
      { key: 'BABYSITTER', label: 'Babysitter', icon: 'baby-face-outline' },
    ];
    sendResponse(res, 200, categories);
  }
};
