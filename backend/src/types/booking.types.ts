import {
  Booking as PrismaBooking,
  BookingStatus,
  BookingType,
  PaymentStatus,
  ServiceCategory,
} from '@prisma/client';
import { PaymentCalculationInput, CalculatedPayment } from '../services/paymentCalculation.service';

/**
 * Extended Booking interface with detailed JSDoc comments for payment calculation fields
 *
 * This interface extends the Prisma-generated Booking type to add detailed documentation
 * for all payment-related fields. The Prisma schema is the source of truth for the actual
 * database structure, but this TypeScript interface provides comprehensive documentation
 * for developers working with booking payment logic.
 *
 * Payment fields are locked at booking acceptance and represent the agreed-upon terms
 * between customer and worker. They are never retroactively changed except during
 * scope changes where the locked platformFeePercent is preserved.
 */
export interface BookingWithPaymentFields extends PrismaBooking {
  // ─── PAYMENT CALCULATION FIELDS ───────────────────────────────────────────
  // These fields MUST be non-null and are populated at booking creation.
  // They are LOCKED at acceptance and serve as the audit trail for financial reconciliation.

  /**
   * Platform commission percentage applied to this booking (locked at acceptance).
   *
   * Represents the commission rate that applies only to the baseAmount:
   * - FREE plan workers: 15%
   * - PRO plan workers: 10%
   * - ELITE plan workers: 5%
   * - URGENT bookings: 0%
   *
   * This value is frozen at booking acceptance and is NEVER retroactively changed,
   * even if the worker upgrades their plan later. This ensures consistent and fair
   * pricing for both customer and worker.
   *
   * Requirements: 2.1, 2.2, 2.4
   *
   * @type {number}
   * @example 15 (for FREE plan), 10 (for PRO plan), 0 (for URGENT)
   * @locked After booking acceptance, this field cannot be modified
   * @populated Always set at booking creation
   */
  platformFeePercent: number;

  /**
   * Platform commission amount in rupees (locked at acceptance).
   *
   * Calculated as: platformFee = (baseAmount * platformFeePercent) / 100, rounded to whole rupees.
   *
   * This is the absolute rupee amount the platform receives from this booking.
   * For audit purposes, this field preserves the exact commission amount at the time
   * of booking, enabling financial reconciliation and dispute resolution.
   *
   * Important: Commission is applied ONLY to baseAmount, NOT to subscription discounts,
   * urgency premiums, or customer boosts. This ensures predictable and auditable fee
   * calculation across all booking types.
   *
   * Requirements: 3.1, 3.2, 3.3
   *
   * @type {number}
   * @example 45 (15% of 300 rupees baseAmount)
   * @locked After booking acceptance, this field cannot be modified
   * @formula baseAmount * (platformFeePercent / 100)
   * @populated Always set at booking creation
   */
  platformFee: number;

  /**
   * Worker earnings for this booking (locked at acceptance).
   *
   * The amount the worker is guaranteed to receive: workerEarnings = baseAmount - platformFee.
   *
   * For STANDARD bookings: This is the baseAmount minus platform commission.
   * For URGENT bookings: This is baseAmount + urgencyPremium + customerBoost (no commission deducted).
   *
   * This field represents the worker's guaranteed payout and is locked at booking acceptance.
   * It serves as the source of truth for wallet credit amount when the booking is completed.
   *
   * Requirements: 3.1, 6.1, 6.2
   *
   * @type {number}
   * @example 255 (300 - 45 for standard booking with 15% commission)
   * @locked After booking acceptance, this field cannot be modified
   * @formula (STANDARD) baseAmount - platformFee, (URGENT) baseAmount + urgencyPremium + customerBoost
   * @populated Always set at booking creation
   * @used When processing payout to worker wallet
   */
  workerEarnings: number;

  /**
   * Applied commission rate label for audit purposes (locked at acceptance).
   *
   * Documents which tier or rule was used to calculate the platformFeePercent.
   * This field is immutable and serves as the audit trail explaining the commission logic.
   *
   * Possible values:
   * - "WORKER_PLAN_FREE": Worker on FREE plan (15% commission)
   * - "WORKER_PLAN_PRO": Worker on PRO plan (10% commission)
   * - "WORKER_PLAN_ELITE": Worker on ELITE plan (5% commission)
   * - "URGENT_ZERO": Urgent booking (0% commission)
   *
   * This field is critical for historical audit trails and for recovering the original
   * commission logic if worker plan tiers change in the future.
   *
   * Requirements: 2.1, 2.2
   *
   * @type {string | null}
   * @example "WORKER_PLAN_FREE", "URGENT_ZERO"
   * @locked After booking acceptance, this field cannot be modified
   * @populated Always set at booking creation
   * @used For audit trails and dispute resolution
   */
  appliedCommissionRate: string | null;

