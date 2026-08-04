import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { emitToUser, emitToAdmins } from '../services/socket.service';
import { notificationService } from '../services/notification.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { isAdminRole } from '../utils/roles';
import { createTicketSchema, replySchema } from '../validators';

export const supportController = {
  createTicket: async (req: AuthRequest, res: Response) => {
    try {
      const parsed = createTicketSchema.parse(req.body);
      // Priority support: paid plans are elevated regardless of what the client
      // sends — "Chat support" (PLUS/PRO), "Priority support" (worker PRO/ELITE).
      const [custSub, workerSub] = await Promise.all([
        prisma.userSubscription.findUnique({ where: { userId: req.user!.userId }, select: { plan: true, status: true } }).catch(() => null),
        prisma.workerSubscription.findUnique({ where: { userId: req.user!.userId }, select: { plan: true, status: true } }).catch(() => null),
      ]);
      const paidSupport =
        (custSub?.status === 'active' && (custSub.plan === 'PLUS' || custSub.plan === 'PRO')) ||
        (workerSub?.status === 'active' && (workerSub.plan === 'PRO' || workerSub.plan === 'ELITE'));
      const priority = parsed.priority === 'high' || paidSupport ? 'high' : (parsed.priority || 'medium');
      const ticket = await prisma.supportTicket.create({
        data: { userId: req.user!.userId, subject: parsed.subject, description: parsed.description, bookingId: parsed.bookingId || undefined, priority, status: 'open' },
      });
      await prisma.ticketMessage.create({ data: { ticketId: ticket.id, senderId: req.user!.userId, message: parsed.description, isSystemMessage: true } });
      
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
      for (const a of admins) { try { emitToUser(a.id, 'new_ticket', { ticketId: ticket.id, subject: parsed.subject }); } catch {} }
      
      emitToAdmins('admin_refresh', { type: 'ticket' });
      
      sendResponse(res, 201, ticket, 'Ticket created');
    } catch (e: any) { sendError(res, 400, e.message || 'Failed'); }
  },

  getUserTickets: async (req: AuthRequest, res: Response) => {
    try {
      const tickets = await prisma.supportTicket.findMany({
        where: { userId: req.user!.userId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' },
      });
      sendResponse(res, 200, tickets);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getTicketDetails: async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: req.params.id },
        include: { 
          messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { name: true, role: true } } } },
          user: { select: { id: true, name: true, phone: true, role: true, subscription: { select: { plan: true } } } }
        },
      });
      if (!ticket) return sendError(res, 404, 'Ticket not found');
      if (ticket.userId !== req.user!.userId && !isAdminRole(req.user!.role)) return sendError(res, 403, 'Access denied');
      sendResponse(res, 200, ticket);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  replyToTicket: async (req: AuthRequest, res: Response) => {
    try {
      const parsed = replySchema.parse(req.body);
      const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
      if (!ticket) return sendError(res, 404, 'Ticket not found');
      if (ticket.userId !== req.user!.userId && !isAdminRole(req.user!.role)) return sendError(res, 403, 'Access denied');
      if (ticket.status === 'resolved' || ticket.status === 'closed') return sendError(res, 400, 'Ticket is closed');

      const msg = await prisma.ticketMessage.create({
        data: { ticketId: ticket.id, senderId: req.user!.userId, message: parsed.message, imageUrl: parsed.imageUrl || null, isFromAdmin: isAdminRole(req.user!.role) },
        include: { sender: { select: { name: true, role: true } } },
      });

      if (isAdminRole(req.user!.role)) {
        if (ticket.status === 'open') {
          await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'in_progress' } });
        }
        try { emitToUser(ticket.userId, 'ticket_reply', { ticketId: ticket.id, message: parsed.message }); } catch {}
        await notificationService.sendPushNotification(
          ticket.userId, 'Support Reply',
          `Our team replied to your ticket: ${parsed.message}`,
          'support_reply', { ticketId: ticket.id },
        ).catch(() => {});
      } else {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
        for (const a of admins) {
          try { emitToUser(a.id, 'ticket_reply', { ticketId: ticket.id, message: parsed.message }); } catch {}
          await notificationService.sendPushNotification(
            a.id, 'New Support Reply',
            `A user replied to ticket: ${parsed.message}`,
            'support_reply', { ticketId: ticket.id },
          ).catch(() => {});
        }

        emitToAdmins('admin_refresh', { type: 'ticket' });
      }

      sendResponse(res, 201, msg, 'Reply sent');
    } catch (e: any) { sendError(res, 400, e.message); }
  },

  adminGetAll: async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.query;
      const where = {} as any;
      if (status) where.status = status;
      const tickets = await prisma.supportTicket.findMany({
        where,
        include: { user: { select: { id: true, name: true, phone: true, role: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' },
      });
      sendResponse(res, 200, tickets);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  adminUpdateStatus: async (req: AuthRequest, res: Response) => {
    try {
      const { status, adminReply } = req.body;
      const data: any = { status };
      if (status === 'resolved' || status === 'closed') data.resolvedAt = new Date();
      if (adminReply) data.adminReply = adminReply;
      const ticket = await prisma.supportTicket.update({ where: { id: req.params.id }, data });
      emitToAdmins('admin_refresh', { type: 'ticket' });
      sendResponse(res, 200, ticket, 'Status updated to ' + status);
    } catch (e: any) { sendError(res, 500, e.message); }
  }
};
