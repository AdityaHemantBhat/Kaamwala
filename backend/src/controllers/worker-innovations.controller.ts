import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';

export const workerInnovationsController = {
  getJobMatches: async (req: AuthRequest, res: Response) => {
    try {
      const wp = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { category: true, hourlyRate: true, city: true },
      });
      if (!wp) return sendError(res, 404, 'Worker not found');

      const openRequests = await prisma.customerJobRequest.findMany({
        where: { status: 'OPEN' },
        select: { id: true, title: true, description: true, category: true, budget: true, budgetType: true, city: true, createdAt: true, customer: { select: { user: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' }, take: 30,
      });

      const scored = openRequests.map(req => {
        let score = 0; const reasons: string[] = [];
        if (req.category === wp.category) { score += 40; reasons.push('Your category'); }
        if (req.city && wp.city && req.city.toLowerCase() === wp.city.toLowerCase()) { score += 30; reasons.push('Same city'); }
        if (req.budget && req.budget >= wp.hourlyRate * 0.8) { score += 20; reasons.push('Good budget'); }
        if (Date.now() - new Date(req.createdAt).getTime() < 86400000) { score += 10; reasons.push('Posted today'); }
        return { id: req.id, title: req.title, category: req.category, budget: req.budget ? `₹${req.budget}` : 'Negotiable', budgetType: req.budgetType, city: req.city, customerName: req.customer?.user?.name || 'Customer', score: Math.min(score, 100), reasons: reasons.slice(0, 2), createdAt: req.createdAt };
      });

      scored.sort((a, b) => b.score - a.score);
      sendResponse(res, 200, { matches: scored.slice(0, 10), total: scored.length });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getHeatmap: async (req: AuthRequest, res: Response) => {
    try {
      const wp = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId }, select: { city: true, category: true } });
      const city = (req.query.city as string) || wp?.city || 'Delhi';
      const hour = new Date().getHours();

      const signals = await prisma.demandSignal.findMany({ where: { city, hour }, select: { category: true, demandScore: true, surgeActive: true, surgeMultiplier: true, hour: true } });
      const requestCounts = await prisma.customerJobRequest.groupBy({ by: ['category'], where: { status: 'OPEN', city }, _count: true });
      const countMap = new Map(requestCounts.map(r => [r.category, r._count]));

      const heatmap = signals.map(s => ({ category: s.category, demand: s.demandScore > 1.3 ? 'High' : s.demandScore > 0.8 ? 'Medium' : 'Low', score: s.demandScore, surge: s.surgeActive, multiplier: s.surgeMultiplier, openRequests: countMap.get(s.category) || 0 }));
      const peakHours = signals.filter(s => s.category === (wp?.category || 'PLUMBER')).sort((a, b) => b.demandScore - a.demandScore).slice(0, 3);

      sendResponse(res, 200, { heatmap, peakHours: peakHours.map(p => ({ hour: `${p.hour}:00`, score: p.demandScore })), bestTime: peakHours[0] ? `${peakHours[0].hour}:00 — Best time for ${wp?.category || 'your category'} jobs` : 'Data unavailable', city });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getSmartPricing: async (req: AuthRequest, res: Response) => {
    try {
      const wp = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId }, select: { category: true, hourlyRate: true, city: true, completedJobs: true, rating: true } });
      if (!wp) return sendError(res, 404, 'Worker not found');

      const marketRate = await prisma.marketRate.findFirst({ where: { category: wp.category, city: wp.city || '' }, select: { marketRate: true } });
      const marketAvg = marketRate?.marketRate || wp.hourlyRate * 1.2;
      const ratingBonus = wp.rating > 4.5 ? 0.15 : wp.rating > 4.0 ? 0.1 : 0.05;
      const expBonus = Math.min(wp.completedJobs / 100, 0.2);
      const suggestedMin = Math.round(marketAvg * 0.8);
      const suggestedMax = Math.round(marketAvg * 1.1 + marketAvg * ratingBonus + marketAvg * expBonus);
      const suggested = Math.round((suggestedMin + suggestedMax) / 2);

      sendResponse(res, 200, { currentRate: wp.hourlyRate, marketAvg: Math.round(marketAvg), suggested, range: { min: suggestedMin, max: suggestedMax }, ratingBonus: Math.round(ratingBonus * 100), expBonus: Math.round(expBonus * 100), tip: wp.hourlyRate < suggestedMin ? 'You could charge more!' : wp.hourlyRate > suggestedMax ? 'Your rate is above market average.' : 'Your pricing is competitive!' });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getChallenges: async (req: AuthRequest, res: Response) => {
    try {
      const wp = await prisma.workerProfile.findUnique({ where: { userId: req.user!.userId }, select: { id: true, completedJobs: true, totalEarned: true } });
      if (!wp) return sendError(res, 404, 'Worker not found');

      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);

      const [weeklyJobs, monthlyJobs, todayJobs, weeklyEarned] = await Promise.all([
        prisma.booking.count({ where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: weekStart } } }),
        prisma.booking.count({ where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
        prisma.booking.count({ where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: todayStart } } }),
        prisma.booking.aggregate({ where: { workerId: req.user!.userId, status: 'COMPLETED', completedAt: { gte: weekStart } }, _sum: { workerEarnings: true } }),
      ]);

      const challenges = [
        { id: 'daily_jobs', title: '5 Jobs Today', desc: 'Complete 5 jobs today', progress: todayJobs, target: 5, reward: 100, unit: 'jobs', emoji: '⚡' },
        { id: 'weekly_jobs', title: 'Weekly Warrior', desc: 'Complete 15 jobs this week', progress: weeklyJobs, target: 15, reward: 300, unit: 'jobs', emoji: '🔥' },
        { id: 'weekly_earn', title: '₹5K Week', desc: 'Earn ₹5,000 this week', progress: Math.floor(weeklyEarned._sum.workerEarnings || 0), target: 5000, reward: 500, unit: '₹', emoji: '💰' },
        { id: 'monthly_consistency', title: '30-Day Streak', desc: 'Complete at least 1 job every day this month', progress: Math.min(monthlyJobs, 30), target: 30, reward: 1000, unit: 'days', emoji: '🏆' },
        { id: 'milestone_100', title: 'Century Milestone', desc: 'Complete 100 total jobs', progress: wp.completedJobs, target: 100, reward: 2000, unit: 'jobs', emoji: '💯' },
      ];

      sendResponse(res, 200, { challenges, justCompleted: challenges.filter(c => c.progress >= c.target && c.progress > 0), weeklyEarned: weeklyEarned._sum.workerEarnings || 0 });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getCrm: async (req: AuthRequest, res: Response) => {
    try {
      const now = new Date();
      const pastBookings = await prisma.booking.findMany({
        where: { workerId: req.user!.userId, status: 'COMPLETED' },
        select: { id: true, serviceName: true, serviceCategory: true, completedAt: true, totalAmount: true, customer: { select: { id: true, name: true, phone: true } }, review: { select: { rating: true, comment: true } }, address: { select: { city: true } } },
        orderBy: { completedAt: 'desc' }, take: 20,
      });

      const customerMap = new Map();
      pastBookings.forEach(b => {
        const cid = b.customer?.id;
        if (!cid) return;
        if (!customerMap.has(cid)) customerMap.set(cid, { customer: b.customer, bookings: [], totalSpent: 0, lastService: null });
        const entry = customerMap.get(cid);
        entry.bookings.push({ service: b.serviceName, category: b.serviceCategory, amount: b.totalAmount, date: b.completedAt, rating: b.review?.rating });
        entry.totalSpent += b.totalAmount;
        if (b.completedAt) entry.lastService = b.completedAt > (entry.lastService || new Date(0)) ? b.completedAt : entry.lastService;
      });

      const crmData: any[] = [];
      let dueForFollowUpCount = 0;
      let totalRepeatCount = 0;
      let totalEarnedFromPast = 0;

      Array.from(customerMap.values()).forEach(c => {
        const daysSinceLastService = Math.floor((now.getTime() - new Date(c.lastService).getTime()) / 86400000);
        const isDueForFollowUp = daysSinceLastService > 25;
        const isRepeatCustomer = c.bookings.length > 1;
        
        crmData.push({ ...c, daysSinceLastService, dueForFollowUp: isDueForFollowUp, repeatCustomer: isRepeatCustomer });
        if (isDueForFollowUp) dueForFollowUpCount++;
        if (isRepeatCustomer) totalRepeatCount++;
        totalEarnedFromPast += c.totalSpent;
      });

      sendResponse(res, 200, { customers: crmData, dueForFollowUp: dueForFollowUpCount, totalRepeat: totalRepeatCount, totalEarnedFromPast });
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
