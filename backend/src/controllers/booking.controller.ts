import { Response } from 'express';
import { bookingService } from '../services/booking.service';
import { cancellationService } from '../services/cancellation.service';
import { sendResponse, sendError } from '../utils/response';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';
import { Twilio } from 'twilio';
import { env, devBackdoorsEnabled } from '../config/env';
import { decryptField } from '../utils/fieldEncryption';

const twilioClient = new Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

const VALID_STATUSES = ['PENDING', 'NEGOTIATING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED'];

export const bookingController = {
  updateStatus: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status, otp, reasonCategory, cancelReason } = req.body;

      if (!status || !VALID_STATUSES.includes(status)) {
        return sendError(res, 400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }

      if (status === 'CANCELLED') {
        const result = await cancellationService.initiateCancellation(id, req.user!.userId, req.user!.role, reasonCategory || 'OTHER', cancelReason);
        return sendResponse(res, 200, result, 'Cancellation initiated');
      }

      const booking = await bookingService.updateStatus(id, status, req.user!.userId, req.user!.role, otp);
      sendResponse(res, 200, booking, `Booking ${status.toLowerCase()}`);
    } catch (e: any) {
      const statusCode = e.message.includes('not found') ? 404
        : e.message.includes('Invalid') || e.message.includes('locked') || e.message.includes('cannot be cancelled') || e.message.includes('already') ? 400
        : 500;
      sendError(res, statusCode, e.message);
    }
  },

  confirmCancel: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (req.user!.role !== 'CUSTOMER') return sendError(res, 403, 'Only customers can confirm cancellations');
      const result = await cancellationService.confirmCancellationRequest(id, req.user!.userId);
      sendResponse(res, 200, result, 'Cancellation confirmed');
    } catch (e: any) {
      sendError(res, 400, e.message);
    }
  },

  denyCancel: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (req.user!.role !== 'CUSTOMER') return sendError(res, 403, 'Only customers can deny cancellations');
      const result = await cancellationService.denyCancellationRequest(id, req.user!.userId);
      sendResponse(res, 200, result, 'Cancellation denied');
    } catch (e: any) {
      sendError(res, 400, e.message);
    }
  },

  getBookings: async (req: AuthRequest, res: Response) => {
    try {
      const isWorker = req.user!.role === 'WORKER';
      // OPTIMIZATION: Added pagination to prevent memory bloat on large result sets
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const skip = (page - 1) * limit;

      const bookings = await prisma.booking.findMany({
        where: isWorker ? {
          OR: [
            { workerId: req.user!.userId },
            { status: 'PENDING' }
          ]
        } : { customerId: req.user!.userId },
        select: {
          // OPTIMIZATION: Use select instead of include + nested include to reduce data transfer
          id: true,
          bookingNumber: true,
          type: true,
          customerId: true,
          workerId: true,
          addressId: true,
          serviceCategory: true,
          serviceName: true,
          description: true,
          status: true,
          paymentStatus: true,
          baseAmount: true,
          platformFee: true,
          totalAmount: true,
          workerEarnings: true,
          acceptedAt: true,
          onTheWayAt: true,
          startedAt: true,
          completedAt: true,
          cancelledAt: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true,
          // Only fetch ID flags for review/dispute existence
          review: { select: { id: true } },
          dispute: { select: { id: true } },
          // Minimal user fields (no unnecessary data)
          customer: {
            select: { id: true, name: true, avatarUrl: true, role: true }
          },
          worker: {
            select: { id: true, name: true, avatarUrl: true, role: true }
          },
          // Minimal address fields
          address: {
            select: { id: true, label: true, line1: true, city: true, pincode: true }
          },
          // OPTIMIZATION: Limit scope changes to prevent N+1 on large result sets
          scopeChanges: {
            select: { id: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' as const },
            take: 3,
          },
          // Job photos — lets the app flip "Add Job Photos" to a done state once
          // the worker has already submitted before/after evidence, so it can't
          // be mistaken for a pending task or submitted twice.
          jobPhotos: {
            select: { id: true, beforeUrl: true, afterUrl: true, caption: true },
            orderBy: { createdAt: 'desc' as const },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      });

      const bookingsWithReview = bookings.map((b: any) => ({
        ...b,
        hasReview: b.review !== null,
        hasDispute: b.dispute !== null,
        review: undefined,
        dispute: undefined,
      }));
      sendResponse(res, 200, bookingsWithReview);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getActiveBooking: async (req: AuthRequest, res: Response) => {
    try {
      const isWorker = req.user!.role === 'WORKER';
      const activeBooking = await prisma.booking.findFirst({
        where: {
          ...(isWorker ? { workerId: req.user!.userId } : { customerId: req.user!.userId }),
          status: { in: ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'] }
        },
        select: {
          // OPTIMIZATION: Use select instead of include to reduce data transfer
          id: true,
          bookingNumber: true,
          type: true,
          customerId: true,
          workerId: true,
          addressId: true,
          serviceCategory: true,
          serviceName: true,
          description: true,
          status: true,
          paymentStatus: true,
          baseAmount: true,
          platformFee: true,
          totalAmount: true,
          workerEarnings: true,
          acceptedAt: true,
          onTheWayAt: true,
          startedAt: true,
          completedAt: true,
          workerLat: true,
          workerLng: true,
          workerEta: true,
          arrivalOtp: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, avatarUrl: true, role: true, phone: true } },
          worker: { select: { id: true, name: true, avatarUrl: true, role: true, phone: true } },
          address: {
            select: { id: true, label: true, line1: true, latitude: true, longitude: true, city: true, pincode: true }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });
      sendResponse(res, 200, activeBooking);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  createBooking: async (req: AuthRequest, res: Response) => {
    try {
      const booking = await bookingService.createBooking(req.user!.userId, req.body);
      sendResponse(res, 201, booking);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getContactDetails: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const booking = await prisma.booking.findUnique({
        where: { id },
        select: {
          status: true, customerId: true, workerId: true,
          customer: { select: { phone: true } },
          worker: { select: { phone: true } },
        },
      });

      if (!booking) return sendError(res, 404, 'Booking not found');

      const ALLOWED_STATES = ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'];
      if (!ALLOWED_STATES.includes(booking.status)) {
        return sendError(res, 403, 'Contact details not available at this stage');
      }

      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Access denied');
      }

      const isWorker = req.user!.role === 'WORKER';
      const numberToReturn = isWorker ? booking.customer.phone : booking.worker?.phone;

      sendResponse(res, 200, { phone: numberToReturn });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getBookingById: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const booking = await prisma.booking.findUnique({
        where: { id },
        select: {
          // OPTIMIZATION: Use select instead of include to reduce data transfer
          id: true,
          bookingNumber: true,
          type: true,
          customerId: true,
          workerId: true,
          addressId: true,
          serviceCategory: true,
          serviceName: true,
          description: true,
          issueId: true,
          scope: true,
          status: true,
          paymentStatus: true,
          baseAmount: true,
          platformFee: true,
          totalAmount: true,
          workerEarnings: true,
          marketRate: true,
          customerSaved: true,
          materialCost: true,
          visitFee: true,
          tip: true,
          arrivalOtp: true,
          workerLat: true,
          workerLng: true,
          workerEta: true,
          acceptedAt: true,
          onTheWayAt: true,
          startedAt: true,
          completedAt: true,
          cancelledAt: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true,
          review: { select: { id: true } },
          dispute: { select: { id: true } },
          customer: { select: { id: true, name: true, avatarUrl: true, role: true } },
          worker: { select: { id: true, name: true, avatarUrl: true, role: true } },
          address: {
            select: { id: true, label: true, line1: true, line2: true, latitude: true, longitude: true, city: true, state: true, pincode: true }
          },
        },
      });

      if (!booking) return sendError(res, 404, 'Booking not found');

      // Check if user is part of this booking
      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Access denied');
      }

      const bookingWithFlags = {
        ...booking,
        hasReview: (booking as any).review !== null,
        hasDispute: (booking as any).dispute !== null,
        review: undefined,
        dispute: undefined,
      };

      sendResponse(res, 200, bookingWithFlags);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  getMessages: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const booking = await prisma.booking.findUnique({ where: { id } });

      if (!booking) return sendError(res, 404, 'Booking not found');
      if (booking.customerId !== req.user!.userId && booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Access denied');
      }

      const chat = await prisma.chat.findUnique({
        where: { bookingId: id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { name: true, role: true } } }
          }
        }
      });

      sendResponse(res, 200, chat ? chat.messages.map((m: any) => ({ ...m, content: decryptField(m.content) })) : []);
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  sendArrivalOtp: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const booking = await prisma.booking.findUnique({
        where: { id },
        select: {
          id: true, workerId: true, arrivalOtp: true,
          customer: { select: { phone: true } },
        },
      });
      if (!booking || booking.workerId !== req.user!.userId) {
        return sendError(res, 403, 'Access denied');
      }
      if (!booking.arrivalOtp) {
        return sendError(res, 400, 'No arrival OTP generated yet');
      }

      // OTPs are surfaced in logs only when dev backdoors are explicitly enabled.
      if (devBackdoorsEnabled) {
        logger.info(`[DEV BACKDOOR] Booking arrival OTP for ${booking.customer.phone}: ${booking.arrivalOtp}`);
      }

      try {
        await twilioClient.messages.create({
          body: `[KaamWala] Your worker has arrived! Your secure 4-digit arrival code is ${booking.arrivalOtp}. Provide this to the worker to start the job.`,
          from: 'KAAMWALA',
          to: booking.customer.phone,
        }).catch(async (err) => {
           logger.warn('Alphanumeric Sender ID failed, falling back to Twilio Phone Number', err.message);
           return await twilioClient.messages.create({
             body: `[KaamWala] Your worker has arrived! Your secure 4-digit arrival code is ${booking.arrivalOtp}. Provide this to the worker to start the job.`,
             from: env.TWILIO_PHONE_NUMBER,
             to: booking.customer.phone,
           });
        });
      } catch (e: any) {
        // The failure message never contains the OTP; log it fully.
        logger.error('Twilio send failed:', e);
      }

      sendResponse(res, 200, { success: true }, 'OTP sent via SMS');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
