import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { emitToUser } from '../services/socket.service';
import { resolveServiceAddress } from '../services/address.service';
import { notificationService } from '../services/notification.service';
import { issueDiscoveryService } from '../services/issueDiscovery.service';
import { contactPolicyError } from '../services/contactDetector.service';
import { getWorkerPlan } from '../services/workerPlans.service';
import { pricingService } from '../services/pricing.service';
import { matchingService } from '../services/matching.service';
import { analyticsService } from '../services/analytics.service';
import { linkMediaToScope } from '../services/media.service';
import { logger } from '../utils/logger';
import { roundINR, roundINRWhole } from '../utils/money';
import { isAdminRole } from '../utils/roles';
import { paymentCalculationService } from '../services/paymentCalculation.service';

export const requestsController = {
  createRequest: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Customer profile not found');

      // Free-text contact bypass detection
      const contactError = contactPolicyError(`${req.body.title || ''} ${req.body.description || ''}`);
      if (contactError) return sendError(res, 400, contactError);

      // Platform minimum-floor validation — never trust frontend budget.
      const pricingUnit = req.body.pricingUnit === 'PER_HOUR' ? 'PER_HOUR' : 'FLAT';
      if (req.body.budget !== undefined && req.body.budget !== null) {
        const floorOk = await pricingService.validateMinimumFloor(
          req.body.category, Number(req.body.budget), pricingUnit, req.body.city,
        );
        if (!floorOk) return sendError(res, 400, 'Budget is below the platform minimum for this service');
      }

      // Service location is authoritative for pricing.
      let address = null;
      if (req.body.addressId) {
        address = await prisma.address.findFirst({ where: { id: req.body.addressId, userId: req.user!.userId } });
        if (!address) return sendError(res, 400, 'Address not found');
      }

      // Resolve 'What's Happening?' to canonical issue (or Other) + discovery
      const resolvedIssueId = await issueDiscoveryService.resolveIssue(
        req.body.category, req.body.issueId, req.body.title, req.body.description, req.user!.userId,
      );

      const request = await prisma.customerJobRequest.create({
        data: {
          customerId: profile.id,
          title: req.body.title,
          description: req.body.description,
          category: req.body.category,
          issueId: resolvedIssueId,
          scope: req.body.scope || undefined,
          recommendedPrice: req.body.recommendedPrice || null,
          addressId: address?.id || null,
          images: Array.isArray(req.body.images)
            ? req.body.images.filter((u: string) => typeof u === 'string' && u.startsWith('https://')).slice(0, 6)
            : [],
          budget: req.body.budget,
          budgetType: req.body.budgetType,
          pricingUnit,
          recommendationExposed: !!req.body.recommendationExposed,
          city: req.body.city || address?.city || null,
          pincode: req.body.pincode || address?.pincode || null,
          scheduledDate: req.body.scheduledDate ? new Date(req.body.scheduledDate) : undefined,
          status: 'OPEN',
        },
      });

      // Link uploaded MediaAssets to the request — prevents orphan cleanup
      // from deleting in-use request images.
      if (request.images.length) {
        await linkMediaToScope(request.images, { requestId: request.id }).catch(() => {});
      }

      // Realtime delivery of open requests to eligible workers
      const eligible = await matchingService.findEligibleWorkers({
        category: req.body.category,
        latitude: address?.latitude ?? null,
        longitude: address?.longitude ?? null,
      });
      const payload = {
        requestId: request.id, title: request.title, category: request.category,
        issueId: request.issueId, scope: request.scope, images: request.images,
        budget: request.budget, budgetType: request.budgetType, pricingUnit,
        city: request.city, scheduledDate: request.scheduledDate,
        createdAt: request.createdAt,
      };
      for (const worker of eligible) {
        emitToUser(worker.userId, 'request_matched', payload);
        await notificationService.sendPushNotification(
          worker.userId, 'New Request Available',
          `${request.title} in ${request.city || 'your area'} — tap to view and quote.`,
          'request_matched', { requestId: request.id, category: request.category },
        ).catch(() => {});
      }
      analyticsService.track('request_created', { userId: req.user!.userId, role: 'CUSTOMER', category: request.category, issueId: request.issueId || undefined, zone: request.city || undefined, ip: req.ip || req.socket.remoteAddress, payload: { requestId: request.id, matchedWorkers: eligible.length } });
      analyticsService.track('request_matched', { role: 'WORKER', category: request.category, zone: request.city || undefined, payload: { requestId: request.id, workers: eligible.length } });

      sendResponse(res, 201, request, 'Request posted! Workers will see it soon.');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getRecommendation: async (req: AuthRequest, res: Response) => {
    try {
      const { category, issueId, scope, city, addressId } = req.body;
      const pricingUnit = req.body.pricingUnit === 'PER_HOUR' ? 'PER_HOUR' : 'FLAT';

      // Service location wins over passed city
      let zone: string | null = city || null;
      if (addressId) {
        const address = await prisma.address.findFirst({ where: { id: addressId, userId: req.user!.userId } });
        if (address) zone = address.city;
      }

      const rec = await pricingService.getRecommendation(category, zone, pricingUnit, issueId || null, scope);
      sendResponse(res, 200, rec);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  quoteOnRequest: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, message, pricingUnit = 'FLAT' } = req.body;
      const workerId = req.user!.userId;

      const request = await prisma.customerJobRequest.findUnique({ where: { id } });
      if (!request || request.status !== 'OPEN') return sendError(res, 404, 'Request not available');

      // Worker must be verified + active
      const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: workerId } });
      if (!workerProfile || workerProfile.verificationStatus !== 'VERIFIED') {
        return sendError(res, 403, 'Only verified workers can quote');
      }

      // Platform minimum floor — market-derived per the request's city.
      const unit = pricingUnit === 'PER_HOUR' ? 'PER_HOUR' : 'FLAT';
      const floorOk = await pricingService.validateMinimumFloor(request.category, Number(amount), unit, request.city);
      if (!floorOk) return sendError(res, 400, 'Quote is below the platform minimum for this service');

      // Idempotent per-worker: reuse the worker's existing interest + update its quote
      const existing = await prisma.requestInterest.findFirst({
        where: { requestId: id, workerId },
      });

      let interest;
      if (existing) {
        interest = await prisma.requestInterest.update({
          where: { id: existing.id },
          data: { quoteAmount: Number(amount), quoteUnit: unit, quoteMessage: message || null, status: 'PENDING' },
        });
      } else {
        const workerUser = await prisma.user.findUnique({ where: { id: workerId }, select: { name: true } });
        interest = await prisma.requestInterest.create({
          data: {
            requestId: id, workerId, workerProfileId: workerProfile.id,
            workerName: workerUser?.name || 'Worker', workerRating: workerProfile.rating,
            workerCategory: workerProfile.category, message,
            quoteAmount: Number(amount), quoteUnit: unit, quoteMessage: message || null,
          },
        });
      }

      // Full negotiation history — never overwritten
      await prisma.requestOffer.create({
        data: {
          requestId: id, interestId: interest.id, offeredBy: 'WORKER',
          amount: Number(amount), pricingUnit: unit, message: message || null,
        },
      });

      const customerProfile = await prisma.customerProfile.findUnique({ where: { id: request.customerId }, select: { userId: true } });
      if (customerProfile) {
        emitToUser(customerProfile.userId, 'request_quote', {
          requestId: id, interestId: interest.id, workerId, workerName: interest.workerName,
          amount: Number(amount), pricingUnit: unit, message: message || null,
        });
        await notificationService.sendPushNotification(
          customerProfile.userId, 'Worker Quote!',
          `${interest.workerName} quoted ₹${Number(amount).toLocaleString('en-IN')} for: ${request.title}`, 'worker_quote',
          { requestId: id },
        );
      }

      analyticsService.track('request_quote', { userId: workerId, role: 'WORKER', category: request.category, issueId: request.issueId || undefined, zone: request.city || undefined, ip: req.ip || req.socket.remoteAddress, payload: { requestId: id, amount: Number(amount) } });
      sendResponse(res, 200, interest, 'Quote sent to customer!');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  counterOffer: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { interestId, amount, message } = req.body;

      const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Customer profile not found');

      const request = await prisma.customerJobRequest.findFirst({
        where: { id, customerId: profile.id, status: 'OPEN' },
      });
      if (!request) return sendError(res, 404, 'Request not found or no longer open');

      const interest = await prisma.requestInterest.findFirst({ where: { id: interestId, requestId: id } });
      if (!interest) return sendError(res, 404, 'Interest not found');

      const unit = interest.quoteUnit === 'PER_HOUR' ? 'PER_HOUR' : 'FLAT';
      const floorOk = await pricingService.validateMinimumFloor(request.category, Number(amount), unit, request.city);
      if (!floorOk) return sendError(res, 400, 'Counter offer is below the platform minimum for this service');

      await prisma.requestOffer.create({
        data: {
          requestId: id, interestId, offeredBy: 'CUSTOMER',
          amount: Number(amount), pricingUnit: unit, message: message || null,
        },
      });

      emitToUser(interest.workerId, 'request_counter', {
        requestId: id, interestId, amount: Number(amount), pricingUnit: unit, message: message || null,
      });
      await notificationService.sendPushNotification(
        interest.workerId, 'New Counter Offer',
        `Customer countered ₹${Number(amount).toLocaleString('en-IN')} for your quote`, 'request_counter',
        { requestId: id },
      );

      analyticsService.track('request_counter', { userId: req.user!.userId, role: 'CUSTOMER', category: request.category, issueId: request.issueId || undefined, zone: request.city || undefined, ip: req.ip || req.socket.remoteAddress, payload: { requestId: id, amount: Number(amount) } });
      sendResponse(res, 200, null, 'Counter offer sent to worker!');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getOffers: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const request = await prisma.customerJobRequest.findUnique({ where: { id } });
      if (!request) return sendError(res, 404, 'Request not found');

      const isParticipant =
        request.customerId === (await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } }))?.id
        || await prisma.requestInterest.count({ where: { requestId: id, workerId: req.user!.userId } }) > 0;
      if (!isParticipant && !isAdminRole(req.user!.role)) return sendError(res, 403, 'Access denied');

      const offers = await prisma.requestOffer.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } });
      sendResponse(res, 200, offers);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  listMyRequests: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Customer profile not found');

      const requests = await prisma.customerJobRequest.findMany({
        where: { customerId: profile.id },
        orderBy: { createdAt: 'desc' },
      });

      const enriched = await Promise.all(requests.map(async (r) => {
        if (r.workerId) {
          const user = await prisma.user.findUnique({ where: { id: r.workerId }, select: { name: true } });
          return { ...r, workerName: user?.name || 'Worker' };
        }
        return r;
      }));

      sendResponse(res, 200, enriched);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  deleteRequest: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Customer profile not found');

      const request = await prisma.customerJobRequest.findFirst({
        where: { id: req.params.id, customerId: profile.id },
      });
      if (!request) return sendError(res, 404, 'Request not found');

      await prisma.customerJobRequest.delete({ where: { id: req.params.id } });
      sendResponse(res, 200, null, 'Request removed');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  browseRequests: async (req: AuthRequest, res: Response) => {
    try {
      const { category, city } = req.query;
      const where: any = { status: 'OPEN' };
      if (category) where.category = category;
      if (city) where.city = city;

      const requests = await prisma.customerJobRequest.findMany({
        where,
        include: { customer: { select: { user: { select: { name: true, phone: true } } } } },
        orderBy: { createdAt: 'desc' }, take: 50,
      });

      sendResponse(res, 200, requests);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  expressInterest: async (req: AuthRequest, res: Response) => {
    try {
      const request = await prisma.customerJobRequest.findUnique({ where: { id: req.params.id } });
      if (!request || request.status !== 'OPEN') return sendError(res, 404, 'Request not available');

      const existing = await prisma.requestInterest.findFirst({
        where: { requestId: req.params.id, workerId: req.user!.userId },
      });
      if (existing) return sendError(res, 400, 'Already expressed interest');

      const workerProfile = await prisma.workerProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true, category: true, rating: true },
      });
      if (!workerProfile) return sendError(res, 404, 'Worker profile not found');

      // Lead quota — "Limited leads" (FREE) vs "Unlimited leads" (PRO/ELITE).
      // FREE workers get a monthly cap; PRO/ELITE are unlimited.
      const workerPlan = await getWorkerPlan(req.user!.userId);
      const FREE_LEAD_LIMIT = 5;
      if (workerPlan.plan === 'FREE') {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const leadProfile = await prisma.workerProfile.findUnique({
          where: { userId: req.user!.userId },
          select: { leadsUsedThisMonth: true, leadsQuotaResetAt: true },
        });
        const needsReset = !leadProfile?.leadsQuotaResetAt || leadProfile.leadsQuotaResetAt < monthStart;
        const usedThisMonth = needsReset ? 0 : (leadProfile?.leadsUsedThisMonth || 0);
        if (usedThisMonth >= FREE_LEAD_LIMIT) {
          return sendError(res, 403, 'You have used your free lead limit for this month. Upgrade to PRO for unlimited leads.');
        }
        await prisma.workerProfile.update({
          where: { userId: req.user!.userId },
          data: {
            leadsUsedThisMonth: usedThisMonth + 1,
            leadsQuotaResetAt: needsReset ? monthStart : (leadProfile?.leadsQuotaResetAt || monthStart),
          },
        });
      }

      const workerUser = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });

      await prisma.requestInterest.create({
        data: {
          requestId: req.params.id, workerId: req.user!.userId,
          workerProfileId: workerProfile.id, workerName: workerUser?.name || 'Worker',
          workerRating: workerProfile.rating, workerCategory: workerProfile.category,
        },
      });

      const customerProfile = await prisma.customerProfile.findUnique({
        where: { id: request.customerId }, select: { userId: true },
      });

      if (customerProfile) {
        await notificationService.sendPushNotification(
          customerProfile.userId, 'Worker Interested!',
          `A worker is interested in your request: ${request.title}`, 'worker_interest',
          { requestId: req.params.id, workerId: req.user!.userId },
        );
      }

      sendResponse(res, 200, null, 'Interest sent to customer!');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getInterests: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Customer profile not found');

      const request = await prisma.customerJobRequest.findFirst({
        where: { id: req.params.id, customerId: profile.id },
      });
      if (!request) return sendError(res, 404, 'Request not found');

      const interests = await prisma.requestInterest.findMany({
        where: { requestId: req.params.id },
        orderBy: { createdAt: 'desc' },
      });

      sendResponse(res, 200, interests);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  acceptInterest: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Customer profile not found');

      const request = await prisma.customerJobRequest.findFirst({
        where: { id: req.params.id, customerId: profile.id, status: 'OPEN' },
      });
      if (!request) return sendError(res, 404, 'Request not found or already assigned');

      const { interestId } = req.body;
      const interest = await prisma.requestInterest.findFirst({
        where: { id: interestId, requestId: req.params.id, status: 'PENDING' },
      });
      if (!interest) return sendError(res, 404, 'Interest not found');

      await prisma.requestInterest.update({ where: { id: interestId }, data: { status: 'ACCEPTED' } });
      await prisma.requestInterest.updateMany({
        where: { requestId: req.params.id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });

      // Final agreed amount = the accepted worker's last quote.
      // Recorded as FINAL_AGREED evidence; legitimate completion is recorded at COMPLETED.
      const finalAgreed = interest.quoteAmount ?? request.budget ?? null;
      await prisma.customerJobRequest.update({
        where: { id: req.params.id },
        data: {
          status: 'ASSIGNED', workerId: interest.workerId,
          finalAgreedAmount: finalAgreed,
          pricingUnit: interest.quoteUnit || request.pricingUnit || 'FLAT',
        },
      });
      await prisma.requestOffer.updateMany({
        where: { requestId: req.params.id, interestId, status: 'OPEN' },
        data: { status: 'ACCEPTED' },
      });
      await prisma.requestOffer.updateMany({
        where: { requestId: req.params.id, status: 'OPEN' },
        data: { status: 'SUPERSEDED' },
      });

      if (finalAgreed != null) {
        await pricingService.recordObservation({
          category: request.category,
          issueId: request.issueId || null,
          scope: (request as any).scope || null,
          pricingUnit: interest.quoteUnit || request.pricingUnit || 'FLAT',
          zone: request.city || null,
          unitRate: Number(finalAgreed),
          totalAmount: Number(finalAgreed),
          origin: 'FINAL_AGREED',
          customerId: req.user!.userId,
          workerId: interest.workerId,
          recommendationExposed: request.recommendationExposed,
          riskScore: 0,
        });
      }

      emitToUser(interest.workerId, 'request_accepted', { requestId: req.params.id, title: request.title });
      await notificationService.sendPushNotification(
        interest.workerId, 'Request Accepted!', `You've been selected for: ${request.title}`, 'request_accepted',
      );

      analyticsService.track('quote_accepted', { userId: req.user!.userId, role: 'CUSTOMER', category: request.category, issueId: request.issueId || undefined, zone: request.city || undefined, ip: req.ip || req.socket.remoteAddress, payload: { requestId: req.params.id, workerId: interest.workerId, finalAgreed: finalAgreed } });

      sendResponse(res, 200, null, 'Worker accepted!');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  getAcceptedRequests: async (req: AuthRequest, res: Response) => {
    try {
      const accepted = await prisma.customerJobRequest.findMany({
        where: { workerId: req.user!.userId, status: 'ASSIGNED' },
        orderBy: { updatedAt: 'desc' }, take: 50,
      });

      const enriched = await Promise.all(accepted.map(async (r) => {
        const customer = await prisma.customerProfile.findUnique({
          where: { id: r.customerId },
          select: { user: { select: { name: true, phone: true } } },
        });
        return { ...r, customerName: customer?.user?.name || 'Customer', customerPhone: customer?.user?.phone || '' };
      }));

      sendResponse(res, 200, enriched);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  createBookingFromRequest: async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.customerProfile.findUnique({ where: { userId: req.user!.userId } });
      if (!profile) return sendError(res, 404, 'Customer profile not found');

      const request = await prisma.customerJobRequest.findFirst({
        where: { id: req.params.id, customerId: profile.id, status: 'ASSIGNED' },
      });
      if (!request || !request.workerId) return sendError(res, 404, 'Request not found or not assigned');

      // Prefer the address the customer chose when posting the request, else their default
      const address = await resolveServiceAddress(req.user!.userId, request.addressId);
      if (!address) return sendError(res, 400, 'Please add an address first');

      // Agreed amount: negotiated final price if present, else customer budget.
      const agreedAmount = (request as any).finalAgreedAmount ?? request.budget ?? 0;
      const pendingCancellationFee = (await prisma.customerProfile.findUnique({
        where: { userId: req.user!.userId }, select: { pendingCancellationFee: true },
      }))?.pendingCancellationFee || 0;

      // Get worker plan for commission calculation
      const { plan, commissionPercent } = await getWorkerPlan(request.workerId);
      const workerPlanTier = commissionPercent === 5 ? 'ELITE' : commissionPercent === 10 ? 'PRO' : 'FREE';

      // Get customer subscription status for discounts
      const customerSub = await prisma.userSubscription.findUnique({
        where: { userId: req.user!.userId },
        select: { plan: true, status: true, currentPeriodEnd: true },
      }).catch(() => null);

      const subActive = customerSub?.status === 'active' &&
        (!customerSub.currentPeriodEnd || new Date(customerSub.currentPeriodEnd) > new Date());
      const customerPlan = subActive ? customerSub!.plan : 'BASIC';

      // Use PaymentCalculationService to compute all payment amounts
      let calculatedPayment;
      try {
        calculatedPayment = await paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: agreedAmount,
          bookingType: 'STANDARD',
          workerPlanTier: workerPlanTier as 'FREE' | 'PRO' | 'ELITE',
          customerSubscriptionPlan: customerPlan,
          customerSubscriptionActive: subActive,
          pendingCancellationFee,
        });
      } catch (err) {
        logger.error('Payment calculation failed for request booking', { error: err, requestId: request.id, agreedAmount });
        return sendError(res, 500, `Payment calculation failed: ${(err as Error).message}`);
      }

      const appliedCommissionRate = `WORKER_PLAN_${workerPlanTier}`;

      const booking = await prisma.booking.create({
        data: {
          bookingNumber: `BK-${Date.now()}`,
          type: 'STANDARD',
          customerId: req.user!.userId,
          workerId: request.workerId,
          addressId: address.id,
          serviceCategory: request.category,
          serviceName: request.title,
          description: request.description,
          issueId: request.issueId,
          scope: request.scope as any,
          recommendedPrice: request.recommendedPrice || null,
          scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
          estimatedDuration: 2,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          baseAmount: agreedAmount,
          platformFeePercent: calculatedPayment.platformFeePercent,
          platformFee: calculatedPayment.platformFee,
          appliedCommissionRate,
          subscriptionDiscount: calculatedPayment.subscriptionDiscount,
          pendingCancellationFee: calculatedPayment.pendingCancellationFee,
          workerEarnings: calculatedPayment.workerEarnings,
          totalAmount: calculatedPayment.totalAmount,
          calculatedAt: new Date(),
          pricingSnapshot: {
            origin: 'REQUEST',
            requestId: request.id,
            issueId: request.issueId,
            scope: request.scope,
            images: request.images,
            addressId: address.id,
            city: request.city,
            pricingUnit: (request as any).pricingUnit || 'FLAT',
            workerPlan: plan,
            platformFeePercent: calculatedPayment.platformFeePercent,
            platformFee: calculatedPayment.platformFee,
            agreedAmount,
            negotiatedAmount: (request as any).finalAgreedAmount ?? null,
            algorithmVersion: await pricingService.getConfig('PRICING_ALGORITHM_VERSION', 'LOCAL_MARKET_V1'),
            currency: 'INR',
            createdAt: new Date().toISOString(),
          },
        } as any,
      });

      logger.info('Booking created from request with calculated payments', {
        bookingId: booking.id,
        requestId: request.id,
        baseAmount: agreedAmount,
        platformFeePercent: booking.platformFeePercent,
        platformFee: booking.platformFee,
        workerEarnings: booking.workerEarnings,
        totalAmount: booking.totalAmount,
      });

      await prisma.customerJobRequest.update({ where: { id: req.params.id }, data: { status: 'BOOKED' } });
      if (request.images?.length) {
        await linkMediaToScope(request.images, { requestId: request.id, bookingId: booking.id }).catch(() => {});
      }

      emitToUser(request.workerId, 'new_booking', { bookingId: booking.id });
      await notificationService.sendPushNotification(
        request.workerId, 'New Booking!', `You have a new booking: ${request.title}`, 'booking_confirmed',
      );

      sendResponse(res, 201, booking, 'Booking created!');
    } catch (e: any) {
      logger.error('Create booking from request error', { error: e });
      sendError(res, 500, e.message);
    }
  },
};
