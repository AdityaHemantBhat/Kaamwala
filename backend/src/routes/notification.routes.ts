import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, notificationController.getNotifications);
router.get('/unread-count', authenticate, notificationController.getUnreadCount);
router.put('/:id/read', authenticate, notificationController.markAsRead);
router.put('/read-all', authenticate, notificationController.markAllAsRead);
router.delete('/', authenticate, notificationController.deleteAllNotifications);
router.delete('/:id', authenticate, notificationController.deleteNotification);
router.put('/push-token', authenticate, notificationController.registerPushToken);

export default router;
