import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { getIo, emitToUser } from '../services/socket.service';
import { resolveServiceAddress } from '../services/address.service';
import { bookingService } from '../services/booking.service';
import { pricingService } from '../services/pricing.service';
import { issueDiscoveryService } from '../services/issueDiscovery.service';
import { getWorkerPlan, computeUrgentFinance } from '../services/workerPlans.service';
import { contactPolicyError } from '../services/contactDetector.service';
import { analyticsService } from '../services/analytics.service';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { roundINRWhole } from '../utils/money';
import { matchingService } from '../services/matching.service';
import { linkMediaToScope } from '../services/media.service';
import { notificationService } from '../services/notification.service';
import { paymentCalculationService } from '../services/paymentCalculation.service';

// "Emergency included" — PRO customers pay no urgency surge premium.
async function isUrgentPremiumWaived(customerId: string): Promise<boolean> {
  try {
    const sub = await prisma.userSubscription.findUnique({
      where: { userId: customerId },
      select: { plan: true, status: true },
    });
    return !!sub && sub.status === 'active' && sub.plan === 'PRO';
  } catch { return false; }
}

/**
 * Close every open offer round for an urgent request when it finishes
 * (accepted / cancelled / expired). Rounds are the audit trail of the offer
 * escalation, so each must be stamped with when it ended and why.
 */
export async function closeUrgentRounds(urgentRequestId: string, outcome: 'ACCEPTED' | 'CANCELLED' | 'EXPIRED'): Promise<void> {
  try {
    await prisma.urgentOfferRound.updateMany({
      where: { urgentRequestId, endedAt: null },
      data: { endedAt: new Date(), outcome },
    });
  } catch (e) {
    logger.error('Failed to close urgent offer rounds', { error: (e as Error).message, urgentRequestId, outcome });
  }
}

