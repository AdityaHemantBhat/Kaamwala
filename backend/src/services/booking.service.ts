import { prisma } from '../config/prisma';
import { BookingStatus, PaymentStatus, TransactionType, Prisma } from '@prisma/client';
import { resolveServiceAddress } from './address.service';
import { emitToUser, emitToAdmins } from './socket.service';
import { notificationService } from './notification.service';
import { env, devBackdoorsEnabled } from '../config/env';
import { logger } from '../utils/logger';
import { roundINR, roundINRWhole } from '../utils/money';
import { pricingService } from './pricing.service';
import { assessBookingRisk } from './risk.service';
import { getWorkerPlan } from './workerPlans.service';
import { referralService } from './referral.service';
import { applyWarranty } from './guarantee.service';
import { recordWorkerStreak } from '../utils/activity';
import { paymentCalculationService } from './paymentCalculation.service';


export const bookingService = {
  async createBooking(customerId: string, data: any, skipNotification = false) {
    const bookingNumber = "KW" + Math.floor(100000 + Math.random() * 900000);
    const baseAmount = data.baseAmount || 300;
    const pricingUnit = data.pricingUnit || 'FLAT';

    // Platform minimum-floor validation — backend authoritative, never trust client price.
    // Market-derived per the booking's city; see pricingService.getMinimumFloor.
    const floorOk = await pricingService.validateMinimumFloor(data.serviceCategory || 'PLUMBER', baseAmount, pricingUnit, data.city);
    if (!floorOk) {
      throw new Error('Price is below the platform minimum for this service');
    }

    // OPTIMIZATION: All independent lookups run concurrently in parallel (instead of sequential round-trips)
    // This reduces latency from ~5+ sequential DB calls to 2-3 parallel batches.
    // Each Promise wraps a single focused query with explicit error handling.
    const [planResult, customerProfile, addressId, worker, customerSub] = await Promise.all([
      // Worker plan commission (FREE 15% / PRO 10% / ELITE 5%) — single source of truth.
      // Urgent commission is applied separately on the frozen base.
      data.type === 'URGENT'
        ? Promise.resolve({ commissionPercent: 0 })
        : getWorkerPlan(data.workerId),
      // Pending cancellation fee. A transient read failure must not silently
      // zero the fee the customer owes — log it.
      prisma.customerProfile
        .findUnique({ where: { userId: customerId }, select: { pendingCancellationFee: true } })
        .catch((e) => { logger.warn('Failed to read pending cancellation fee:', e); return null; }),
      // Service location is authoritative — resolve the customer's chosen
      // address (validated) or their default, exactly like the urgent flow.
      // Never fabricate an address.
      resolveServiceAddress(customerId, data.addressId).then((a) => a?.id),
      // Check if worker is frozen (wallet in negative due to penalties)
      // OPTIMIZATION: Only fetch needed columns (isFrozen, walletBalance) to reduce payload
      data.workerId
        ? prisma.workerProfile.findUnique({
            where: { userId: data.workerId },
            select: { isFrozen: true, walletBalance: true },
          })
        : Promise.resolve(null),
      // Customer subscription plan — drives the PLUS/PRO booking discount.
      // OPTIMIZATION: Only fetch needed columns (plan, status, currentPeriodEnd)
      prisma.userSubscription
        .findUnique({ where: { userId: customerId }, select: { plan: true, status: true, currentPeriodEnd: true } })
        .catch(() => null),
    ]);

    if (!addressId) {
      throw new Error('Please add an address first');
    }

    if (worker?.isFrozen || (worker?.walletBalance || 0) < 0) {
      throw new Error('This worker account is frozen due to unpaid penalties. They cannot accept new bookings.');
    }

    // Ensure workerId exists
    let workerId = data.workerId;
    if (!workerId) {
      throw new Error('workerId is required to create a booking');
    }

    // Determine customer subscription status
    const subActive = customerSub?.status === 'active' &&
      (!customerSub.currentPeriodEnd || new Date(customerSub.currentPeriodEnd) > new Date());
    const customerPlan = subActive ? customerSub!.plan : 'BASIC';
    const pendingCancellationFee = customerProfile?.pendingCancellationFee || 0;

    // Worker plan tier determination for commission
    const workerPlanTier = data.type === 'URGENT' ? 'FREE' : planResult.commissionPercent === 5 ? 'ELITE' : planResult.commissionPercent === 10 ? 'PRO' : 'FREE';
    
    // Use PaymentCalculationService to compute all payment amounts
    // This is the single source of truth for payment calculations
    let calculatedPayment;
    try {
      if (data.type === 'URGENT') {
        // URGENT bookings use special calculation with 0% commission
        calculatedPayment = await paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE', // Doesn't matter for urgent, but required by interface
          customerSubscriptionPlan: customerPlan,
          customerSubscriptionActive: subActive,
          urgencyMultiplier: data.urgencyMultiplier || 1.5,
          customerBoost: data.customerBoost || 0,
          pendingCancellationFee,
        });
      } else {
        // STANDARD and EMERGENCY bookings use standard calculation
        calculatedPayment = await paymentCalculationService.calculateStandardBookingPayment({
          baseAmount,
          bookingType: data.type === 'EMERGENCY' ? 'EMERGENCY' : 'STANDARD',
          workerPlanTier: workerPlanTier as 'FREE' | 'PRO' | 'ELITE',
          customerSubscriptionPlan: customerPlan,
          customerSubscriptionActive: subActive,
          pendingCancellationFee,
          marketReferencePrice: data.recommendedPrice || 0,
        });
      }
    } catch (err) {
      logger.error('Payment calculation failed', { error: err, baseAmount, workerPlanTier });
      throw new Error(`Failed to calculate payment: ${(err as Error).message}`);
    }

    // Verify all required payment fields are populated
    if (!Number.isFinite(calculatedPayment.platformFee) ||
        !Number.isFinite(calculatedPayment.workerEarnings) ||
        !Number.isFinite(calculatedPayment.totalAmount)) {
      throw new Error('Payment calculation resulted in invalid amounts');
    }

    const marketReference = Number(data.recommendedPrice) || 0;
    // Customer savings = what the customer genuinely did not pay on this booking:
    //   1. subscriptionDiscount — PLUS/PRO loyalty discount deducted from the base
    //   2. marketSavings — how much the booked base sits below the market reference
    // Market savings are measured against baseAmount (not totalAmount) so the
    // subscription discount above is never double-counted.
    const subscriptionDiscount = calculatedPayment.subscriptionDiscount || 0;
    const marketSavings = marketReference > 0
      ? Math.max(0, roundINR(marketReference - baseAmount))
      : 0;
    const customerSaved = roundINR(subscriptionDiscount + marketSavings);

    // Determine appliedCommissionRate label for audit
    let appliedCommissionRate = '';
    if (data.type === 'URGENT') {
      appliedCommissionRate = 'URGENT_ZERO';
    } else {
      appliedCommissionRate = `WORKER_PLAN_${workerPlanTier}`;
    }

    // Atomic: create the booking with all calculated payment fields
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          bookingNumber,
          type: data.type || 'STANDARD',
          customerId,
          workerId,
          addressId,
          serviceCategory: data.serviceCategory || 'PLUMBER',
          serviceName: data.serviceName || 'General Service',
          description: data.description || 'Service Job Request',
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : new Date(),
          estimatedDuration: data.estimatedDuration || 60,
          status: BookingStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          baseAmount,
          platformFeePercent: calculatedPayment.platformFeePercent,
          platformFee: calculatedPayment.platformFee,
          workerEarnings: calculatedPayment.workerEarnings,
          appliedCommissionRate,
          subscriptionDiscount: calculatedPayment.subscriptionDiscount,
          pendingCancellationFee: calculatedPayment.pendingCancellationFee,
          urgencyPremiumAmount: calculatedPayment.urgencyPremium || 0,
          urgencySurgeMultiplier: calculatedPayment.surgeMultiplier,
          urgencyBreakdown: calculatedPayment.urgencyBreakdown ? JSON.parse(JSON.stringify(calculatedPayment.urgencyBreakdown)) : null,
          totalAmount: calculatedPayment.totalAmount,
          calculatedAt: calculatedPayment.metadata.timestamp,
          marketRate: marketReference > 0 ? marketReference : null,
          customerSaved,
          warrantyEligible: data.warrantyEligible ?? true,
        },
      });

      if (customerSaved > 0) {
        await tx.customerProfile.update({
          where: { userId: customerId },
          data: { totalSaved: { increment: customerSaved } },
        });
      }

      return created;
    });

    logger.info('Booking created with calculated payments', {
      bookingId: booking.id,
      baseAmount,
      platformFeePercent: booking.platformFeePercent,
      platformFee: booking.platformFee,
      workerEarnings: booking.workerEarnings,
      totalAmount: booking.totalAmount,
      type: booking.type,
    });

    if (workerId && workerId !== customerId && !skipNotification) {
      emitToUser(workerId, 'new_booking_request', booking);
      await notificationService.sendPushNotification(workerId, 'New Job Request', `You have a new request for ${data.serviceName || 'Service'}`, 'booking_update', { bookingId: booking.id });
    }
    
    emitToAdmins('admin_refresh', { type: 'booking' });
    
    return booking;
  },

  // Legal state transitions — backend authoritative, no invalid transitions
  ALLOWED_TRANSITIONS: {
    PENDING:     ['ACCEPTED', 'NEGOTIATING', 'CANCELLED', 'DISPUTED'],
    NEGOTIATING: ['ACCEPTED', 'CANCELLED', 'DISPUTED', 'PENDING'],
    ACCEPTED:    ['ON_THE_WAY', 'IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
    ON_THE_WAY:  ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'DISPUTED'],
    COMPLETED:   [], // terminal
    CANCELLED:   [], // terminal
    DISPUTED:    [], // terminal
  } as Record<string, string[]>,

  async updateStatus(bookingId: string, status: BookingStatus, actorId: string, actorRole: string, otp?: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');

    // ── Authorization (IDOR fix) ─────────────────────────────────────────────
    // Only the booking's customer or ASSIGNED worker may change its status.
    // A PENDING booking may be accepted by any worker (self-assignment) — that
    // is the marketplace matching model — every other transition needs a
    // participant. Enforced server-side; the client is never trusted.
    const isCustomer = booking.customerId === actorId;
    const isAssignedWorker = booking.workerId === actorId;

    if (!isCustomer && !isAssignedWorker) {
      throw new Error('Access denied');
    }

    if (status === BookingStatus.ACCEPTED) {
      // Only workers accept; from any state other than PENDING, only the
      // already-assigned worker may (re)accept.
      if (actorRole !== 'WORKER') throw new Error('Only workers can accept bookings');
      if (booking.status !== BookingStatus.PENDING && !isAssignedWorker) throw new Error('Access denied');
    } else if (status === BookingStatus.ON_THE_WAY || status === BookingStatus.IN_PROGRESS) {
      // On-the-way / start (arrival OTP) is driven exclusively by the assigned
      // worker. A customer can never start the job for them.
      if (!isAssignedWorker || actorRole !== 'WORKER') throw new Error('Access denied');
    }
    // COMPLETED / CANCELLED / DISPUTED / NEGOTIATING / PENDING fall through to
    // the participant check above (customer or assigned worker).

    // Enforce legal transitions — e.g. COMPLETED → SEARCHING must never happen
    const allowed = bookingService.ALLOWED_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid status transition: ${booking.status} → ${status}`);
    }

    const updateData: any = { status, updatedAt: new Date() };

    switch (status) {
      case BookingStatus.ACCEPTED:
        updateData.acceptedAt = new Date();
        // Generate arrival OTP immediately so the customer can see the
        // QR code as soon as the worker accepts — not only when the
        // worker clicks "On My Way".
        updateData.arrivalOtp = Math.floor(1000 + Math.random() * 9000).toString();
        // Worker accepting a job counts as an active day for the streak.
        await recordWorkerStreak(booking.workerId);
        break;
      case BookingStatus.ON_THE_WAY:
        updateData.onTheWayAt = new Date();
        updateData.travelProtectionEligibleAt = new Date();
        // Arrival OTP already generated on ACCEPTED; regenerate only if
        // somehow missing (backward-compat safety net).
        if (!updateData.arrivalOtp) {
          updateData.arrivalOtp = Math.floor(1000 + Math.random() * 9000).toString();
        }
        // Clear old location so customer waits for fresh live tracking
        updateData.workerLat = null;
        updateData.workerLng = null;
        updateData.workerEta = null;
        break;
      case BookingStatus.IN_PROGRESS:
        // Dev-only backdoor so local testing works without the SMS'd OTP.
        // Only active when ENABLE_DEV_BACKDOORS=true is explicitly set.
        const devOtpBackdoor = devBackdoorsEnabled && otp === '1234';
        if (booking.arrivalOtp !== otp && !devOtpBackdoor) {
          throw new Error('Invalid arrival OTP');
        }
        updateData.startedAt = new Date();
        break;
      case BookingStatus.COMPLETED:
        updateData.completedAt = new Date();
        // Completing a job counts as an active day for the streak.
        await recordWorkerStreak(booking.workerId);
        break;
      case BookingStatus.CANCELLED:
        // NOTE: the route layer intercepts CANCELLED and routes it through
        // cancellationService.initiateCancellation (the single canonical cancel
        // path that owns fees/refunds/compensation and the worker-health
        // ladder). If this branch is ever reached directly it must NOT apply
        // its own penalties — that would double-penalize a worker who already
        // went through the cancellation service.
        updateData.cancelledAt = new Date();
        updateData.cancelledBy = actorRole;
        break;
      case BookingStatus.DISPUTED:
        break;
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData
    });

    // 3-month warranty window (admin-configurable) starts at completion.
    if (status === BookingStatus.COMPLETED) {
      await applyWarranty(bookingId, updatedBooking.completedAt || new Date());

      // "Monthly AC checkup" — PRO customers get a recurring maintenance plan
      // after an AC / electrical job is completed.
      if (booking.serviceCategory === 'AC_TECHNICIAN' || booking.serviceCategory === 'ELECTRICIAN') {
        const customerSub = await prisma.userSubscription
          .findUnique({ where: { userId: booking.customerId }, select: { plan: true, status: true } })
          .catch(() => null);
        const isPro = customerSub?.status === 'active' && customerSub.plan === 'PRO';
        if (isPro) {
          const nextServiceAt = new Date();
          nextServiceAt.setMonth(nextServiceAt.getMonth() + 1);
          const existing = await prisma.maintenancePlan.findFirst({
            where: { customerId: booking.customerId, serviceCategory: booking.serviceCategory },
          });
          let planId: string | null = null;
          if (existing) {
            await prisma.maintenancePlan.update({
              where: { id: existing.id },
              data: { workerId: booking.workerId, nextServiceAt, isActive: true },
            });
            planId = existing.id;
          } else {
            const plan = await prisma.maintenancePlan.create({
              data: {
                customerId: booking.customerId,
                workerId: booking.workerId,
                serviceCategory: booking.serviceCategory,
                serviceName: booking.serviceName,
                frequencyMonths: 1,
                nextServiceAt,
              },
            });
            planId = plan.id;
          }
          // Link the completed booking to the maintenance plan it spawned so the
          // FK is never silently null.
          if (planId) {
            await prisma.booking.update({ where: { id: bookingId }, data: { maintenancePlanId: planId } });
          }
        }
      }
    }

    if (status === BookingStatus.COMPLETED && updatedBooking.paymentStatus === PaymentStatus.PAID) {
       await this.processPayout(updatedBooking.id);
       // Referral bonuses (referred ₹50 + referrer ₹75) pay once, on the referred
       // customer's first completed booking. No-op when there is no pending event.
       await referralService.creditReferralBonuses(booking.customerId);
       // Record legitimate completed-service market evidence (normal bookings only).
       // Uses the agreed service amount — never urgent premium/boost components.
       if (booking.type !== 'URGENT') {
         const agreedAmount = booking.negotiatedAmount || booking.baseAmount;
         // Fraud/data-poisoning risk assessment — suspicious observations downweighted
         const risk = await assessBookingRisk({
           customerId: booking.customerId,
           workerId: booking.workerId,
           amount: agreedAmount,
           category: booking.serviceCategory,
           bookingId: booking.id,
         });
         // Recommendation-exposure flag — if customer accepted the platform's
         // recommended price, this is not fully independent market evidence.
         const recommendedPrice = (booking as any).recommendedPrice;
         const recommendationExposed = recommendedPrice != null
           && Math.abs(agreedAmount - recommendedPrice) <= Math.max(1, recommendedPrice * 0.02);
         // A/B experiment exposure — stamp which recommendation variant was shown
         const experimentVersion = recommendationExposed
           ? await pricingService.getConfig('PRICE_REC_AB_VERSION', '')
           : undefined;

         await pricingService.recordObservation({
           category: booking.serviceCategory,
           issueId: (booking as any).issueId || null,
           scope: (booking as any).scope || null,
           pricingUnit: (booking as any).pricingUnit || 'FLAT',
           zone: (booking.addressId ? await prisma.address.findUnique({ where: { id: booking.addressId }, select: { city: true } }).then(a => a?.city) : null) as string | null,
           unitRate: agreedAmount,
           totalAmount: agreedAmount,
           origin: 'COMPLETED_SERVICE',
           customerId: booking.customerId,
           workerId: booking.workerId,
           bookingId: booking.id,
           recommendationExposed,
           experimentVersion,
           riskScore: risk.score,
         });
       }
    }

    // Notifications — emit to each participant's personal room exactly once.
    // (A participant is always in `user_<id>`; broadcasting to `booking_<id>`
    // too would re-deliver to anyone who joined the booking room.)
    const otherUserId = actorRole === 'CUSTOMER' ? booking.workerId : booking.customerId;
    emitToUser(otherUserId, 'booking_status_update', updatedBooking);
    
    const readableStatus: Record<string, string> = {
      PENDING: 'Pending',
      NEGOTIATING: 'Negotiating',
      ACCEPTED: 'Accepted',
      ON_THE_WAY: 'On the way',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      DISPUTED: 'Disputed'
    };
    const friendlyStatus = readableStatus[status] || status;

    await notificationService.sendPushNotification(
      otherUserId, 
      'Booking Update', 
      `Booking #${booking.bookingNumber} is now ${friendlyStatus}`, 
      'booking_update', 
      { bookingId }
    );

    if (status === BookingStatus.COMPLETED) {
      await notificationService.sendPushNotification(
        booking.customerId,
        'Job Complete',
        'Please rate your experience',
        'promotional',
        { bookingId }
      );
      
      await prisma.customerProfile.update({
        where: { userId: booking.customerId },
        data: { loyaltyPoints: { increment: 10 } }
      });
    }

    emitToAdmins('admin_refresh', { type: 'booking_update' });

    return updatedBooking;
  },

  async processPayout(bookingId: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      logger.warn('Payout requested for non-existent booking', { bookingId });
      return;
    }

    // Wrap in Prisma transaction with Serializable isolation for atomicity and idempotency
    // Requirements: 4.1, 4.2, 4.3, 5.1, 5.3, 5.4
    await prisma.$transaction(
      async (tx) => {
        // IDEMPOTENCY CHECK: Query ledger as source of truth
        // Req 5.1, 5.3: Check for existing WALLET_CREDIT entry to prevent double-pay
        const existingPayout = await tx.transaction.findFirst({
          where: {
            bookingId: bookingId,
            type: TransactionType.WALLET_CREDIT,
          },
        });

        if (existingPayout) {
          // Already paid out, idempotent no-op
          logger.info('Payout already processed (idempotent no-op)', {
            bookingId,
            existingPayoutId: existingPayout.id,
          });
          return;
        }

        // Fetch current wallet balance
        const workerBefore = await tx.workerProfile.findUnique({
          where: { userId: booking.workerId },
          select: { walletBalance: true },
        });

        const walletBefore = workerBefore?.walletBalance ?? 0;
        const walletAfter = walletBefore + booking.workerEarnings;

        // ATOMIC: Update wallet with explicit set (not increment) to prevent race conditions
        // Req 4.1, 4.2: Update wallet balance
        await tx.workerProfile.update({
          where: { userId: booking.workerId },
          data: {
            walletBalance: walletAfter, // explicit set, not increment
            totalEarned: { increment: booking.workerEarnings },
            completedJobs: { increment: 1 },
          },
        });

        // ATOMIC: Create earnings ledger entry
        // Req 4.1, 4.3: Create transaction record with calculation details
        await tx.transaction.create({
          data: {
            userId: booking.workerId,
            bookingId: bookingId,
            type: TransactionType.WALLET_CREDIT,
            amount: booking.workerEarnings,
            description: `Earnings for booking #${booking.bookingNumber}`,
            idempotencyKey: `earnings:${bookingId}`,
            balanceBefore: walletBefore,
            balanceAfter: walletAfter,
            // Store calculation details for audit trail
            calculationDetails: {
              baseAmount: booking.baseAmount,
              platformFeePercent: booking.platformFeePercent,
              platformFee: booking.platformFee,
              workerEarnings: booking.workerEarnings,
              totalAmount: booking.totalAmount,
              appliedCommissionRate: booking.appliedCommissionRate || 'UNKNOWN',
            },
          },
        });

        // ATOMIC: Create commission ledger entry for audit
        // Req 4.3: Show commission separately from worker earnings
        if (booking.platformFee > 0) {
          await tx.transaction.create({
            data: {
              userId: booking.workerId,
              bookingId: bookingId,
              type: TransactionType.PLATFORM_COMMISSION,
              amount: -booking.platformFee,
              description: `Platform commission (${booking.platformFeePercent}%) for booking #${booking.bookingNumber}`,
              idempotencyKey: `commission:${bookingId}`,
              calculationDetails: {
                baseAmount: booking.baseAmount,
                platformFeePercent: booking.platformFeePercent,
                commissionAmount: booking.platformFee,
              },
            },
          }).catch((err) => {
            logger.warn('Failed to create commission ledger entry', { bookingId, error: err });
            // Don't fail the entire transaction if commission ledger fails
          });
        }

        logger.info('Payout completed', {
          bookingId,
          workerEarnings: booking.workerEarnings,
          platformFee: booking.platformFee,
          walletBefore,
          walletAfter,
        });
      },
      {
        // Use Serializable isolation level for financial operations
        // Prevents phantom reads and ensures atomicity
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
};
