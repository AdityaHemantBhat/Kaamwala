import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { emitToRole, emitBroadcast } from '../services/socket.service';
import { sendPushToToken } from '../services/push.service';
import { redis } from '../config/redis';

/** Roles that are immune to demotion / banning from within the platform. */
const PROTECTED_ROLES = new Set(['SUPER_ADMIN']);

export const superAdminController = {
  getAdmins: async (req: AuthRequest, res: Response) => {
    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        select: { id: true, name: true, phone: true, role: true, isActive: true, isBanned: true, createdAt: true, lastActiveAt: true, loginCount: true },
        orderBy: { createdAt: 'desc' },
      });
      sendResponse(res, 200, admins);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  makeAdmin: async (req: AuthRequest, res: Response) => {
    try {
      const { phone, name } = req.body;
      if (!phone) return sendError(res, 400, 'Phone required');

      let user = await prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await prisma.user.create({
          data: { phone, name: name || 'Admin', role: 'ADMIN' },
        });
      } else {
        user = await prisma.user.update({
          where: { phone },
          data: { role: 'ADMIN', name: name || user.name },
        });
      }

      await createAuditLog(prisma, req, {
        userId: req.user!.userId, action: 'admin.promoted', resource: 'User', resourceId: user.id, newValue: { role: 'ADMIN' },
      });

      sendResponse(res, 200, { id: user.id, name: user.name, phone: user.phone }, 'Admin created');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  removeAdmin: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return sendError(res, 400, 'userId required');

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target || target.role !== 'ADMIN') return sendError(res, 400, 'Not an admin');
      if (PROTECTED_ROLES.has(target.role)) return sendError(res, 400, 'Cannot demote a protected account');

      await prisma.user.update({ where: { id: userId }, data: { role: 'CUSTOMER' } });

      await createAuditLog(prisma, req, {
        userId: req.user!.userId, action: 'admin.demoted', resource: 'User', resourceId: userId,
      });

      sendResponse(res, 200, null, 'Admin removed');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  banUser: async (req: AuthRequest, res: Response) => {
    try {
      const { userId, reason } = req.body;
      if (!userId) return sendError(res, 400, 'userId required');

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) return sendError(res, 404, 'User not found');
      if (PROTECTED_ROLES.has(target.role)) return sendError(res, 400, 'Cannot ban a protected account');
      if (req.user!.userId === userId) return sendError(res, 400, 'You cannot ban your own account');

      await prisma.user.update({
        where: { id: userId },
        data: { isBanned: true, banReason: reason || 'Banned by admin', bannedAt: new Date(), bannedBy: req.user!.userId },
      });

      await createAuditLog(prisma, req, {
        userId: req.user!.userId, action: 'user.banned', resource: 'User', resourceId: userId, newValue: { banned: true, reason },
      });

      sendResponse(res, 200, null, 'User banned');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  unbanUser: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return sendError(res, 400, 'userId required');

      await prisma.user.update({
        where: { id: userId },
        data: { isBanned: false, banReason: null, bannedAt: null, bannedBy: null },
      });

      await createAuditLog(prisma, req, {
        userId: req.user!.userId, action: 'user.unbanned', resource: 'User', resourceId: userId,
      });

      sendResponse(res, 200, null, 'User unbanned');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getAuditLog: async (req: AuthRequest, res: Response) => {
    try {
      const logs = await prisma.auditLog.findMany({
        select: { id: true, action: true, resource: true, resourceId: true, ip: true, userAgent: true, createdAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      sendResponse(res, 200, logs);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  broadcast: async (req: AuthRequest, res: Response) => {
    try {
      const { title, body, targetRole, expiresInHours } = req.body;

      const cleanTitle = (title as string | undefined)?.trim() ?? '';
      const cleanBody = (body as string | undefined)?.trim() ?? '';
      if (!cleanTitle || !cleanBody) return sendError(res, 400, 'Title and body required');
      if (cleanTitle.length > 120 || cleanBody.length > 1000) {
        return sendError(res, 400, 'Title (max 120 chars) or body (max 1000 chars) is too long');
      }

      // Strict allowlist — an unknown or ABSENT targetRole must never degrade
      // into a platform-wide blast, or a role-targeted message leaks to every
      // user. Reject anything that isn't an explicit, known audience.
      const TARGET_ROLES = new Set(['WORKER', 'CUSTOMER', 'ADMIN', 'ALL']);
      const role = (targetRole as string) || 'ALL';
      if (!TARGET_ROLES.has(role)) {
        return sendError(res, 400, `Invalid targetRole '${role}'. Expected one of: WORKER, CUSTOMER, ADMIN, ALL`);
      }

      // Only users with the exact role get notification rows + realtime events.
      const where: any = role === 'ALL' ? {} : { role };
      const users = await prisma.user.findMany({ where, select: { id: true, role: true, fcmToken: true }, take: 2000 });

      // Store in database for notification history
      await prisma.notification.createMany({
        data: users.map(u => ({ userId: u.id, title: cleanTitle, body: cleanBody, type: 'broadcast', data: { targetRole: role } })),
      });

      // Device push to every recipient with a token — fire-and-forget so a slow
      // token never blocks the broadcast response.
      const pushData = { targetRole: role };
      for (const u of users) {
        if (!u.fcmToken) continue;
        sendPushToToken(u.fcmToken, { title: cleanTitle, body: cleanBody, channelId: 'promo', data: { type: 'broadcast', ...pushData } })
          .then((result) => {
            if (result.invalid) {
              prisma.user.update({ where: { id: u.id }, data: { fcmToken: null } }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      const timestamp = Date.now();
      // Robust expiry parsing: NaN / missing / non-positive all fall back to 24h.
      const expiresIn = (() => {
        const n = Number(expiresInHours);
        if (!Number.isFinite(n) || n <= 0) return 24;
        return Math.min(Math.max(Math.round(n), 1), 168); // max 1 week
      })();

      // Send real-time socket events. The payload carries targetRole + expiry so
      // clients render from the server's contract (single source of truth), not a
      // client-side guess — and so a client can defensively re-check its audience.
      const payload = { title: cleanTitle, body: cleanBody, targetRole: role, expiresInHours: expiresIn, timestamp };
      if (role === 'ALL') {
        await emitBroadcast('broadcast_notification', payload);
      } else {
        await emitToRole(role as 'WORKER' | 'CUSTOMER' | 'ADMIN', 'broadcast_notification', payload);
      }

      // Store active broadcast in Redis for dashboard marquee display (expires based on param)
      const activeBroadcast = { title: cleanTitle, body: cleanBody, targetRole: role, createdAt: timestamp, expiresAt: timestamp + expiresIn * 60 * 60 * 1000 };
      // Best-effort: the marquee cache is optional. A Redis outage (or missing
      // auth) must not fail an already-delivered broadcast — mirror the app's
      // graceful-degradation pattern used elsewhere for Redis writes.
      try {
        await redis.set('active_broadcast', JSON.stringify(activeBroadcast), { EX: expiresIn * 60 * 60 });
      } catch (e: any) {
        logger.warn('Broadcast delivered, but failed to cache active_broadcast:', e?.message || e);
      }

      sendResponse(res, 200, { sent: users.length, targetRole: role, expiresInHours: expiresIn }, `Broadcast sent to ${users.length} users`);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getActiveBroadcast: async (req: AuthRequest, res: Response) => {
    try {
      const broadcastStr = await redis.get('active_broadcast');
      if (!broadcastStr) {
        return sendResponse(res, 200, null);
      }
      const broadcast = JSON.parse(broadcastStr);
      // Check if expired
      if (broadcast.expiresAt && broadcast.expiresAt < Date.now()) {
        await redis.del('active_broadcast');
        return sendResponse(res, 200, null);
      }
      sendResponse(res, 200, broadcast);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  /**
   * Read-only payment configuration status. Settlement is owned by the Cashfree
   * merchant account (configured in the Cashfree dashboard) — the app never
   * holds merchant UPI/bank destinations, so there is nothing here to tamper
   * with. This endpoint only surfaces the current server-side payment state to
   * the super admin. NO secrets are returned.
   */
  getPaymentConfig: async (_req: AuthRequest, res: Response) => {
    const payoutConfigured = !!(env.CF_PAYOUT_APP_ID && env.CF_PAYOUT_SECRET_KEY);
    sendResponse(res, 200, {
      environment: env.NODE_ENV,
      cfEnv: env.CF_ENV,
      isProduction: env.NODE_ENV === 'production',
      paymentsConfigured: !!(env.CF_APP_ID && env.CF_SECRET_KEY),
      payoutConfigured,
      // Until real payout creds are set, payouts run in dev-mock mode.
      mockPayoutsActive: !payoutConfigured,
      // AutoPay / recurring payments are managed in the Cashfree dashboard.
      autoPayManagedByCashfree: true,
    });
  }
};
