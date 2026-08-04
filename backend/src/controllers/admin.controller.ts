import { Response } from 'express';
import { adminService } from '../services/admin.service';
import { sendResponse, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/prisma';

export const adminController = {
  getDashboardStats: async (req: AuthRequest, res: Response) => {
    try { sendResponse(res, 200, await adminService.getDashboardStats()); }
    catch (e: any) { sendError(res, 500, e.message); }
  },

  getAllUsers: async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      sendResponse(res, 200, await adminService.getAllUsers(page, limit));
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getWorkerDetails: async (req: AuthRequest, res: Response) => {
    try { sendResponse(res, 200, await adminService.getWorkerDetails(req.params.userId)); }
    catch (e: any) { sendError(res, 500, e.message); }
  },

  getAllBookings: async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      sendResponse(res, 200, await adminService.getAllBookings(page, limit));
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getWithdrawals: async (req: AuthRequest, res: Response) => {
    try { sendResponse(res, 200, await adminService.getWithdrawals(req.query.status as string)); }
    catch (e: any) { sendError(res, 500, e.message); }
  },

  processWithdrawal: async (req: AuthRequest, res: Response) => {
    try {
      const { status, notes } = req.body;
      if (!['approved', 'rejected'].includes(status)) return sendError(res, 400, 'Invalid status');
      sendResponse(res, 200, await adminService.processWithdrawal(req.params.id, status, notes));
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getTickets: async (req: AuthRequest, res: Response) => {
    try { sendResponse(res, 200, await adminService.getTickets(req.query.status as string)); }
    catch (e: any) { sendError(res, 500, e.message); }
  },

  getRevenueStats: async (req: AuthRequest, res: Response) => {
    try { sendResponse(res, 200, await adminService.getRevenueStats()); }
    catch (e: any) { sendError(res, 500, e.message); }
  },

  getBans: async (req: AuthRequest, res: Response) => {
    try {
      const banned = await prisma.workerProfile.findMany({
        where: { OR: [{ isBanned: true }, { isPermanentlyBanned: true }] },
        select: {
          id: true, userId: true, isBanned: true, isPermanentlyBanned: true, banReason: true, bannedAt: true, appealCount: true, walletBalance: true,
          user: { select: { name: true, phone: true } },
        },
        orderBy: { bannedAt: 'desc' },
      });

      const withLogs = await Promise.all(banned.map(async (w: any) => {
        const logs = await prisma.auditLog.findMany({
          where: { userId: w.userId, action: { in: ['WORKER_BANNED', 'WORKER_PERMANENTLY_BANNED', 'WORKER_APPEAL_GRANTED', 'CHAT_PHONE_SHARE'] } },
          select: { action: true, newValue: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        return { ...w, auditLogs: logs };
      }));

      sendResponse(res, 200, withLogs);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  unbanWorker: async (req: AuthRequest, res: Response) => {
    try {
      const { userId, note } = req.body;
      if (!userId) return sendError(res, 400, 'userId required');

      await prisma.workerProfile.update({
        where: { userId },
        data: {
          isBanned: false,
          isPermanentlyBanned: false,
          banReason: null,
          bannedAt: null,
          isAvailable: true,
          isOnline: true,
        },
      });

      await createAuditLog(prisma, req, {
        userId: req.user!.userId,
        action: 'ADMIN_UNBAN',
        resource: 'worker',
        resourceId: userId,
        newValue: { note: note || 'Admin manually unbanned (system review)', timestamp: new Date().toISOString() },
      });

      sendResponse(res, 200, null, 'Worker unbanned by admin');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  searchUsers: async (req: AuthRequest, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') return sendError(res, 400, 'Search query required');
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { id: q }
          ]
        },
        select: { id: true, name: true, phone: true, role: true, createdAt: true, isBanned: true },
        take: 20
      });
      sendResponse(res, 200, users);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getUserAudit: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const logs = await prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
      const logins = await prisma.loginAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      const analytics = await prisma.analyticsEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
      const userDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phone: true, role: true, createdAt: true, isBanned: true, workerProfile: { select: { completedJobs: true, rating: true, walletBalance: true } } }
      });
      
      const allLogs = [
        ...logs.map(l => ({ ...l, type: 'audit' })), 
        ...logins.map(l => ({ ...l, type: 'login' })),
        ...analytics.map(l => ({ ...l, type: 'analytics', action: l.type, newValue: l.payload }))
      ].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      sendResponse(res, 200, { user: userDetails, timeline: allLogs });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  banUser: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { type, reason, durationDays, banIp } = req.body;
      const adminId = req.user?.userId;

      // Privilege guard: a regular admin must not ban themselves or any
      // privileged account — only the SUPER_ADMIN manages admins.
      if (userId === adminId) return sendError(res, 400, 'You cannot ban your own account');
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!target) return sendError(res, 404, 'User not found');
      if (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') {
        return sendError(res, 400, 'Cannot ban an admin account');
      }

      let expiresAt: Date | null = null;
      if (type === 'TEMPORARY' && durationDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          banReason: reason,
          bannedAt: new Date(),
          bannedBy: adminId,
          banExpiresAt: expiresAt,
        }
      });

      if (banIp) {
        // Find latest IP for this user
        const lastLogin = await prisma.loginAttempt.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' }
        });
        if (lastLogin?.ip) {
          await prisma.bannedIP.upsert({
            where: { ip: lastLogin.ip },
            create: { ip: lastLogin.ip, reason: `Linked to banned user ${userId}`, bannedBy: adminId, expiresAt },
            update: { expiresAt }
          });
        }
      }

      await createAuditLog(prisma, req, {
        userId: adminId!, action: 'BAN_USER', resource: 'User', resourceId: userId, newValue: { type, reason, durationDays, banIp },
      });

      sendResponse(res, 200, { message: 'User banned successfully' });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  unbanUser: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      // Privilege guard — mirror banUser: regular admins don't manage admins.
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!target) return sendError(res, 404, 'User not found');
      if (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') {
        return sendError(res, 400, 'Cannot unban an admin account');
      }

      await prisma.user.update({
        where: { id: userId },
        data: { isBanned: false, banReason: null, bannedAt: null, bannedBy: null, banExpiresAt: null }
      });

      const adminId = req.user?.userId;
      await createAuditLog(prisma, req, {
        userId: adminId!, action: 'UNBAN_USER', resource: 'User', resourceId: userId,
      });

      sendResponse(res, 200, { message: 'User unbanned successfully' });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getBannedIps: async (req: AuthRequest, res: Response) => {
    try {
      const ips = await prisma.bannedIP.findMany({ orderBy: { createdAt: 'desc' } });
      sendResponse(res, 200, ips);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  unbanIp: async (req: AuthRequest, res: Response) => {
    try {
      const { ip } = req.params;
      await prisma.bannedIP.delete({ where: { ip } });
      const adminId = req.user?.userId;
      await createAuditLog(prisma, req, {
        userId: adminId!, action: 'UNBAN_IP', resource: 'IP', resourceId: ip,
      });
      sendResponse(res, 200, { message: 'IP unbanned successfully' });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getLeadsReport: async (req: AuthRequest, res: Response) => {
    try {
      const workers = await prisma.workerProfile.findMany({
        select: {
          id: true, leadsUsedThisMonth: true, leadsQuotaResetAt: true, isFeatured: true,
          user: {
            select: {
              id: true, name: true, phone: true,
              workerSubscription: { select: { plan: true, status: true } },
            },
          },
        },
        orderBy: { leadsUsedThisMonth: 'desc' },
        take: 200,
      });
      const enriched = workers.map((w: any) => {
        const plan = w.user?.workerSubscription?.status === 'active' ? w.user.workerSubscription.plan : 'FREE';
        return {
          id: w.id,
          name: w.user?.name || 'Worker',
          phone: w.user?.phone || '',
          plan,
          leadsUsed: w.leadsUsedThisMonth || 0,
          limit: plan === 'FREE' ? 5 : null,
          isFeatured: !!w.isFeatured,
        };
      });
      sendResponse(res, 200, enriched);
    } catch (e: any) { sendError(res, 500, e.message); }
  }
};
