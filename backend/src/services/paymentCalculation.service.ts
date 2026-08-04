import { roundINR, roundINRWhole, pct } from '../utils/money';
import { logger } from '../utils/logger';

/**
 * Input parameters for payment calculations
 * Defines all required and optional fields needed to compute payment amounts
 */
export interface PaymentCalculationInput {
  baseAmount: number;
  bookingType: 'STANDARD' | 'URGENT' | 'EMERGENCY';
  workerPlanTier: 'FREE' | 'PRO' | 'ELITE';
  customerSubscriptionPlan: 'BASIC' | 'PLUS' | 'PRO' | null;
  customerSubscriptionActive: boolean;
  urgencyMultiplier?: number; // for URGENT bookings only
  customerBoost?: number; // for URGENT bookings only
  pendingCancellationFee?: number;
  marketReferencePrice?: number;
}

/**
 * Complete calculated payment object returned from all calculation methods
 * Contains all amounts that should be stored in the booking record
 */
export interface CalculatedPayment {
  baseAmount: number;
  platformFeePercent: number; // locked commission percentage
  platformFee: number; // commission amount in rupees
  workerEarnings: number; // what worker receives
  subscriptionDiscount: number; // PLUS 10% or PRO 20% of baseAmount
  pendingCancellationFee: number;
  totalAmount: number; // what customer pays
  customerSaved: number; // vs market reference
  urgencyPremium?: number; // URGENT only
  surgeMultiplier?: number; // URGENT only
  urgencyBreakdown?: {
    // URGENT only, for ledger
    baseEarnings: number;
    urgencyEarnings: number;
    customerBoostAmount: number;
  };
  metadata: {
    calculationMethod: string; // 'STANDARD_CALCULATION' | 'URGENT_CALCULATION' | 'SCOPE_CHANGE_RECALCULATION'
    timestamp: Date;
    version: string; // for audit trail
  };
}

/**
 * Payment Calculation Service
 *
 * Centralizes all payment calculations into a stateless service that accepts inputs
 * and returns complete payment objects. Eliminates scattered hardcoded formulas
 * across controllers and services.
 *
 * All calculations are deterministic, testable, and audit-friendly with complete
 * metadata trails.
 */
class PaymentCalculationService {
  /**
   * Calculate payment amounts for a standard (non-urgent) booking
   *
   * Applies worker plan commission to baseAmount only, respects subscription discounts,
   * and accounts for pending cancellation fees.
   *
   * Requirements: 1.1, 3.1, 3.2, 6.1, 6.2
   *
   * @param input - Payment calculation input
   * @returns Complete calculated payment object
   * @throws Error if inputs are invalid (baseAmount <= 0, invalid plan tier, etc.)
   */
  async calculateStandardBookingPayment(
    input: PaymentCalculationInput,
  ): Promise<CalculatedPayment> {
    // ─── Validation ───────────────────────────────────────
    if (!Number.isFinite(input.baseAmount) || input.baseAmount <= 0) {
      throw new Error(
        `Invalid baseAmount: ${input.baseAmount}. Must be a positive number.`,
      );
    }

    if (
      !['FREE', 'PRO', 'ELITE'].includes(input.workerPlanTier)
    ) {
      throw new Error(
        `Invalid workerPlanTier: ${input.workerPlanTier}. Must be FREE, PRO, or ELITE.`,
      );
    }

    if (
      input.customerSubscriptionPlan &&
      !['BASIC', 'PLUS', 'PRO'].includes(input.customerSubscriptionPlan)
    ) {
      throw new Error(
        `Invalid customerSubscriptionPlan: ${input.customerSubscriptionPlan}. Must be BASIC, PLUS, PRO, or null.`,
      );
    }

    // ─── Commission rate determination ─────────────────────
    // Worker plan commission mapping (frozen at acceptance, never retroactively changed)
    // Req 2: Commission locked on booking acceptance
    const planCommissionMap: Record<string, number> = {
      FREE: 15,
      PRO: 10,
      ELITE: 5,
    };

    const platformFeePercent = planCommissionMap[input.workerPlanTier];

    // ─── Commission calculation ───────────────────────────
    // Req 3.1: Commission applied ONLY to baseAmount (not including surge or boosts)
    const platformFee = roundINRWhole(pct(input.baseAmount, platformFeePercent));

    // ─── Subscription discount ────────────────────────────
    // Req 3.3: Subscription discount deducted from baseAmount before applying commission
    // PLUS gives 10% discount, PRO gives 20% discount
    const subscriptionDiscountPercent = this.getSubscriptionDiscount(
      input.customerSubscriptionPlan,
      input.customerSubscriptionActive,
    );
    const subscriptionDiscount = roundINR(
      pct(input.baseAmount, subscriptionDiscountPercent),
    );

    // ─── Worker earnings ──────────────────────────────────
    // Worker gets baseAmount minus commission
    const workerEarnings = roundINR(input.baseAmount - platformFee);

    // ─── Customer total ───────────────────────────────────
    // Customer pays baseAmount minus subscription discount plus any pending fees
    const pendingFee = input.pendingCancellationFee || 0;
    const totalAmount = roundINR(
      input.baseAmount - subscriptionDiscount + pendingFee,
    );

    // ─── Market reference savings ─────────────────────────
    const marketRef = input.marketReferencePrice || 0;
    const customerSaved =
      marketRef > totalAmount ? roundINR(marketRef - totalAmount) : 0;

    // ─── Build result ─────────────────────────────────────
    const result: CalculatedPayment = {
      baseAmount: input.baseAmount,
      platformFeePercent,
      platformFee,
      workerEarnings,
      subscriptionDiscount,
      pendingCancellationFee: pendingFee,
      totalAmount,
      customerSaved,
      metadata: {
        calculationMethod: 'STANDARD_CALCULATION',
        timestamp: new Date(),
        version: '1.0',
      },
    };

    logger.debug('Standard booking payment calculated', {
      input: {
        baseAmount: input.baseAmount,
        workerPlanTier: input.workerPlanTier,
        subscription: input.customerSubscriptionPlan,
      },
      output: {
        platformFeePercent: result.platformFeePercent,
        platformFee: result.platformFee,
        workerEarnings: result.workerEarnings,
        totalAmount: result.totalAmount,
      },
    });

    return result;
  }