  /**
   * Subscription discount amount in rupees (from customer's PLUS or PRO plan).
   *
   * Discount applied only for STANDARD and EMERGENCY bookings when the customer has
   * an active subscription:
   * - PLUS plan: 10% discount on baseAmount
   * - PRO plan: 20% discount on baseAmount
   *
   * This discount is deducted from what the customer pays but does NOT affect worker
   * earnings. The worker always receives the full baseAmount minus commission, regardless
   * of customer subscription discounts.
   *
   * Non-zero only for STANDARD/EMERGENCY bookings when customer has active subscription.
   * URGENT bookings do not offer subscription discounts.
   *
   * Requirements: 3.3
   *
   * @type {number}
   * @default 0
   * @example 30 (10% of 300 rupees baseAmount for PLUS subscriber)
   * @populated At booking creation for STANDARD/EMERGENCY with active subscription
   * @used To calculate what customer pays: totalAmount = baseAmount - subscriptionDiscount + pendingCancellationFee
   */
  subscriptionDiscount: number;

  /**
   * Pending cancellation fee charged to customer from previous booking cancellation.
   *
   * When a customer cancels a booking, they may incur a cancellation fee. If they don't
   * pay it immediately, the fee becomes a debt that is carried forward and charged on
   * their next booking.
   *
   * This field stores any pending cancellation fee debt from prior bookings that is
   * being collected with this booking's payment.
   *
   * Non-zero only when customer has outstanding cancellation fee debt from prior bookings.
   *
   * Requirements: 1.1
   *
   * @type {number}
   * @default 0
   * @example 50 (cancellation fee from previous booking)
   * @populated Only when customer has pending fee debt
   * @used To calculate what customer pays: totalAmount = baseAmount - subscriptionDiscount + pendingCancellationFee
   */
  pendingCancellationFee: number;

  /**
   * Premium amount for urgency on URGENT bookings (locked at acceptance).
   *
   * For URGENT bookings only, this is the premium amount charged for expedited service.
   * Calculated as: urgencyPremium = (baseAmount * urgencySurgeMultiplier) - baseAmount
   *
   * For example, if baseAmount is 300 and urgencySurgeMultiplier is 2.0:
   * urgencyPremium = (300 * 2.0) - 300 = 300 rupees
   *
   * This premium accrues entirely to the worker (no commission deducted from urgent premiums).
   * STANDARD and EMERGENCY bookings always have null urgencyPremiumAmount.
   *
   * Requirements: 8.2, 8.3
   *
   * @type {number | null}
   * @default null
   * @example 300 (300 + 300premium = 600 customer pays, worker gets 600 with 0% commission)
   * @locked After booking acceptance, this field cannot be modified
   * @populated Only for URGENT bookings
   * @used For worker earnings: workerEarnings = baseAmount + urgencyPremium + customerBoost
   */
  urgencyPremiumAmount: number | null;

  /**
   * Surge multiplier for URGENT bookings (locked at acceptance).
   *
   * For URGENT bookings only, this is the factor by which baseAmount is multiplied to
   * determine total cost. Values typically range from 1.5x to 3x depending on demand.
   *
   * Examples:
   * - 1.5: 50% premium over baseAmount
   * - 2.0: 100% premium over baseAmount (customer pays 2x base)
   * - 2.5: 150% premium over baseAmount
   *
   * This multiplier is locked at booking acceptance and represents the agreed-upon surge
   * pricing at the time of booking.
   *
   * STANDARD and EMERGENCY bookings always have null urgencySurgeMultiplier.
   *
   * Requirements: 8.2
   *
   * @type {number | null}
   * @default null
   * @example 2.0 (customer pays 2x of baseAmount)
   * @locked After booking acceptance, this field cannot be modified
   * @populated Only for URGENT bookings
   * @used To calculate urgencyPremium: urgencyPremium = (baseAmount * multiplier) - baseAmount
   */
  urgencySurgeMultiplier: number | null;

  /**
   * Breakdown of worker earnings for URGENT bookings (for ledger audit trail).
   *
   * JSON object with the following structure (URGENT bookings only):
   * ```json
   * {
   *   "baseEarnings": 300,       // Original baseAmount
   *   "urgencyEarnings": 300,    // Urgency premium (surge)
   *   "customerBoostAmount": 50  // Additional customer incentive (if any)
   * }
   * ```
   *
   * Sum of these fields = workerEarnings (for URGENT: no commission deducted)
   *
   * This breakdown is stored for detailed ledger audit trails and dispute resolution.
   * It clearly documents the composition of worker earnings for urgent requests.
   *
   * STANDARD and EMERGENCY bookings have null urgencyBreakdown.
   *
   * Requirements: 8.2, 8.4
   *
   * @type {Json | null}
   * @default null
   * @example { "baseEarnings": 300, "urgencyEarnings": 300, "customerBoostAmount": 50 }
   * @populated Only for URGENT bookings
   * @used For detailed ledger entries and financial reporting
   */
  urgencyBreakdown: any | null; // Json type from Prisma

