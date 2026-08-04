import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { notificationService } from '../services/notification.service';
import { sendResponse, sendError } from '../utils/response';

const MAX_ROUNDS = 3;

export const negotiationController = {
  getNegotiation: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: req.params.bookingId },
        select: { customerId: true, workerId: true },
      });

      if (!booking || (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId)) {
        return sendError(res, 404, 'Booking not found');
      }

      const negotiation = await prisma.negotiation.findUnique({
        where: { bookingId: req.params.bookingId },
        include: { offers: { orderBy: { createdAt: 'asc' } } },
      });

      if (!negotiation) return sendResponse(res, 200, { status: 'NOT_STARTED' });
      sendResponse(res, 200, negotiation);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  makeOffer: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');

      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Not your booking');
      }

      let negotiation = await prisma.negotiation.findUnique({ where: { bookingId: req.params.bookingId } });

      if (!negotiation) {
        negotiation = await prisma.negotiation.create({
          data: {
            bookingId: req.params.bookingId,
            status: 'OPEN',
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          },
        });
      }

      if (negotiation.status !== 'OPEN') {
        return sendError(res, 400, `Negotiation is ${negotiation.status}`);
      }

      if (negotiation.rounds >= MAX_ROUNDS) {
        return sendError(res, 400, `Maximum ${MAX_ROUNDS} rounds reached`);
      }

      const offer = await prisma.negotiationOffer.create({
        data: {
          negotiationId: negotiation.id,
          offeredBy: req.user!.userId,
          amount: req.body.amount,
          message: req.body.message,
        },
      });

      await prisma.negotiation.update({
        where: { id: negotiation.id },
        data: { rounds: { increment: 1 } },
      });

      if (booking.status === 'PENDING') {
        await prisma.booking.update({
          where: { id: req.params.bookingId },
          data: { status: 'NEGOTIATING' },
        });
      }

      const otherPartyId = req.user!.userId === booking.customerId ? booking.workerId : booking.customerId;
      await notificationService.sendPushNotification(
        otherPartyId, 'New Offer Received',
        `You received a new offer of ₹${Number(req.body.amount).toLocaleString('en-IN')} for booking #${booking.bookingNumber}.`,
        'negotiation', { bookingId: booking.id, amount: req.body.amount },
      ).catch(() => {});

      sendResponse(res, 201, offer, 'Offer submitted');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  acceptOffer: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');

      if (req.user!.userId !== booking.customerId && req.user!.userId !== booking.workerId) {
        return sendError(res, 403, 'Not your booking');
      }

      const negotiation = await prisma.negotiation.findUnique({
        where: { bookingId: req.params.bookingId },
        include: { offers: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      if (!negotiation || negotiation.status !== 'OPEN') {
        return sendError(res, 400, 'No active negotiation');
      }

      const lastOffer = negotiation.offers[0];
      if (!lastOffer) return sendError(res, 400, 'No offers to accept');

      await prisma.negotiation.update({
        where: { id: negotiation.id },
        data: { status: 'ACCEPTED', finalPrice: lastOffer.amount },
      });

      await prisma.booking.update({
        where: { id: req.params.bookingId },
        data: {
          status: 'ACCEPTED',
          negotiatedAmount: lastOffer.amount,
          totalAmount: lastOffer.amount + booking.platformFee,
          workerEarnings: lastOffer.amount - booking.platformFee,
        },
      });

      const otherPartyId = req.user!.userId === booking.customerId ? booking.workerId : booking.customerId;
      await notificationService.sendPushNotification(
        otherPartyId, 'Offer Accepted',
        `The offer of ₹${Number(lastOffer.amount).toLocaleString('en-IN')} for booking #${booking.bookingNumber} was accepted.`,
        'negotiation', { bookingId: booking.id, amount: lastOffer.amount },
      ).catch(() => {});

      sendResponse(res, 200, null, 'Offer accepted! Booking confirmed at ₹' + lastOffer.amount);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  rejectNegotiation: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
      if (!booking) return sendError(res, 404, 'Booking not found');

      if (req.user!.userId !== booking.customerId && req.user!.userId !== booking.workerId) {
        return sendError(res, 403, 'Not your booking');
      }

      const negotiation = await prisma.negotiation.findUnique({ where: { bookingId: req.params.bookingId } });
      if (!negotiation || negotiation.status !== 'OPEN') {
        return sendError(res, 400, 'No active negotiation');
      }

      await prisma.negotiation.update({
        where: { id: negotiation.id },
        data: { status: 'REJECTED' },
      });

      sendResponse(res, 200, null, 'Negotiation rejected');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },
};