  /**
   * Calculate payment amounts for an urgent booking
   *
   * Urgent bookings have 0% commission on all components. Worker receives the full
   * baseAmount plus urgencyPremium plus any customer boost with no commission deducted.
   *
   * The locked commission percentage is stored as 0 for audit purposes.
   *
   * Requirements: 1.2, 3.2, 8.2, 8.3
   *
   * @param input - Payment calculation input with urgencyMultiplier and optional customerBoost
   * @returns Complete calculated payment object with urgent-specific fields
   * @throws Error if urgencyMultiplier is invalid (< 1 or not a number)
   */
  async calculateUrgentBookingPayment(
    input: PaymentCalculationInput & {
      urgencyMultiplier: number;
      customerBoost?: number;
    },
  ): Promise<CalculatedPayment> {
    // ─── Validation ───────────────────────────────────────
    if (!Number.isFinite(input.baseAmount) || input.baseAmount <= 0) {
      throw new Error(
        `Invalid baseAmount: ${input.baseAmount}. Must be a positive number.`,
      );
    }

    if (
      !Number.isFinite(input.urgencyMultiplier) ||
      input.urgencyMultiplier < 1
    ) {
      throw new Error(
        `Invalid urgencyMultiplier: ${input.urgencyMultiplier}. Must be >= 1.`,
      );
    }

    // ─── Commission ───────────────────────────────────────
    // Req 3.2: URGENT bookings have 0% commission on ALL components
    // Req 8.2: Commission stored as 0 for audit trail
    const platformFeePercent = 0;
    const platformFee = 0;

    // ─── Urgency premium ──────────────────────────────────
    // Calculated as: (baseAmount * multiplier) - baseAmount
    // First multiply baseAmount by multiplier, round it, then subtract original baseAmount
    const urgencyPremium = roundINRWhole(
      roundINRWhole(input.baseAmount * input.urgencyMultiplier) -
        input.baseAmount,
    );

    // ─── Customer boost ───────────────────────────────────
    // Optional incentive to accept urgent work
    const customerBoostAmount = input.customerBoost || 0;

    // ─── Worker earnings ──────────────────────────────────
    // Worker gets full baseAmount + urgencyPremium + boosts (no commission deducted)
    const workerEarnings = roundINR(
      input.baseAmount + urgencyPremium + customerBoostAmount,
    );

    // ─── Total amount ─────────────────────────────────────
    // For urgent, customer pays what was agreed upon
    const totalAmount = workerEarnings;

    // ─── Build result ─────────────────────────────────────
    const result: CalculatedPayment = {
      baseAmount: input.baseAmount,
      platformFeePercent,
      platformFee,
      workerEarnings,
      subscriptionDiscount: 0, // no subscription discounts on urgent
      pendingCancellationFee: 0,
      totalAmount,
      customerSaved: 0,
      urgencyPremium,
      surgeMultiplier: input.urgencyMultiplier,
      urgencyBreakdown: {
        baseEarnings: input.baseAmount,
        urgencyEarnings: urgencyPremium,
        customerBoostAmount,
      },
      metadata: {
        calculationMethod: 'URGENT_CALCULATION',
        timestamp: new Date(),
        version: '1.0',
      },
    };

    logger.debug('Urgent booking payment calculated', {
      input: {
        baseAmount: input.baseAmount,
        urgencyMultiplier: input.urgencyMultiplier,
        customerBoost: customerBoostAmount,
      },
      output: {
        platformFeePercent: result.platformFeePercent,
        platformFee: result.platformFee,
        workerEarnings: result.workerEarnings,
        totalAmount: result.totalAmount,
      },
    });

    return result;
  }

