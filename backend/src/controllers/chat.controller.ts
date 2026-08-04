import { Response } from 'express';
import { chatService } from '../services/chat.service';
import { sendResponse, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export const chatController = {
  getMessages: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = req.user!.userId;

      const messages = await chatService.getMessages(bookingId, userId);
      sendResponse(res, 200, messages);
    } catch (error: any) {
      sendError(res, error.message === 'Access denied' ? 403 : 500, error.message);
    }
  },

  markAsRead: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = req.user!.userId;

      const result = await chatService.markMessagesAsRead(bookingId, userId);
      sendResponse(res, 200, result);
    } catch (error: any) {
      sendError(res, error.message === 'Access denied' ? 403 : 500, error.message);
    }
  },

  sendMessage: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { content, type = 'text', mediaUrl, latitude, longitude } = req.body;
      const userId = req.user!.userId;

      if (!content?.trim()) {
        return sendError(res, 400, 'Message content is required');
      }

      const phoneRegex = /(\d\s*[-.]?\s*){10}/g;
      if (phoneRegex.test(content)) {
        return sendError(res, 400, 'Sharing contact information is prohibited');
      }

      const result = await chatService.sendMessage(bookingId, userId, {
        content,
        type,
        mediaUrl,
        latitude,
        longitude
      });

      if (!result.success) {
        return sendError(res, 400, result.error || 'Failed to send message');
      }

      sendResponse(res, 201, result.message);
    } catch (error: any) {
      sendError(res, 500, error.message);
    }
  },

  deleteMessage: async (req: AuthRequest, res: Response) => {
    try {
      const { messageId } = req.params;
      const userId = req.user!.userId;

      const message = await chatService.deleteMessage(messageId, userId);
      sendResponse(res, 200, message);
    } catch (error: any) {
      sendError(res, error.message === 'Access denied' ? 403 : 500, error.message);
    }
  },

  getUnreadCount: async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = req.user!.userId;

      const result = await chatService.getUnreadCount(bookingId, userId);
      sendResponse(res, 200, result);
    } catch (error: any) {
      sendError(res, error.message === 'Access denied' ? 403 : 500, error.message);
    }
  },

  getUserChats: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      const chats = await chatService.getUserChats(userId);
      sendResponse(res, 200, chats);
    } catch (error: any) {
      sendError(res, 500, error.message);
    }
  }
};