export const urgentController = {
  previewUrgent: async (req: AuthRequest, res: Response) => {
    try {
      const { category, pricingUnit = 'FLAT', issueId } = req.body;
      const customerId = req.user!.userId;

      const address = await resolveServiceAddress(customerId);

      const [basePrice, waived] = await Promise.all([
        pricingService.calculateMarketBase(category, address?.city, pricingUnit, issueId || null),
        isUrgentPremiumWaived(customerId),
      ]);
      const multiplier = waived ? 1 : parseFloat(await pricingService.getConfig('URGENT_MULTIPLIER', '1.3'));
      const initialOffer = roundINRWhole(basePrice * multiplier);

      sendResponse(res, 200, {
        basePrice,
        initialOffer,
        urgencyPremium: roundINRWhole(basePrice * multiplier) - basePrice,
        multiplier,
        pricingUnit,
        message: 'Preview generated successfully'
      });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  requestUrgent: async (req: AuthRequest, res: Response) => {
    try {
      const { category, issueReason, description, imageUrl, pricingUnit = 'FLAT', issueId } = req.body;
      const customerId = req.user!.userId;

      // Free-text contact bypass detection
      const contactError = contactPolicyError(`${issueReason || ''} ${description || ''}`);
      if (contactError) return sendError(res, 400, contactError);

      // Service location is authoritative for pricing
      const address = await resolveServiceAddress(customerId);

      if (!address) {
        return sendError(res, 400, 'Please add an address first');
      }

      // Server-authoritative pricing : NEVER trust client basePriceSnapshot/initialOffer.
      const [basePrice, waived] = await Promise.all([
        pricingService.calculateMarketBase(category, address?.city, pricingUnit, issueId || null),
        isUrgentPremiumWaived(customerId),
      ]);
      const multiplier = waived ? 1 : parseFloat(await pricingService.getConfig('URGENT_MULTIPLIER', '1.3'));
      const initialOffer = Math.round(basePrice * multiplier);

      // Resolve 'What's Happening?' to canonical issue (or Other) + discovery
      const resolvedIssueId = await issueDiscoveryService.resolveIssue(
        category, issueId || issueReason, issueReason, description, customerId,
      );

      // Check active duplicate and auto-cancel if it exists
      const activeRequest = await prisma.urgentRequest.findFirst({
        where: { 
          customerId, 
          status: 'SEARCHING',
          expiresAt: { gt: new Date() }
        }
      });
      if (activeRequest) {
        await prisma.urgentRequest.update({
          where: { id: activeRequest.id },
          data: { status: 'CANCELLED' }
        });
        getIo().emit('urgent_cancelled', { requestId: activeRequest.id });
      }

      // Create Request in DB (Expires in 5 minutes)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const urgentRequest = await prisma.urgentRequest.create({
        data: {
          customerId,
          category,
          issueReason,
          issueId: resolvedIssueId,
          description,
          imageUrl,
          addressId: address.id,
          basePriceSnapshot: basePrice,
          currentOffer: initialOffer,
          pricingUnit,
          status: 'SEARCHING',
          offerVersion: 0,
          expiresAt
        }
      });

      const payload = {
        requestId: urgentRequest.id,
        customerId,
        category,
        issueReason,
        issueId: resolvedIssueId,
        description,
        imageUrl,
        currentOffer: initialOffer,
        basePriceSnapshot: urgentRequest.basePriceSnapshot,
        pricingUnit,
        offerVersion: urgentRequest.offerVersion,
        latitude: address.latitude,
        longitude: address.longitude,
        expiresAt: urgentRequest.expiresAt
      };

      // Target matching : only VERIFIED + urgent-eligible +
      // active + in-radius + not-busy workers receive the request. No blind broadcast.
      const eligible = await matchingService.findEligibleWorkers({
        category,
        latitude: address.latitude,
        longitude: address.longitude,
        urgent: true,
      });

      // Link the uploaded image to the urgent request
      if (urgentRequest.imageUrl) {
        await linkMediaToScope([urgentRequest.imageUrl], { requestId: urgentRequest.id }).catch(() => {});
      }

      // Zero eligible workers → don't start a pointless timer
      if (eligible.length === 0) {
        await prisma.urgentRequest.update({
          where: { id: urgentRequest.id },
          data: { status: 'CANCELLED' },
        });
        analyticsService.track('urgent_no_eligible_workers', { userId: customerId, role: 'CUSTOMER', category, issueId: resolvedIssueId || undefined, zone: address.city || undefined, ip: req.ip || req.socket.remoteAddress, payload: { requestId: urgentRequest.id } });
        return sendError(res, 409, 'NO_ELIGIBLE_WORKERS|No verified workers currently available for this urgent request.');
      }

      for (const worker of eligible) {
        // Per-worker commission : each worker's expected earnings
        // is computed from their own plan — commission applies to the base only.
        const { commissionPercent } = await getWorkerPlan(worker.userId);
        emitToUser(worker.userId, 'urgent_request', { ...payload, commissionPercent });
        
        // Push notification for offline workers
        await notificationService.sendPushNotification(
          worker.userId,
          'URGENT Booking Request!',
          `A new urgent request for ${category} is available. Tap to view and accept!`,
          'urgent_request',
          { requestId: urgentRequest.id }
        ).catch(() => {});
      }
      analyticsService.track('urgent_request', { userId: customerId, role: 'CUSTOMER', category, issueId: resolvedIssueId || undefined, zone: address.city || undefined, ip: req.ip || req.socket.remoteAddress, payload: { requestId: urgentRequest.id, offer: initialOffer, eligibleWorkers: eligible.length } });

      sendResponse(res, 200, { requestId: urgentRequest.id, matchedWorkers: eligible.length, message: 'Sent to nearby eligible workers' });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  increaseOffer: async (req: AuthRequest, res: Response) => {
    try {
      const { requestId, increaseAmount } = req.body;
      const customerId = req.user!.userId;

      const urgentRequest = await prisma.urgentRequest.findUnique({ where: { id: requestId } });
      if (!urgentRequest || urgentRequest.customerId !== customerId) {
        return sendError(res, 404, 'Request not found');
      }
      if (urgentRequest.status !== 'SEARCHING') {
        return sendError(res, 400, 'Request is no longer searching');
      }
      if (increaseAmount <= 0) {
        return sendError(res, 400, 'Increase amount must be greater than 0');
      }

      // Config-backed boost bounds — offer only moves up, never unlimited bidding.
      const maxBoostAmount = parseFloat(await pricingService.getConfig('URGENT_MAX_BOOST_AMOUNT', '1000'));
      if (increaseAmount > maxBoostAmount) {
        return sendError(res, 400, `Maximum single increase is ₹${Math.round(maxBoostAmount)}.`);
      }

      // Maximum offer protection (config-backed, default 3x base)
      const maxMultiplier = parseFloat(await pricingService.getConfig('URGENT_MAX_OFFER_MULTIPLIER', '3'));
      const newOffer = urgentRequest.currentOffer + increaseAmount;
      if (newOffer > urgentRequest.basePriceSnapshot * maxMultiplier) {
        return sendError(res, 400, 'Maximum urgent offer limit reached.');
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Reset 5 min timer
      const roundCount = await prisma.urgentOfferRound.count({ where: { urgentRequestId: requestId } });

      const updatedRequest = await prisma.urgentRequest.update({
        where: { id: requestId },
        data: {
          currentOffer: newOffer,
          offerVersion: { increment: 1 }, //
          expiresAt,
          offers: {
            create: {
              roundNumber: roundCount + 1,
              offerAmount: newOffer,
              increaseAmount
            }
          }
        }
      });

      getIo().emit('urgent_offer_increased', {
        requestId,
        newOffer,
        offerVersion: updatedRequest.offerVersion,
        expiresAt
      });
      analyticsService.track('urgent_offer_increased', { userId: customerId, role: 'CUSTOMER', category: urgentRequest.category, ip: req.ip || req.socket.remoteAddress, payload: { requestId, newOffer, increase: increaseAmount } });

      sendResponse(res, 200, { newOffer, expiresAt, message: 'Offer increased successfully' });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  cancelUrgent: async (req: AuthRequest, res: Response) => {
    try {
      const { requestId } = req.body;
      const customerId = req.user!.userId;

      const urgentReq = await prisma.urgentRequest.findUnique({ where: { id: requestId } });
      if (!urgentReq || urgentReq.customerId !== customerId) return sendError(res, 404, 'Request not found');
      if (urgentReq.status !== 'SEARCHING') return sendError(res, 400, 'Cannot cancel now');

      await prisma.urgentRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' }
      });
      await closeUrgentRounds(requestId, 'CANCELLED');

      getIo().emit('urgent_cancelled', { requestId });
      return sendResponse(res, 200, { message: 'Cancelled successfully' });
    } catch (e: any) {
      sendError(res, 500, e.message);
    }
  },

  acceptUrgent: async (req: AuthRequest, res: Response) => {
    try {
      const { requestId, offerVersion } = req.body;
      const workerId = req.user!.userId;

      const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
      if (!workerProfile || workerProfile.verificationStatus !== 'VERIFIED' || !workerProfile.isUrgentEligible) {
        return sendError(res, 403, 'You are not eligible for urgent bookings');
      }

      if (workerProfile.walletBalance < 0) {
        return sendError(res, 403, 'Negative wallet balance. Please recharge.');
      }

      // Offer versioning : if client saw a stale offer, reject before accepting.
      const preReq = await prisma.urgentRequest.findUnique({ where: { id: requestId } });
      if (!preReq || preReq.status !== 'SEARCHING') {
        return sendError(res, 400, 'This request has already been accepted or expired.');
      }
      if (offerVersion !== undefined && offerVersion !== preReq.offerVersion) {
        return sendError(res, 409, 'Offer has changed. Please refresh before accepting.');
      }

      // Atomic lock — only ONE worker can win
      const updatedReq = await prisma.urgentRequest.updateMany({
        where: { id: requestId, status: 'SEARCHING' },
        data: { status: 'ACCEPTED' }
      });

      if (updatedReq.count === 0) {
        // Observability : a race-condition rejection — someone else won.
        analyticsService.track('matching_failed', { userId: workerId, role: 'WORKER', category: preReq?.category, payload: { requestId, reason: 'accept_race_lost' } });
        return sendError(res, 400, 'This request has already been accepted or expired.');
      }

      const urgentReq = await prisma.urgentRequest.findUnique({ where: { id: requestId } });
      if (!urgentReq) return sendError(res, 404, 'Request missing');

      // Close the offer-round audit trail now that the auction has a winner.
      await closeUrgentRounds(requestId, 'ACCEPTED');

      // Use PaymentCalculationService to compute all amounts for urgent booking
      // Requirements: 1.2, 3.2, 8.2 - URGENT bookings have 0% commission
      const multiplier = parseFloat(await pricingService.getConfig('URGENT_MULTIPLIER', '1.3'));
      const algorithmVersion = await pricingService.getConfig('PRICING_ALGORITHM_VERSION', 'LOCAL_MARKET_V1');

      // Calculate payment using the payment calculation service
      let calculatedPayment;
      try {
        calculatedPayment = await paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: urgentReq.basePriceSnapshot,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE', // Doesn't matter for urgent (0% commission), but required
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: multiplier,
          customerBoost: 0, // No customer boost in urgent for now
        });
      } catch (err) {
        logger.error('Payment calculation failed for urgent booking', { error: err, requestId });
        return sendError(res, 500, `Payment calculation failed: ${(err as Error).message}`);
      }

      // Financial snapshot — historical accepted terms must never silently change
      const financialSnapshot = {
        base: urgentReq.basePriceSnapshot,
        algorithmVersion,
        issueId: urgentReq.issueId,
        pricingUnit: urgentReq.pricingUnit,
        urgencyMultiplier: multiplier,
        urgencyPremium: calculatedPayment.urgencyPremium,
        offerVersion: urgentReq.offerVersion,
        acceptedOffer: urgentReq.currentOffer,
        platformFeePercent: calculatedPayment.platformFeePercent,
        platformFee: calculatedPayment.platformFee,
        workerEarnings: calculatedPayment.workerEarnings,
        currency: 'INR',
      };

      const booking = await prisma.booking.create({
        data: {
          bookingNumber: "KW" + Math.floor(100000 + Math.random() * 900000),
          type: 'URGENT',
          customerId: urgentReq.customerId,
          workerId: workerId,
          serviceCategory: urgentReq.category,
          serviceName: 'Urgent: ' + urgentReq.issueReason,
          description: urgentReq.description || 'No description',
          issueId: urgentReq.issueId,
          scope: (urgentReq.scope as any) || undefined,
          addressId: urgentReq.addressId,
          scheduledAt: new Date(),
          estimatedDuration: 60,
          status: 'ON_THE_WAY',
          paymentStatus: 'PENDING',
          isSurge: true,
          surgeMultiplier: multiplier,
          baseAmount: urgentReq.basePriceSnapshot,
          urgencyPremiumAmount: calculatedPayment.urgencyPremium,
          urgencySurgeMultiplier: calculatedPayment.surgeMultiplier,
          urgencyBreakdown: JSON.parse(JSON.stringify(calculatedPayment.urgencyBreakdown || {})),
          acceptedOffer: urgentReq.currentOffer,
          pricingUnit: urgentReq.pricingUnit,
          platformFeePercent: calculatedPayment.platformFeePercent,
          platformFee: calculatedPayment.platformFee,
          appliedCommissionRate: 'URGENT_ZERO',
          workerEarnings: calculatedPayment.workerEarnings,
          totalAmount: urgentReq.currentOffer,
          calculatedAt: new Date(),
          acceptedAt: new Date(),
          onTheWayAt: new Date(),
          travelProtectionEligibleAt: new Date(),
          arrivalOtp: Math.floor(1000 + Math.random() * 9000).toString(),
          pricingSnapshot: financialSnapshot,
        } as any
      });

      // Ledger entries for audit trail
      // For urgent bookings, include urgency breakdown in ledger entries
      await prisma.transaction.create({
        data: {
          userId: workerId,
          bookingId: booking.id,
          type: 'WALLET_CREDIT',
          amount: calculatedPayment.workerEarnings,
          description: `Urgent booking earnings for ${urgentReq.issueReason}`,
          status: 'completed',
          meta: { bookingId: booking.id, requestId },
          calculationDetails: {
            baseAmount: urgentReq.basePriceSnapshot,
            platformFeePercent: calculatedPayment.platformFeePercent,
            platformFee: calculatedPayment.platformFee,
            workerEarnings: calculatedPayment.workerEarnings,
            urgencyBreakdown: calculatedPayment.urgencyBreakdown,
          },
        } as any,
      });

      // Legitimate base observation — ONLY the base, never urgent premium/boost
      await pricingService.recordObservation({
        category: urgentReq.category,
        issueId: urgentReq.issueId,
        pricingUnit: urgentReq.pricingUnit,
        zone: null,
        unitRate: urgentReq.basePriceSnapshot,
        totalAmount: urgentReq.basePriceSnapshot,
        origin: 'FINAL_AGREED',
        customerId: urgentReq.customerId,
        workerId,
        bookingId: booking.id,
        riskScore: 0,
      });

      // Notify the customer only. (No `urgent_accepted_global` broadcast: it
      // leaked the acceptance to every connected client and no client handled it.)
      emitToUser(urgentReq.customerId, 'urgent_accepted', { bookingId: booking.id, workerId });
      await notificationService.sendPushNotification(
        urgentReq.customerId, 'Urgent Job Accepted',
        `A worker has accepted your urgent request. Track them live to your location.`,
        'urgent_accepted', { bookingId: booking.id, requestId: urgentReq.id },
      );
      analyticsService.track('urgent_accepted', { 
        userId: workerId, 
        role: 'WORKER', 
        category: urgentReq.category, 
        issueId: urgentReq.issueId || undefined, 
        ip: req.ip || req.socket.remoteAddress, 
        payload: {
          bookingId: booking.id,
          offer: urgentReq.currentOffer,
          platformFeePercent: calculatedPayment.platformFeePercent,
          platformFee: calculatedPayment.platformFee,
        }
      });

      logger.info('Urgent booking accepted', {
        bookingId: booking.id,
        baseAmount: urgentReq.basePriceSnapshot,
        urgencyPremium: calculatedPayment.urgencyPremium,
        platformFeePercent: calculatedPayment.platformFeePercent,
        platformFee: calculatedPayment.platformFee,
        workerEarnings: calculatedPayment.workerEarnings,
      });

      sendResponse(res, 200, { bookingId: booking.id, message: 'Urgent booking secured!' });
    } catch (e: any) {
      logger.error('Accept urgent error', { error: e });
      sendError(res, 500, e.message);
    }
  }
};