  /**
   * Recalculate payment amounts when a scope change is approved.
   *
   * Preserves the LOCKED commission percentage from the original booking and
   * recomputes worker earnings and total amount against the new base amount.
   *
   * @param currentBooking - The current booking with locked values
   * @param newBaseAmount - The new baseAmount after scope change
   * @returns Complete recalculated payment object
   * @throws Error if newBaseAmount <= 0 (would result in invalid booking)
   */
  async recalculateAfterScopeChange(
    currentBooking: {
      baseAmount: number;
      platformFeePercent: number; // LOCKED, never changes
      workerEarnings: number;
      totalAmount: number;
    },
    newBaseAmount: number,
  ): Promise<CalculatedPayment> {
    // ─── Validation ───────────────────────────────────────
    // Sub-₹1 amounts (e.g. ₹0.01) are rejected: the recalculation rounds to
    // whole rupees, so paise-level base amounts produce a ₹0 platform fee and a
    // nonsensical total. ₹1 is the minimum meaningful scope-change price.
    if (!Number.isFinite(newBaseAmount) || newBaseAmount < 1) {
      throw new Error(
        `Invalid newBaseAmount: ${newBaseAmount}. Must be at least ₹1.`,
      );
    }

    // ─── Preserve locked commission ────────────────────────
    // Req 2.3: Use locked platformFeePercent from booking record
    // Req 7.1: Never apply retroactively changed commission to scope changes
    const lockedCommissionPercent = currentBooking.platformFeePercent;

    // ─── Recalculate with new baseAmount ──────────────────
    // Apply locked commission to new baseAmount
    const newPlatformFee = roundINRWhole(
      pct(newBaseAmount, lockedCommissionPercent),
    );
    const newWorkerEarnings = roundINR(newBaseAmount - newPlatformFee);

    // ─── Reject invalid scope changes ─────────────────────
    // Req 7.3: Reject scope change if would result in zero or negative total
    if (newBaseAmount <= 0) {
      throw new Error(
        'Scope change would result in invalid booking amount',
      );
    }

    // ─── Build result ─────────────────────────────────────
    const result: CalculatedPayment = {
      baseAmount: newBaseAmount,
      platformFeePercent: lockedCommissionPercent,
      platformFee: newPlatformFee,
      workerEarnings: newWorkerEarnings,
      subscriptionDiscount: 0,
      pendingCancellationFee: 0,
      totalAmount: newBaseAmount,
      customerSaved: 0,
      metadata: {
        calculationMethod: 'SCOPE_CHANGE_RECALCULATION',
        timestamp: new Date(),
        version: '1.0',
      },
    };

    logger.debug('Scope change recalculation performed', {
      input: {
        oldBaseAmount: currentBooking.baseAmount,
        newBaseAmount: newBaseAmount,
        lockedCommissionPercent,
      },
      output: {
        platformFeePercent: result.platformFeePercent,
        platformFee: result.platformFee,
        workerEarnings: result.workerEarnings,
        totalAmount: result.totalAmount,
      },
    });

    return result;
  }

  /**
   * Get the subscription discount percentage for a customer plan.
   *
   * @param plan - The subscription plan (BASIC, PLUS, PRO, or null)
   * @param isActive - Whether the subscription is active
   * @returns Discount percentage (0, 10, or 20)
   */
  private getSubscriptionDiscount(
    plan: string | null,
    isActive: boolean,
  ): number {
    if (!isActive || !plan) return 0;
    if (plan === 'PRO') return 20;
    if (plan === 'PLUS') return 10;
    return 0;
  }
}

// ─── Export singleton instance ────────────────────────────────────
export const paymentCalculationService = new PaymentCalculationService();
