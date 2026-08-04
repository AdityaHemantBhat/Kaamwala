import { prisma } from '../config/prisma';
import { notificationService } from './notification.service';
import { emitToBooking } from './socket.service';
import { logger } from '../utils/logger';
import { encryptField, decryptField } from '../utils/fieldEncryption';

export interface MessageData {
  content: string;
  type?: string;
  mediaUrl?: string;
  latitude?: number;
  longitude?: number;
}

export interface SendMessageResult {
  success: boolean;
  message?: any;
  error?: string;
}

export interface ChatAccessCheck {
  hasAccess: boolean;
  booking?: {
    id: string;
    customerId: string;
    workerId: string;
    status: string;
  };
}

export class ChatService {
 /**
 * Check if user has access to a booking chat
 */
  async checkChatAccess(bookingId: string, userId: string): Promise<ChatAccessCheck> {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          customerId: true,
          workerId: true,
          status: true
        }
      });

      if (!booking) {
        return { hasAccess: false };
      }

      const hasAccess = booking.customerId === userId || booking.workerId === userId;
      return { hasAccess, booking };
    } catch (error) {
      logger.error('Failed to check chat access:', error);
      return { hasAccess: false };
    }
  }

 /**
 * Send a message to a booking chat
 */
  async sendMessage(
    bookingId: string,
    userId: string,
    data: MessageData
  ): Promise<SendMessageResult> {
    try {
      // Check access
      const accessCheck = await this.checkChatAccess(bookingId, userId);
      if (!accessCheck.hasAccess || !accessCheck.booking) {
        return { success: false, error: 'Access denied' };
      }

      // Check booking status - only allow chat for certain statuses
      const allowedStatuses = ['PENDING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];
      if (!allowedStatuses.includes(accessCheck.booking.status)) {
        return { success: false, error: 'Chat not available for this booking status' };
      }

      // Validate content
      if (!data.content?.trim()) {
        return { success: false, error: 'Message content is required' };
      }

      // Content filter
      const phoneRegex = /(\d\s*[-.]?\s*){10}/g;
      if (phoneRegex.test(data.content)) {
        return { success: false, error: 'Sharing contact information is prohibited' };
      }

      // Save message using transaction
      const message = await prisma.$transaction(async (tx) => {
        // Ensure chat exists
        let chat = await tx.chat.findUnique({
          where: { bookingId },
        });

        if (!chat) {
          chat = await tx.chat.create({
            data: { bookingId },
          });
        }

        // Save message — content stored encrypted at rest (AES-256-GCM).
        return await tx.message.create({
          data: {
            chatId: chat.id,
            senderId: userId,
            content: encryptField(data.content.trim()),
            type: data.type || 'text',
            mediaUrl: data.mediaUrl,
            latitude: data.latitude,
            longitude: data.longitude
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                role: true
              }
            }
          }
        });
      });

      // Decrypt for the emit, notification preview, and response (the DB row
      // stays ciphertext).
      message.content = decryptField(message.content);

      // Emit to booking chat room
      emitToBooking(bookingId, 'new_message', {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        sender: message.sender,
        type: message.type,
        content: message.content,
        mediaUrl: message.mediaUrl,
        isRead: message.isRead,
        isDeleted: message.isDeleted,
        createdAt: message.createdAt
      });

      // Send push notification to other participant
      await this.notifyOtherParticipant(bookingId, userId, message);

      return { success: true, message };
    } catch (error: any) {
      logger.error('Failed to send message:', error);
      return { success: false, error: 'Failed to send message' };
    }
  }

 /**
 * Get messages for a booking chat
 */
  async getMessages(bookingId: string, userId: string) {
    try {
      const accessCheck = await this.checkChatAccess(bookingId, userId);
      if (!accessCheck.hasAccess) {
        throw new Error('Access denied');
      }

      const chat = await prisma.chat.findUnique({
        where: { bookingId },
        include: {
          messages: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'asc' },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  role: true
                }
              }
            }
          }
        }
      });

      return chat
        ? chat.messages.map((m: any) => ({ ...m, content: decryptField(m.content) }))
        : [];
    } catch (error) {
      logger.error('Failed to get messages:', error);
      throw error;
    }
  }

 /**
 * Mark messages as read
 */
  async markMessagesAsRead(bookingId: string, userId: string) {
    try {
      const accessCheck = await this.checkChatAccess(bookingId, userId);
      if (!accessCheck.hasAccess) {
        throw new Error('Access denied');
      }

      const chat = await prisma.chat.findUnique({
        where: { bookingId },
        select: { id: true }
      });

      if (!chat) {
        return { updated: 0 };
      }

      // Mark all messages from other user as read
      const updated = await prisma.message.updateMany({
        where: {
          chatId: chat.id,
          senderId: { not: userId },
          isRead: false,
          isDeleted: false
        },
        data: { isRead: true }
      });

      // Emit read status update
      emitToBooking(bookingId, 'messages_read', {
        userId,
        readAt: new Date()
      });

      return { updated: updated.count };
    } catch (error) {
      logger.error('Failed to mark messages as read:', error);
      throw error;
    }
  }

 /**
 * Get unread message count
 */
  async getUnreadCount(bookingId: string, userId: string) {
    try {
      const accessCheck = await this.checkChatAccess(bookingId, userId);
      if (!accessCheck.hasAccess) {
        throw new Error('Access denied');
      }

      const chat = await prisma.chat.findUnique({
        where: { bookingId },
        select: { id: true }
      });

      if (!chat) {
        return { unreadCount: 0 };
      }

      const unreadCount = await prisma.message.count({
        where: {
          chatId: chat.id,
          senderId: { not: userId },
          isRead: false,
          isDeleted: false
        }
      });

      return { unreadCount };
    } catch (error) {
      logger.error('Failed to get unread count:', error);
      throw error;
    }
  }

 /**
 * Delete a message (soft delete)
 */
  async deleteMessage(messageId: string, userId: string) {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          chat: {
            include: {
              booking: {
                select: { customerId: true, workerId: true, id: true }
              }
            }
          }
        }
      });

      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user is the sender
      if (message.senderId !== userId) {
        throw new Error('Cannot delete messages sent by others');
      }

      // Check if user has access to this booking
      const booking = message.chat?.booking;
      if (!booking || (booking.customerId !== userId && booking.workerId !== userId)) {
        throw new Error('Access denied');
      }

      // Soft delete by marking as deleted
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { isDeleted: true },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              role: true
            }
          }
        }
      });

      // Emit deletion event
      emitToBooking(booking.id, 'message_deleted', {
        messageId: updated.id,
        deletedAt: new Date()
      });

      updated.content = decryptField(updated.content);
      return updated;
    } catch (error) {
      logger.error('Failed to delete message:', error);
      throw error;
    }
  }

 /**
 * Notify other participant about new message
 */
  private async notifyOtherParticipant(bookingId: string, senderId: string, message: any) {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { customerId: true, workerId: true }
      });

      if (!booking) return;

      const recipientId = booking.customerId === senderId ? booking.workerId : booking.customerId;

      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true }
      });

      const senderName = sender?.name || 'Someone';
      const preview = message.content?.substring(0, 100) || 'Sent a message';

      await notificationService.sendPushNotification(
        recipientId,
        'New message from ' + senderName,
        preview,
        'chat_message',
        { bookingId, senderId }
      );
    } catch (error) {
      logger.error('Failed to notify participant:', error);
    }
  }

 /**
 * Get chat summary for a user
 */
  async getUserChats(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      if (!user) return [];

      // Find bookings where user is either customer or worker
      const bookings = await prisma.booking.findMany({
        where: {
          OR: [
            { customerId: userId },
            { workerId: userId }
          ],
          status: { in: ['PENDING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'] }
        },
        include: {
          chat: {
            include: {
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                  sender: {
                    select: {
                      id: true,
                      name: true,
                      avatarUrl: true,
                      role: true
                    }
                  }
                }
              }
            }
          },
          customer: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              role: true
            }
          },
          worker: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              role: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      return bookings.map(booking => {
        const lastMessage = booking.chat?.messages?.[0] || null;
        if (lastMessage) lastMessage.content = decryptField(lastMessage.content);
        return {
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber,
          status: booking.status,
          otherParty: booking.customerId === userId ? booking.worker : booking.customer,
          lastMessage,
          unreadCount: 0, // This would need to be calculated
        };
      });
    } catch (error) {
      logger.error('Failed to get user chats:', error);
      throw error;
    }
  }

 /**
 * Create a system message in a booking chat (e.g. cancellation events).
 */
  async createSystemMessage(bookingId: string, senderId: string, content: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        let chat = await tx.chat.findUnique({ where: { bookingId } });
        if (!chat) {
          chat = await tx.chat.create({ data: { bookingId } });
        }
        await tx.message.create({
          data: {
            chatId: chat.id,
            senderId,
            type: 'system',
            content: encryptField(content),
          },
        });
      });

      // Emit to booking room
      emitToBooking(bookingId, 'new_system_message', {
        content,
        type: 'system',
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error('Failed to create system message:', error);
    }
  }
}

export const chatService = new ChatService();