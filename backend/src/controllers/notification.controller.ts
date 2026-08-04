import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export const notificationController = {
  /**
   * Cursor-based pagination (stable order: createdAt desc, id desc). Returns
   * the page of notifications plus the next cursor and the user's unread count
   * so the badge can be updated without a second request.
   */
  getNotifications: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

      const where = { userId };
      const notifications = await prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1, // fetch one extra to detect hasMore
      });

      const hasMore = notifications.length > limit;
      const page = hasMore ? notifications.slice(0, limit) : notifications;
      const nextCursor = hasMore ? page[page.length - 1]?.id : null;
      const unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });

      sendResponse(res, 200, { items: page, nextCursor, hasMore, unreadCount });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getUnreadCount: async (req: AuthRequest, res: Response) => {
    try {
      const count = await prisma.notification.count({
        where: { userId: req.user!.userId, isRead: false },
      });
      sendResponse(res, 200, { count });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  markAsRead: async (req: AuthRequest, res: Response) => {
    try {
      await prisma.notification.updateMany({
        where: { id: req.params.id, userId: req.user!.userId },
        data: { isRead: true },
      });
      sendResponse(res, 200, null, 'Marked as read');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  markAllAsRead: async (req: AuthRequest, res: Response) => {
    try {
      await prisma.notification.updateMany({
        where: { userId: req.user!.userId, isRead: false },
        data: { isRead: true },
      });
      sendResponse(res, 200, null, 'All marked as read');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  /** Delete a single notification (owner-scoped). */
  deleteNotification: async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await prisma.notification.deleteMany({
        where: { id: req.params.id, userId: req.user!.userId },
      });
      if (deleted.count === 0) return sendError(res, 404, 'Notification not found');
      sendResponse(res, 200, null, 'Notification deleted');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  /** Clear the user's entire inbox. */
  deleteAllNotifications: async (req: AuthRequest, res: Response) => {
    try {
      await prisma.notification.deleteMany({
        where: { userId: req.user!.userId },
      });
      sendResponse(res, 200, null, 'All notifications cleared');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  registerPushToken: async (req: AuthRequest, res: Response) => {
    try {
      const { token, platform } = req.body;
      if (!token) return sendError(res, 400, 'Token required');

      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { fcmToken: token },
      });

      sendResponse(res, 200, null, 'Push token registered');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
