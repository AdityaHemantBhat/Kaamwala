import { paymentCalculationService } from '../services/paymentCalculation.service';

// ─────────────────────────────────────────────────────────────────────
// TESTS FOR EMERGENCY BOOKING CALCULATIONS
// Tests verify that emergency booking payment calculations:
// 1. Use PaymentCalculationService.calculateStandardBookingPayment()
// 2. Apply commission like STANDARD bookings (not 0% like URGENT)
// 3. Apply worker plan commission: FREE 15%, PRO 10%, ELITE 5%
// 4. Commission locked to worker's plan tier at acceptance
// 5. Match STANDARD booking logic exactly
// Requirements: 1.1, 8.1, 8.3
// ─────────────────────────────────────────────────────────────────────

describe('PaymentCalculationService — Emergency Booking Calculations', () => {
  describe('Emergency Bookings Use STANDARD Calculation (Not URGENT)', () => {
    test('should apply FREE plan commission (15%) to emergency bookings', async () => {
      // Requirement 8.1: Emergency bookings use worker plan commission like STANDARD
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 1000,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // Commission should be applied, NOT 0 like urgent
      expect(result.platformFeePercent).toBe(15);
      expect(result.platformFee).toBe(150); // 1000 * 15 / 100 = 150
      expect(result.workerEarnings).toBe(850); // 1000 - 150 = 850
      expect(result.metadata.calculationMethod).toBe('STANDARD_CALCULATION');
    });

    test('should apply PRO plan commission (10%) to emergency bookings', async () => {
      // Requirement 8.1: Emergency bookings use worker plan commission
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 1000,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      expect(result.platformFeePercent).toBe(10);
      expect(result.platformFee).toBe(100); // 1000 * 10 / 100 = 100
      expect(result.workerEarnings).toBe(900); // 1000 - 100 = 900
    });

    test('should apply ELITE plan commission (5%) to emergency bookings', async () => {
      // Requirement 8.1: Emergency bookings use worker plan commission
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 1000,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      expect(result.platformFeePercent).toBe(5);
      expect(result.platformFee).toBe(50); // 1000 * 5 / 100 = 50
      expect(result.workerEarnings).toBe(950); // 1000 - 50 = 950
    });
  });

  describe('Emergency Bookings vs URGENT Bookings - Commission Difference', () => {
    test('should verify EMERGENCY applies commission while URGENT does not', async () => {
      // Requirement 8.3: Emergency is calculated same as STANDARD
      // Requirement 3.2: Urgent has 0% commission for comparison
      const baseAmount = 1000;
      const emergencyMultiplier = 1.5; // Emergency uses 1.5x base (surge)
      const urgencyMultiplier = 1.3;

      // EMERGENCY: uses STANDARD calculation with worker plan commission
      const emergencyResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: Math.round(baseAmount * emergencyMultiplier),
        bookingType: 'EMERGENCY',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // URGENT: `baseAmount` here is the PRE-surge amount. The urgent calculation
      // applies the multiplier itself (urgencyPremium = baseAmount × multiplier −
      // baseAmount), so passing an already-surged baseAmount would double-apply it.
      const urgentResult = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: urgencyMultiplier,
      });

      // Key difference: EMERGENCY has commission, URGENT does not
      expect(emergencyResult.platformFeePercent).toBeGreaterThan(0);
      expect(emergencyResult.platformFee).toBeGreaterThan(0);
      expect(urgentResult.platformFeePercent).toBe(0);
      expect(urgentResult.platformFee).toBe(0);

      // This means EMERGENCY worker earns less than URGENT (commission taken out)
      expect(emergencyResult.workerEarnings).toBeLessThan(emergencyResult.baseAmount);
      // Urgent: no commission — the worker keeps everything the customer pays.
      expect(urgentResult.workerEarnings).toBe(urgentResult.totalAmount);
      expect(urgentResult.workerEarnings).toBe(Math.round(baseAmount * urgencyMultiplier)); // 1300
      expect(emergencyResult.workerEarnings).toBeLessThan(urgentResult.workerEarnings);
    });

    test('should show commission deducted from emergency but not urgent', async () => {
      const baseAmount = 500;

      // EMERGENCY with FREE plan: 15% commission
      const emergencyResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // URGENT: 0% commission
      const urgentResult = await paymentCalculationService.calculateUrgentBookingPayment({
        baseAmount,
        bookingType: 'URGENT',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
        urgencyMultiplier: 1.0, // 0% premium
      });

      // Emergency: commission taken out
      expect(emergencyResult.platformFee).toBe(75); // 500 * 15% = 75
      expect(emergencyResult.workerEarnings).toBe(425); // 500 - 75 = 425

      // Urgent: no commission
      expect(urgentResult.platformFee).toBe(0);
      expect(urgentResult.workerEarnings).toBe(500); // Full amount
    });
  });

  describe('Emergency Bookings Match STANDARD Booking Logic Exactly', () => {
    test('should produce identical results to standard booking for same inputs', async () => {
      // Requirement 8.3: Emergency is calculated same as STANDARD
      const baseAmount = 1500;
      const plan = 'PRO';

      // Calculate as EMERGENCY
      const emergencyResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'EMERGENCY',
        workerPlanTier: plan as 'FREE' | 'PRO' | 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // Calculate as STANDARD
      const standardResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'STANDARD',
        workerPlanTier: plan as 'FREE' | 'PRO' | 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // Results should be identical (except method name in metadata)
      expect(emergencyResult.baseAmount).toBe(standardResult.baseAmount);
      expect(emergencyResult.platformFeePercent).toBe(standardResult.platformFeePercent);
      expect(emergencyResult.platformFee).toBe(standardResult.platformFee);
      expect(emergencyResult.workerEarnings).toBe(standardResult.workerEarnings);
      expect(emergencyResult.totalAmount).toBe(standardResult.totalAmount);
      expect(emergencyResult.subscriptionDiscount).toBe(standardResult.subscriptionDiscount);
    });

    test('should apply same commission formula to emergency and standard', async () => {
      // Test all plan tiers
      const baseAmount = 2000;
      const tiers: Array<'FREE' | 'PRO' | 'ELITE'> = ['FREE', 'PRO', 'ELITE'];
      const expectedCommissions = [15, 10, 5];

      for (let i = 0; i < tiers.length; i++) {
        const plan = tiers[i];
        const expectedPercent = expectedCommissions[i];

        const emergencyResult = await paymentCalculationService.calculateStandardBookingPayment({
          baseAmount,
          bookingType: 'EMERGENCY',
          workerPlanTier: plan,
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        });

        const standardResult = await paymentCalculationService.calculateStandardBookingPayment({
          baseAmount,
          bookingType: 'STANDARD',
          workerPlanTier: plan,
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        });

        // Both should use same commission
        expect(emergencyResult.platformFeePercent).toBe(expectedPercent);
        expect(standardResult.platformFeePercent).toBe(expectedPercent);
        expect(emergencyResult.platformFee).toBe(standardResult.platformFee);
      }
    });

    test('should handle subscription discounts same way for emergency and standard', async () => {
      const baseAmount = 1000;
      const plan = 'FREE';

      // Emergency with PLUS subscription
      const emergencyResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'EMERGENCY',
        workerPlanTier: plan as 'FREE' | 'PRO' | 'ELITE',
        customerSubscriptionPlan: 'PLUS',
        customerSubscriptionActive: true,
      });

      // Standard with PLUS subscription
      const standardResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'STANDARD',
        workerPlanTier: plan as 'FREE' | 'PRO' | 'ELITE',
        customerSubscriptionPlan: 'PLUS',
        customerSubscriptionActive: true,
      });

      // Both should have same discount
      expect(emergencyResult.subscriptionDiscount).toBe(standardResult.subscriptionDiscount);
      expect(emergencyResult.subscriptionDiscount).toBe(100); // 10% of 1000
      expect(emergencyResult.totalAmount).toBe(900); // 1000 - 100
      expect(standardResult.totalAmount).toBe(900);
    });
  });

  describe('Emergency Booking Commission Lock', () => {
    test('should store commission percentage for audit trail', async () => {
      // Requirement 1.1: Commission locked on booking acceptance
      // Requirement 2.1: Commission stored in booking record
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 1000,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // Commission percentage should be stored for reference
      expect(result.platformFeePercent).toBe(10);
      
      // This should be stored in booking.appliedCommissionRate or booking.platformFeePercent
      // to lock it at acceptance time
      expect(result.metadata).toBeDefined();
      expect(result.metadata.calculationMethod).toBe('STANDARD_CALCULATION');
    });

    test('should produce different commission for different plan tiers', async () => {
      const baseAmount = 1000;

      const freeResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      const proResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      const eliteResult = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // Different tiers have different commissions
      expect(freeResult.platformFeePercent).toBe(15);
      expect(proResult.platformFeePercent).toBe(10);
      expect(eliteResult.platformFeePercent).toBe(5);

      // So they should earn different amounts for same base
      expect(freeResult.workerEarnings).toBeLessThan(proResult.workerEarnings);
      expect(proResult.workerEarnings).toBeLessThan(eliteResult.workerEarnings);
    });
  });

  describe('Emergency Booking with Various Base Amounts', () => {
    test('should calculate correctly for typical emergency base amount (1.5x hourly rate)', async () => {
      const hourlyRate = 500; // Example hourly rate
      const emergencyBase = Math.round(hourlyRate * 1.5); // 750

      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: emergencyBase,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      expect(result.baseAmount).toBe(emergencyBase);
      expect(result.platformFeePercent).toBe(15);
      expect(result.platformFee).toBe(Math.round(emergencyBase * 0.15)); // 112.50 → 112 or 113
      expect(result.workerEarnings).toBe(emergencyBase - result.platformFee);
    });

    test('should handle low base amounts correctly', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 100,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'ELITE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      expect(result.platformFeePercent).toBe(5);
      expect(result.platformFee).toBe(5); // 100 * 5 / 100 = 5
      expect(result.workerEarnings).toBe(95); // 100 - 5 = 95
    });

    test('should handle high base amounts correctly', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 50000,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      expect(result.platformFeePercent).toBe(15);
      expect(result.platformFee).toBe(7500); // 50000 * 15 / 100 = 7500
      expect(result.workerEarnings).toBe(42500); // 50000 - 7500 = 42500
    });
  });

  describe('Emergency Booking Error Handling', () => {
    test('should reject invalid base amount', async () => {
      await expect(
        paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: -100,
          bookingType: 'EMERGENCY',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        })
      ).rejects.toThrow('Invalid baseAmount');
    });

    test('should reject zero base amount', async () => {
      await expect(
        paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: 0,
          bookingType: 'EMERGENCY',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        })
      ).rejects.toThrow('Invalid baseAmount');
    });

    test('should reject invalid plan tier', async () => {
      await expect(
        paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: 1000,
          bookingType: 'EMERGENCY',
          workerPlanTier: 'INVALID' as any,
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        })
      ).rejects.toThrow('Invalid workerPlanTier');
    });
  });

  describe('Emergency Booking Completeness', () => {
    test('should return all required fields in calculated payment', async () => {
      // Requirement 6.1: All payment fields stored in booking record
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 1000,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // All required fields must be present
      expect(result.baseAmount).toBeDefined();
      expect(result.platformFeePercent).toBeDefined();
      expect(result.platformFee).toBeDefined();
      expect(result.workerEarnings).toBeDefined();
      expect(result.totalAmount).toBeDefined();
      expect(result.subscriptionDiscount).toBeDefined();
      expect(result.pendingCancellationFee).toBeDefined();

      // All should be numbers, not null or undefined
      expect(typeof result.baseAmount).toBe('number');
      expect(typeof result.platformFeePercent).toBe('number');
      expect(typeof result.platformFee).toBe('number');
      expect(typeof result.workerEarnings).toBe('number');
      expect(typeof result.totalAmount).toBe('number');

      // Metadata required for audit
      expect(result.metadata).toBeDefined();
      expect(result.metadata.calculationMethod).toBe('STANDARD_CALCULATION');
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.metadata.version).toBeDefined();
    });

    test('should verify calculation consistency: baseAmount - commission = workerEarnings', async () => {
      // Requirement 3.1: Commission applied only to baseAmount
      const baseAmount = 1500;

      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'FREE',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      // Calculate expected: workerEarnings should equal baseAmount - platformFee
      const calculatedEarnings = result.baseAmount - result.platformFee;
      expect(result.workerEarnings).toBe(calculatedEarnings);
    });

    test('should verify all amounts are whole numbers (no decimal issues)', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment({
        baseAmount: 1234,
        bookingType: 'EMERGENCY',
        workerPlanTier: 'PRO',
        customerSubscriptionPlan: null,
        customerSubscriptionActive: false,
      });

      expect(Number.isInteger(result.baseAmount)).toBe(true);
      expect(Number.isInteger(result.platformFeePercent)).toBe(true);
      expect(Number.isInteger(result.platformFee)).toBe(true);
      expect(Number.isInteger(result.workerEarnings)).toBe(true);
      expect(Number.isInteger(result.totalAmount)).toBe(true);
    });
  });
});
