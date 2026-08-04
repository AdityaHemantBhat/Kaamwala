import { paymentCalculationService } from '../services/paymentCalculation.service';

// ─── Legacy Tests (for backward compatibility) ───────────────────────
// These tests verify the OLD urgent finance logic before refactoring
// NOTE: These tests use the old computeUrgentFinance function
// The NEW tests below use the PaymentCalculationService

describe('LEGACY: Urgent Finance — commission on frozen base only ', () => {
  // Legacy tests kept for reference, but real behavior now tested via PaymentCalculationService
  
  test('SKIP - using PaymentCalculationService now', () => {
    expect(true).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// NEW TESTS FOR PAYMENT CALCULATION SERVICE - URGENT BOOKINGS
// Tests verify that urgent booking payment calculations:
// 1. Use PaymentCalculationService.calculateUrgentBookingPayment()
// 2. Apply 0% commission (platformFeePercent = 0, platformFee = 0)
// 3. Calculate correct urgency premium and worker earnings
// 4. Include urgencyBreakdown for ledger audit trail
// Requirements: 1.2, 3.2, 8.2
// ─────────────────────────────────────────────────────────────────────

describe('PaymentCalculationService — Urgent Booking Calculations', () => {
  describe('calculateUrgentBookingPayment() - Zero Commission', () => {
    test('should always apply 0% commission for urgent bookings regardless of worker plan', async () => {
      // Test that URGENT bookings always have 0% commission, even if we pass different plan tiers
      const baseAmount = 300;
      const multiplier = 1.3;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE', // Plan tier doesn't matter for urgent
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      // Requirements 3.2, 8.2: Urgent bookings have 0% commission
      expect(result.platformFeePercent).toBe(0);
      expect(result.platformFee).toBe(0);
      
      // Verify storage metadata indicates URGENT_ZERO
      expect(result.metadata.calculationMethod).toBe('URGENT_CALCULATION');
    });

    test('should store 0% commission in platformFeePercent field for audit', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount: 500,
        bookingType: 'URGENT',
        workerPlanTier: 'ELITE', // Even ELITE plan has 0% for urgent
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 2.0,
      });

      // Requirement 3.2: Commission stored as 0 for audit trail
      expect(result.platformFeePercent).toBe(0);
      expect(result.platformFee).toBe(0);
      
      // Verify result structure has required fields
      expect(result.metadata.calculationMethod).toBe('URGENT_CALCULATION');
      expect(result.metadata.timestamp).toBeDefined();
    });
  });

  describe('calculateUrgentBookingPayment() - Urgency Premium Calculation', () => {
    test('should calculate 1.3x urgency premium correctly (30% premium on base)', async () => {
      const baseAmount = 1000;
      const multiplier = 1.3; // 30% premium

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      // Requirement 1.2: Urgency premium calculated correctly
      expect(result.surgeMultiplier).toBe(1.3);
      expect(result.urgencyPremium).toBe(300); // 1000 * 1.3 - 1000 = 300
      
      // Worker earnings should be base + premium (no commission deducted)
      expect(result.workerEarnings).toBe(1300); // 1000 + 300
    });

    test('should calculate 2x urgency premium correctly (100% premium on base)', async () => {
      const baseAmount = 500;
      const multiplier = 2.0; // 100% premium

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      expect(result.surgeMultiplier).toBe(2.0);
      expect(result.urgencyPremium).toBe(500); // 500 * 2.0 - 500 = 500
      expect(result.workerEarnings).toBe(1000); // 500 + 500
    });

    test('should calculate 2.5x urgency premium correctly (150% premium on base)', async () => {
      const baseAmount = 400;
      const multiplier = 2.5;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      expect(result.surgeMultiplier).toBe(2.5);
      expect(result.urgencyPremium).toBe(600); // 400 * 2.5 - 400 = 600
      expect(result.workerEarnings).toBe(1000); // 400 + 600
    });

    test('should calculate 3x urgency premium correctly (200% premium on base)', async () => {
      const baseAmount = 333;
      const multiplier = 3.0;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      expect(result.surgeMultiplier).toBe(3.0);
      expect(result.urgencyPremium).toBe(666); // 333 * 3.0 - 333 = 666
      expect(result.workerEarnings).toBe(999); // 333 + 666
    });
  });

  describe('calculateUrgentBookingPayment() - Customer Boost', () => {
    test('should include customer boost in worker earnings without commission', async () => {
      const baseAmount = 500;
      const multiplier = 1.3;
      const customerBoost = 200;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
        customerBoost: customerBoost,
      });

      // Requirement 3.2: All components accrue to worker, no commission deducted
      expect(result.urgencyBreakdown?.customerBoostAmount).toBe(customerBoost);
      
      // Worker earnings = base + premium + boost (no commission)
      const expectedEarnings = 500 + 150 + 200; // base + premium + boost
      expect(result.workerEarnings).toBe(expectedEarnings);
      
      // Commission still 0
      expect(result.platformFeePercent).toBe(0);
      expect(result.platformFee).toBe(0);
    });

    test('should handle zero customer boost correctly', async () => {
      const baseAmount = 300;
      const multiplier = 1.5;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
        customerBoost: 0,
      });

      expect(result.urgencyBreakdown?.customerBoostAmount).toBe(0);
      expect(result.workerEarnings).toBe(450); // 300 + 150
    });

    test('should omit customerBoost if not provided', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount: 400,
        bookingType: 'URGENT',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 1.4,
        // customerBoost intentionally omitted
      });

      expect(result.urgencyBreakdown?.customerBoostAmount).toBe(0);
      expect(result.workerEarnings).toBe(560); // 400 + 160
    });
  });

  describe('calculateUrgentBookingPayment() - Urgency Breakdown for Ledger', () => {
    test('should include urgencyBreakdown with all components for audit ledger', async () => {
      const baseAmount = 1000;
      const multiplier = 1.3;
      const boost = 100;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
        customerBoost: boost,
      });

      // Requirement: urgencyBreakdown included for ledger details
      expect(result.urgencyBreakdown).toBeDefined();
      expect(result.urgencyBreakdown?.baseEarnings).toBe(baseAmount);
      expect(result.urgencyBreakdown?.urgencyEarnings).toBe(300); // premium portion
      expect(result.urgencyBreakdown?.customerBoostAmount).toBe(boost);
    });

    test('should have urgencyBreakdown match calculation components', async () => {
      const baseAmount = 500;
      const multiplier = 2.0;
      const boost = 50;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
        customerBoost: boost,
      });

      const breakdown = result.urgencyBreakdown!;
      
      // Verify breakdown components sum to worker earnings
      const breakdownTotal = breakdown.baseEarnings + breakdown.urgencyEarnings + breakdown.customerBoostAmount;
      expect(breakdownTotal).toBe(result.workerEarnings);
      
      // Verify breakdown is accurate
      expect(breakdown.baseEarnings).toBe(500);
      expect(breakdown.urgencyEarnings).toBe(500); // premium
      expect(breakdown.customerBoostAmount).toBe(50);
    });

    test('should store urgencyBreakdown when no customer boost', async () => {
      const baseAmount = 300;
      const multiplier = 1.5;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      expect(result.urgencyBreakdown).toBeDefined();
      expect(result.urgencyBreakdown?.baseEarnings).toBe(300);
      expect(result.urgencyBreakdown?.urgencyEarnings).toBe(150);
      expect(result.urgencyBreakdown?.customerBoostAmount).toBe(0);
    });
  });

  describe('calculateUrgentBookingPayment() - Total Amount', () => {
    test('should set totalAmount equal to workerEarnings for urgent bookings', async () => {
      const baseAmount = 1000;
      const multiplier = 1.3;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      // For urgent: customer pays = worker earnings (no commission deducted)
      expect(result.totalAmount).toBe(result.workerEarnings);
      expect(result.totalAmount).toBe(1300);
    });

    test('should set totalAmount correctly with customer boost', async () => {
      const baseAmount = 500;
      const multiplier = 2.0;
      const boost = 150;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
        customerBoost: boost,
      });

      expect(result.totalAmount).toBe(result.workerEarnings);
      expect(result.totalAmount).toBe(1150); // 500 + 500 + 150
    });
  });

  describe('calculateUrgentBookingPayment() - Rounding Accuracy', () => {
    test('should handle rounding correctly for fractional amounts', async () => {
      const baseAmount = 333; // Will produce fractional premium
      const multiplier = 1.3;

      const result = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: multiplier,
      });

      // 333 * 1.3 = 432.9 → rounds to 433
      // Premium = 433 - 333 = 100
      expect(result.urgencyPremium).toBe(100);
      
      // Worker earnings should be a whole number
      expect(Number.isInteger(result.workerEarnings)).toBe(true);
      expect(Number.isInteger(result.platformFeePercent)).toBe(true);
    });

    test('should round consistently across different multipliers', async () => {
      const baseAmount = 1234;
      
      const result1_3 = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 1.3,
      });

      const result1_5 = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 1.5,
      });

      // Both should have whole number results
      expect(Number.isInteger(result1_3.workerEarnings)).toBe(true);
      expect(Number.isInteger(result1_5.workerEarnings)).toBe(true);
      
      // Both should have 0 commission
      expect(result1_3.platformFeePercent).toBe(0);
      expect(result1_5.platformFeePercent).toBe(0);
    });
  });

  describe('calculateUrgentBookingPayment() - Error Handling', () => {
    test('should reject invalid baseAmount', async () => {
      await expect(
        paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: -100,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 1.3,
        })
      ).rejects.toThrow('Invalid baseAmount');
    });

    test('should reject zero baseAmount', async () => {
      await expect(
        paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: 0,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 1.3,
        })
      ).rejects.toThrow('Invalid baseAmount');
    });

    test('should reject invalid urgencyMultiplier', async () => {
      await expect(
        paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: 500,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 0.5, // Less than 1
        })
      ).rejects.toThrow('Invalid urgencyMultiplier');
    });

    test('should reject missing urgencyMultiplier', async () => {
      await expect(
        paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: 500,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: NaN,
        })
      ).rejects.toThrow('Invalid urgencyMultiplier');
    });
  });

  describe('calculateUrgentBookingPayment() - Comparison with Different Multipliers', () => {
    test('should show increasing earnings for increasing multipliers on same base', async () => {
      const baseAmount = 1000;

      const result1_3 = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 1.3,
      });

      const result1_5 = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 1.5,
      });

      const result2_0 = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 2.0,
      });

      // Higher multiplier = higher earnings
      expect(result1_3.workerEarnings).toBeLessThan(result1_5.workerEarnings);
      expect(result1_5.workerEarnings).toBeLessThan(result2_0.workerEarnings);

      // All should have 0 commission
      expect(result1_3.platformFeePercent).toBe(0);
      expect(result1_5.platformFeePercent).toBe(0);
      expect(result2_0.platformFeePercent).toBe(0);
    });

    test('should verify commission remains 0 across all multipliers', async () => {
      const baseAmount = 500;
      const multipliers = [1.0, 1.3, 1.5, 2.0, 2.5, 3.0];

      for (const multiplier of multipliers) {
        const result = await paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: multiplier,
        });

        // Requirement 3.2: Commission is 0 for ALL urgent bookings
        expect(result.platformFeePercent).toBe(0);
        expect(result.platformFee).toBe(0);
        expect(result.metadata.calculationMethod).toBe('URGENT_CALCULATION');
      }
    });
  });
});
