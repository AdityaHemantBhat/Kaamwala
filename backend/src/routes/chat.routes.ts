import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/:bookingId/messages', authenticate, chatController.getMessages);
router.patch('/:bookingId/messages/read', authenticate, chatController.markAsRead);
router.post('/:bookingId/messages', authenticate, chatController.sendMessage);
router.delete('/messages/:messageId', authenticate, chatController.deleteMessage);
router.get('/:bookingId/unread-count', authenticate, chatController.getUnreadCount);
router.get('/user/chats', authenticate, chatController.getUserChats);

export default router;