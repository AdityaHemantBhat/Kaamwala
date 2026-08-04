import { paymentCalculationService, PaymentCalculationInput } from '../paymentCalculation.service';

/**
 * Test Suite for PaymentCalculationService.calculateStandardBookingPayment()
 *
 * Validates: Requirements 1.1, 3.1, 3.2, 6.1, 6.2
 *
 * Tests cover:
 * - Worker plan tier commission calculations (FREE 15%, PRO 10%, ELITE 5%)
 * - Subscription discount interaction (PLUS 10%, PRO 20%)
 * - Commission applied only to baseAmount
 * - Worker earnings calculation
 * - Customer total calculation with discounts
 * - Edge cases (zero amounts, invalid inputs)
 * - Metadata and audit trail
 */

describe('PaymentCalculationService.calculateStandardBookingPayment()', () => {
  // ─── Test Suite: Worker Plan Tier Commission ──────────────────────

  describe('Worker Plan Tier Commission', () => {
    test('FREE tier applies 15% commission', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.platformFeePercent).toBe(15);
      expect(result.platformFee).toBe(150); // 1000 * 15% = 150
      expect(result.workerEarnings).toBe(850); // 1000 - 150
      expect(result.baseAmount).toBe(1000);
      expect(result.totalAmount).toBe(1000); // customer pays baseAmount (no discount)
    });

    test('PRO tier applies 10% commission', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.platformFeePercent).toBe(10);
      expect(result.platformFee).toBe(100); // 1000 * 10% = 100
      expect(result.workerEarnings).toBe(900); // 1000 - 100
      expect(result.totalAmount).toBe(1000);
    });

    test('ELITE tier applies 5% commission', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.platformFeePercent).toBe(5);
      expect(result.platformFee).toBe(50); // 1000 * 5% = 50
      expect(result.workerEarnings).toBe(950); // 1000 - 50
      expect(result.totalAmount).toBe(1000);
    });
  });

  // ─── Test Suite: Subscription Discount Interaction ─────────────────

  describe('Subscription Discount Interaction', () => {
    test('PLUS subscription applies 10% discount when active', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: 'PLUS',
        customerSubscriptionActive: true,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.subscriptionDiscount).toBe(100); // 1000 * 10% = 100
      expect(result.platformFee).toBe(150); // Commission on baseAmount = 1000 * 15%
      expect(result.workerEarnings).toBe(850); // 1000 - 150 (commission doesn't change)
      expect(result.totalAmount).toBe(900); // 1000 - 100 (discount applied to customer)
    });

    test('PRO subscription applies 20% discount when active', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: 'PRO',
        customerSubscriptionActive: true,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.subscriptionDiscount).toBe(200); // 1000 * 20% = 200
      expect(result.platformFee).toBe(150); // Commission still on baseAmount
      expect(result.workerEarnings).toBe(850); // Commission doesn't change
      expect(result.totalAmount).toBe(800); // 1000 - 200 (customer gets discount)
    });

    test('Subscription discount not applied when inactive', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: 'PRO',
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.subscriptionDiscount).toBe(0); // No discount if inactive
      expect(result.totalAmount).toBe(1000); // Customer pays full baseAmount
    });

    test('BASIC subscription applies no discount', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: 'BASIC',
        customerSubscriptionActive: true,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.subscriptionDiscount).toBe(0); // BASIC has no discount
      expect(result.totalAmount).toBe(1000);
    });

    test('No subscription plan applies no discount', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.subscriptionDiscount).toBe(0);
      expect(result.totalAmount).toBe(1000);
    });
  });

  // ─── Test Suite: Commission Applied Only to BaseAmount ─────────────

  describe('Commission Applied Only to BaseAmount', () => {
    test('Commission NOT applied to pending cancellation fee', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        pendingCancellationFee: 200,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      // Commission should be on baseAmount only
      expect(result.platformFee).toBe(150); // 1000 * 15%, NOT (1000 + 200) * 15%
      expect(result.workerEarnings).toBe(850); // 1000 - 150
      expect(result.totalAmount).toBe(1200); // 1000 + 200 (pending fee added to customer total)
    });

    test('Commission NOT applied to market reference price', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        marketReferencePrice: 1500,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      // Commission on baseAmount only
      expect(result.platformFee).toBe(150); // 1000 * 15%
      expect(result.workerEarnings).toBe(850); // 1000 - 150
      // Customer saved is market reference minus total amount paid
      expect(result.customerSaved).toBe(500); // 1500 - 1000
    });
  });

  // ─── Test Suite: Edge Cases ───────────────────────────────────────

  describe('Edge Cases', () => {
    test('Rejects zero baseAmount', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 0,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      await expect(
        paymentCalculationService.calculateStandardBookingPayment(input),
      ).rejects.toThrow('Invalid baseAmount');
    });

    test('Rejects negative baseAmount', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: -100,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      await expect(
        paymentCalculationService.calculateStandardBookingPayment(input),
      ).rejects.toThrow('Invalid baseAmount');
    });

    test('Rejects invalid workerPlanTier', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'INVALID' as any,
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      await expect(
        paymentCalculationService.calculateStandardBookingPayment(input),
      ).rejects.toThrow('Invalid workerPlanTier');
    });

    test('Rejects invalid subscription plan', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: 'INVALID' as any,
        customerSubscriptionActive: true,
      };

      await expect(
        paymentCalculationService.calculateStandardBookingPayment(input),
      ).rejects.toThrow('Invalid customerSubscriptionPlan');
    });

    test('Handles very small baseAmount (₹0.01)', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 0.01,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.baseAmount).toBe(0.01);
      expect(result.platformFee).toBeGreaterThanOrEqual(0);
      expect(result.workerEarnings).toBeLessThanOrEqual(0.01);
    });

    test('Handles large baseAmount (₹999,999)', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 999999,
        bookingType: 'STANDARD',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.baseAmount).toBe(999999);
      expect(result.platformFee).toBe(50000); // 999999 * 5% = 49999.95 -> rounded to 50000
      expect(result.workerEarnings).toBe(949999); // 999999 - 50000
    });

    test('Returns zero customerSaved when no market reference or higher', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        marketReferencePrice: 900,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.customerSaved).toBe(0); // 900 is not > 1000
    });
  });

  // ─── Test Suite: Metadata and Audit Trail ─────────────────────────

  describe('Metadata and Audit Trail', () => {
    test('Includes metadata with STANDARD_CALCULATION method', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.calculationMethod).toBe('STANDARD_CALCULATION');
      expect(result.metadata.version).toBe('1.0');
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
    });

    test('Timestamp is recent', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const beforeCall = new Date();
      const result = await paymentCalculationService.calculateStandardBookingPayment(input);
      const afterCall = new Date();

      expect(result.metadata.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeCall.getTime(),
      );
      expect(result.metadata.timestamp.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });
  });

  // ─── Test Suite: Complex Scenarios ────────────────────────────────

  describe('Complex Scenarios', () => {
    test('HIGH tier worker with PRO subscription discount and pending fee', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 2000,
        bookingType: 'STANDARD',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: 'PRO',
        customerSubscriptionActive: true,
        pendingCancellationFee: 500,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.platformFeePercent).toBe(5);
      expect(result.platformFee).toBe(100); // 2000 * 5% = 100
      expect(result.workerEarnings).toBe(1900); // 2000 - 100
      expect(result.subscriptionDiscount).toBe(400); // 2000 * 20% = 400
      expect(result.totalAmount).toBe(2100); // 2000 - 400 + 500 (discount - fee + pending)
    });

    test('LOW tier worker with PLUS subscription and market reference', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 500,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: 'PLUS',
        customerSubscriptionActive: true,
        marketReferencePrice: 750,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.platformFeePercent).toBe(15);
      expect(result.platformFee).toBe(75); // 500 * 15% = 75
      expect(result.workerEarnings).toBe(425); // 500 - 75
      expect(result.subscriptionDiscount).toBe(50); // 500 * 10% = 50
      expect(result.totalAmount).toBe(450); // 500 - 50
      expect(result.customerSaved).toBe(300); // 750 - 450
    });

    test('Ensures workerEarnings + platformFee approximately equals baseAmount', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1500,
        bookingType: 'STANDARD',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: 'PLUS',
        customerSubscriptionActive: true,
        pendingCancellationFee: 300,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      // Worker earnings + platform fee should roughly equal base amount
      const reconstructed = result.workerEarnings + result.platformFee;
      expect(Math.abs(reconstructed - input.baseAmount)).toBeLessThanOrEqual(1); // Allow 1 rupee rounding error
    });
  });

  // ─── Test Suite: Payment Structure Completeness (Req 6.1, 6.2) ──────

  describe('Payment Structure Completeness', () => {
    test('Returns all required fields with valid values', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      // Verify all required fields exist and are finite numbers
      expect(Number.isFinite(result.baseAmount)).toBe(true);
      expect(Number.isFinite(result.platformFeePercent)).toBe(true);
      expect(Number.isFinite(result.platformFee)).toBe(true);
      expect(Number.isFinite(result.workerEarnings)).toBe(true);
      expect(Number.isFinite(result.subscriptionDiscount)).toBe(true);
      expect(Number.isFinite(result.pendingCancellationFee)).toBe(true);
      expect(Number.isFinite(result.totalAmount)).toBe(true);
      expect(Number.isFinite(result.customerSaved)).toBe(true);

      // Verify no undefined or NaN
      expect(result.baseAmount).not.toBeUndefined();
      expect(result.platformFeePercent).not.toBeUndefined();
      expect(result.platformFee).not.toBeUndefined();
      expect(result.workerEarnings).not.toBeUndefined();
    });

    test('No fields are null or undefined', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 1000,
        bookingType: 'STANDARD',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: 'PRO',
        customerSubscriptionActive: true,
        pendingCancellationFee: 100,
        marketReferencePrice: 1200,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      // All fields should be defined (not null or undefined)
      expect(result.baseAmount).toBeDefined();
      expect(result.platformFeePercent).toBeDefined();
      expect(result.platformFee).toBeDefined();
      expect(result.workerEarnings).toBeDefined();
      expect(result.subscriptionDiscount).toBeDefined();
      expect(result.pendingCancellationFee).toBeDefined();
      expect(result.totalAmount).toBeDefined();
      expect(result.customerSaved).toBeDefined();
      expect(result.metadata).toBeDefined();

      // No NaN values
      expect(isNaN(result.baseAmount)).toBe(false);
      expect(isNaN(result.platformFee)).toBe(false);
      expect(isNaN(result.workerEarnings)).toBe(false);
      expect(isNaN(result.totalAmount)).toBe(false);
    });
  });

  // ─── Test Suite: Rounding Consistency ──────────────────────────────

  describe('Rounding Consistency', () => {
    test('Rounds commission to whole rupees', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 333, // 333 * 15% = 49.95 -> should round to 50
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      expect(result.platformFee).toBe(50);
      expect(Number.isInteger(result.platformFee) || result.platformFee % 1 === 0).toBe(true);
    });

    test('Rounds discount to two decimals (paise)', async () => {
      const input: PaymentCalculationInput = {
        baseAmount: 333, // 333 * 10% = 33.3 -> should round
        bookingType: 'STANDARD',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: 'PLUS',
        customerSubscriptionActive: true,
      };

      const result = await paymentCalculationService.calculateStandardBookingPayment(input);

      // Check if value is properly rounded to 2 decimal places
      expect(result.subscriptionDiscount).toBe(33.3);
    });
  });
});