  /**
   * Base amount for the booking service (locked at acceptance).
   *
   * The core service cost before any premiums, discounts, or fees are applied.
   * This is the amount on which platform commission is calculated.
   *
   * All calculations are based on baseAmount:
   * - Platform commission = baseAmount * (platformFeePercent / 100)
   * - Subscription discount = baseAmount * (discountPercent / 100)
   * - For URGENT: Total = baseAmount + urgencyPremium + customerBoost
   *
   * This field is locked at booking creation and serves as the foundation for all
   * financial calculations throughout the booking lifecycle.
   *
   * Requirements: 1.1, 3.1, 6.1, 6.2
   *
   * @type {number}
   * @example 300 (base service cost in rupees)
   * @locked After booking acceptance, this field can only change during scope changes
   * @populated Always set at booking creation
   * @used As the base for all commission and discount calculations
   */
  baseAmount: number;

  /**
   * Total amount the customer pays for this booking.
   *
   * Calculated as: totalAmount = baseAmount - subscriptionDiscount + pendingCancellationFee
   *
   * For STANDARD bookings:
   * - Customer pays baseAmount minus any subscription discount
   * - Customer also pays any pending cancellation fee
   * - Worker receives: baseAmount - platformFee (commission deducted)
   *
   * For URGENT bookings:
   * - Customer pays: baseAmount + urgencyPremium + customerBoost
   * - This equals workerEarnings (no commission deducted from customer payment)
   * - Worker receives full totalAmount
   *
   * For EMERGENCY bookings:
   * - Same as STANDARD: baseAmount - subscriptionDiscount + pendingCancellationFee
   *
   * This field is locked at booking acceptance and represents the definitive amount
   * the customer agreed to pay.
   *
   * Requirements: 1.1, 6.1, 6.2
   *
   * @type {number}
   * @example 270 (300 - 30 subscription discount) or 600 (300 base + 300 urgency premium for URGENT)
   * @locked After booking acceptance, this field can only change during scope changes
   * @populated Always set at booking creation
   * @used To charge customer and verify final amounts
   */
  totalAmount: number;

  /**
   * Timestamp when payment fields were calculated and stored (immutable).
   *
   * Records the exact moment the payment calculation was first performed and persisted
   * to the database. This is used for audit trails and historical verification.
   *
   * This timestamp is immutable and never changes, even if amounts are recalculated
   * during scope changes. See lastRecalculatedAt for recalculation history.
   *
   * Requirements: 6.1, 6.2
   *
   * @type {Date}
   * @default Current timestamp when booking is created
   * @locked Immutable after creation
   * @populated Always set at booking creation
   * @used For audit trails and historical reconciliation
   */
  calculatedAt: Date;

  /**
   * Timestamp when payment calculation was last recalculated (e.g., during scope change).
   *
   * Set only when payment amounts are recalculated after booking acceptance, such as
   * during a scope change request.
   *
   * When a scope change is approved:
   * 1. baseAmount is updated to the new amount
   * 2. platformFee is recalculated using locked platformFeePercent
   * 3. workerEarnings and totalAmount are recalculated
   * 4. lastRecalculatedAt is updated to the recalculation timestamp
   *
   * calculatedAt remains unchanged (records original calculation time).
   *
   * Null if booking has never been recalculated (most common case).
   *
   * Requirements: 2.3, 7.1
   *
   * @type {Date | null}
   * @default null
   * @example Set when scope change is applied
   * @locked Updated only during scope changes
   * @populated Only when booking has been recalculated
   * @used To track calculation history and identify scope change instances
   */
  lastRecalculatedAt: Date | null;
}

/**
 * Type helper for extracting payment calculation fields from a Booking
 */
export type BookingPaymentFields = Pick<
  BookingWithPaymentFields,
  | 'baseAmount'
  | 'platformFeePercent'
  | 'platformFee'
  | 'workerEarnings'
  | 'appliedCommissionRate'
  | 'subscriptionDiscount'
  | 'pendingCancellationFee'
  | 'urgencyPremiumAmount'
  | 'urgencySurgeMultiplier'
  | 'urgencyBreakdown'
  | 'totalAmount'
  | 'calculatedAt'
  | 'lastRecalculatedAt'
>;

/**
 * Type for creating a new booking with required payment fields
 */
export type BookingPaymentInput = PaymentCalculationInput;

/**
 * Type for payment calculation results
 */
export type BookingPaymentCalculation = CalculatedPayment;

/**
 * Re-export PaymentCalculationInput and CalculatedPayment from paymentCalculation.service.ts
 * for convenient access from types module
 */
export type {
  PaymentCalculationInput,
  CalculatedPayment,
} from '../services/paymentCalculation.service';
