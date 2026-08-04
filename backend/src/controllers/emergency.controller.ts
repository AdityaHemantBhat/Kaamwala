import { Response } from 'express';
import { prisma } from '../config/prisma';
import { sendResponse, sendError } from '../utils/response';
import { generateBookingNumber } from '../utils/booking-number';
import { haversineDistance } from '../utils/haversine';
import { roundINR, roundINRWhole } from '../utils/money';
import { AuthRequest } from '../middleware/auth.middleware';
import { emitToAdmins } from '../services/socket.service';
import { logger } from '../utils/logger';
import { paymentCalculationService } from '../services/paymentCalculation.service';
import { getWorkerPlan } from '../services/workerPlans.service';

export const emergencyController = {
  getWorkers: async (req: AuthRequest, res: Response) => {
    try {
      const { category, lat, lng, city } = req.query;
      if (!category) return sendError(res, 400, 'Category required');

      const workers = await prisma.workerProfile.findMany({
        where: {
          category: category as any,
          isAvailable: true,
          isFrozen: false,
          isOnline: true,
          isUrgentEligible: true,
          verificationStatus: 'VERIFIED',
          city: city as string | undefined,
        },
        // Whitelist only public display fields — never bank/UPI/wallet/ban state.
        select: {
          id: true, userId: true, category: true, rating: true, totalRatings: true,
          latitude: true, longitude: true, city: true, hourlyRate: true, experienceYears: true,
          bio: true, verificationStatus: true, isAvailable: true, isOnline: true, isUrgentEligible: true,
          user: { select: { name: true, avatarUrl: true } },
        },
        take: 5,
      });

      const scored = workers
        .map(w => {
          const dist = (lat && lng && w.latitude != null && w.longitude != null)
            ? haversineDistance(parseFloat(lat as string), parseFloat(lng as string), w.latitude, w.longitude)
            : 9999;
          const score = (w.rating / 5) * 50 + Math.max(0, 50 - dist * 5);
          return { ...w, distanceKm: Math.round(dist * 10) / 10, score: Math.round(score) };
        })
        .filter(w => w.distanceKm <= 5)
        .sort((a, b) => b.score - a.score);

      sendResponse(res, 200, {
        workers: scored,
        urgentSurgeMultiplier: 1.5,
        note: 'Urgent bookings have 1.5x surge pricing. Worker dispatched within 60 min.',
      });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  bookEmergency: async (req: AuthRequest, res: Response) => {
    try {
      const { workerId, serviceCategory, description, addressId } = req.body;
      if (!workerId || !serviceCategory || !addressId) {
        return sendError(res, 400, 'Missing required fields: workerId, serviceCategory, addressId');
      }

      const worker = await prisma.workerProfile.findUnique({
        where: { userId: workerId },
        select: { isUrgentEligible: true, isFrozen: true, isBanned: true, hourlyRate: true, userId: true },
      });
      if (!worker || !worker.isUrgentEligible) {
        return sendError(res, 400, 'Worker not available for urgent booking');
      }
      if (worker.isFrozen || worker.isBanned) {
        return sendError(res, 400, 'This worker is currently unavailable');
      }

      // IDOR guard: the address must belong to the requesting customer.
      const address = await prisma.address.findFirst({
        where: { id: addressId, userId: req.user!.userId, isDeleted: false },
        select: { id: true },
      });
      if (!address) return sendError(res, 403, 'Address not found for this account');

      const baseAmount = roundINR(worker.hourlyRate * 1.5);

      // Get worker plan for commission calculation
      // EMERGENCY bookings use STANDARD calculation (same commission as worker plan)
      const planResult = await getWorkerPlan(workerId);
      const workerPlanTier = planResult.commissionPercent === 5 ? 'ELITE' : planResult.commissionPercent === 10 ? 'PRO' : 'FREE';

      // Use PaymentCalculationService for EMERGENCY booking
      // EMERGENCY bookings use STANDARD calculation (Req 8.1, 8.3)
      let calculatedPayment;
      try {
        calculatedPayment = await paymentCalculationService.calculateStandardBookingPayment({
          baseAmount,
          bookingType: 'EMERGENCY',
          workerPlanTier: workerPlanTier as 'FREE' | 'PRO' | 'ELITE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        });
      } catch (err) {
        logger.error('Payment calculation failed for emergency booking', { error: err, baseAmount, workerId });
        return sendError(res, 500, `Payment calculation failed: ${(err as Error).message}`);
      }

      const appliedCommissionRate = `WORKER_PLAN_${workerPlanTier}`;

      const booking = await prisma.booking.create({
        data: {
          bookingNumber: generateBookingNumber(),
          type: 'EMERGENCY',
          customerId: req.user!.userId,
          workerId,
          addressId,
          serviceCategory: serviceCategory as any,
          serviceName: `EMERGENCY: ${serviceCategory.replace(/_/g, ' ')}`,
          description: description || 'Emergency service requested',
          scheduledAt: new Date(Date.now() + 1800000), // 30 min
          estimatedDuration: 120,
          status: 'PENDING',
          isSurge: true,
          surgeMultiplier: 1.5,
          baseAmount,
          platformFeePercent: calculatedPayment.platformFeePercent,
          platformFee: calculatedPayment.platformFee,
          appliedCommissionRate,
          workerEarnings: calculatedPayment.workerEarnings,
          totalAmount: calculatedPayment.totalAmount,
          calculatedAt: new Date(),
        } as any,
      });

      logger.info('Emergency booking created', {
        bookingId: booking.id,
        baseAmount,
        platformFeePercent: booking.platformFeePercent,
        platformFee: booking.platformFee,
        workerEarnings: booking.workerEarnings,
      });

      sendResponse(res, 201, booking, 'Emergency booking created! Worker will be dispatched shortly.');
    } catch (e: any) {
      logger.error('Book emergency error', { error: e });
      sendError(res, 500, e.message);
    }
  },

  handleSOS: async (req: AuthRequest, res: Response) => {
    try {
      const { lat, lng, bookingId, type } = req.body;
      const userId = req.user!.userId;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phone: true }
      });

      // 1. Create a support ticket automatically
      const ticket = await prisma.supportTicket.create({
        data: {
          userId,
          subject: `URGENT SOS ALERT: ${user?.name || 'Worker'}`,
          description: `SOS Alert triggered by worker.`,
          status: 'open',
          messages: {
            create: {
              senderId: userId,
              message: `SOS Triggered! Location: Lat ${lat}, Lng ${lng}. ${bookingId ? 'Booking ID: ' + bookingId : ''}`,
            }
          }
        },
        include: { messages: true }
      });

      // 2. Alert all admins immediately via Socket
      emitToAdmins('admin_alert', {
        title: '🔴 SOS ALERT',
        message: `${user?.name} triggered SOS!`,
        ticketId: ticket.id,
        lat,
        lng,
        userId
      });

      sendResponse(res, 200, { ticketId: ticket.id }, 'SOS Alert Sent');
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  }
};
