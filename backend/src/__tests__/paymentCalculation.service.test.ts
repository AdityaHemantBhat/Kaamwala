import { paymentCalculationService } from '../services/paymentCalculation.service';

describe('PaymentCalculationService', () => {
  describe('calculateStandardBookingPayment()', () => {
    it('should calculate correct amounts for FREE plan without subscription', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        },
      );

      expect(result.baseAmount).toBe(1000);
      expect(result.platformFeePercent).toBe(15);
      expect(result.platformFee).toBe(150); // 1000 * 15 / 100 = 150
      expect(result.workerEarnings).toBe(850); // 1000 - 150 = 850
      expect(result.subscriptionDiscount).toBe(0);
      expect(result.totalAmount).toBe(1000); // no discount
      expect(result.metadata.calculationMethod).toBe('STANDARD_CALCULATION');
    });

    it('should calculate correct amounts for PRO plan without subscription', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'PRO',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        },
      );

      expect(result.platformFeePercent).toBe(10);
      expect(result.platformFee).toBe(100); // 1000 * 10 / 100 = 100
      expect(result.workerEarnings).toBe(900); // 1000 - 100 = 900
    });

    it('should calculate correct amounts for ELITE plan without subscription', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'ELITE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        },
      );

      expect(result.platformFeePercent).toBe(5);
      expect(result.platformFee).toBe(50); // 1000 * 5 / 100 = 50
      expect(result.workerEarnings).toBe(950); // 1000 - 50 = 950
    });

    it('should apply PLUS subscription discount (10%)', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: 'PLUS',
          customerSubscriptionActive: true,
        },
      );

      expect(result.subscriptionDiscount).toBe(100); // 1000 * 10 / 100 = 100
      expect(result.totalAmount).toBe(900); // 1000 - 100 = 900
      expect(result.workerEarnings).toBe(850); // Still 1000 - 150 commission = 850
      expect(result.platformFee).toBe(150); // Commission still calculated on full baseAmount
    });

    it('should apply PRO subscription discount (20%)', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: 'PRO',
          customerSubscriptionActive: true,
        },
      );

      expect(result.subscriptionDiscount).toBe(200); // 1000 * 20 / 100 = 200
      expect(result.totalAmount).toBe(800); // 1000 - 200 = 800
      expect(result.workerEarnings).toBe(850); // Still 1000 - 150 commission = 850
    });

    it('should not apply subscription discount if subscription inactive', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: 'PLUS',
          customerSubscriptionActive: false,
        },
      );

      expect(result.subscriptionDiscount).toBe(0);
      expect(result.totalAmount).toBe(1000);
    });

    it('should include pending cancellation fee in total amount', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          pendingCancellationFee: 100,
        },
      );

      expect(result.pendingCancellationFee).toBe(100);
      expect(result.totalAmount).toBe(1100); // 1000 + 100 pending fee
      expect(result.workerEarnings).toBe(850); // unaffected by pending fee
    });

    it('should calculate market reference savings', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          marketReferencePrice: 1500,
        },
      );

      expect(result.customerSaved).toBe(500); // 1500 - 1000 = 500
    });

    it('should not calculate negative savings', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          marketReferencePrice: 800,
        },
      );

      expect(result.customerSaved).toBe(0); // market price lower than total, no savings
    });

    it('should throw error for invalid baseAmount', async () => {
      await expect(
        paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: 0,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        }),
      ).rejects.toThrow('Invalid baseAmount');
    });

    it('should throw error for negative baseAmount', async () => {
      await expect(
        paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: -100,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        }),
      ).rejects.toThrow('Invalid baseAmount');
    });

    it('should throw error for invalid plan tier', async () => {
      await expect(
        paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'INVALID' as any,
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        }),
      ).rejects.toThrow('Invalid workerPlanTier');
    });

    it('should throw error for invalid subscription plan', async () => {
      await expect(
        paymentCalculationService.calculateStandardBookingPayment({
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: 'INVALID' as any,
          customerSubscriptionActive: true,
        }),
      ).rejects.toThrow('Invalid customerSubscriptionPlan');
    });

    it('should handle fractional amounts and round correctly', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1234.56,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        },
      );

      // 1234.56 * 15 / 100 = 185.184 → 185 (whole rupees)
      expect(result.platformFee).toBe(185);
      expect(result.workerEarnings).toBe(1049.56); // 1234.56 - 185 = 1049.56
      expect(Number.isFinite(result.workerEarnings)).toBe(true);
    });

    it('should have metadata with calculation method and timestamp', async () => {
      const beforeTime = new Date();
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        },
      );
      const afterTime = new Date();

      expect(result.metadata.calculationMethod).toBe('STANDARD_CALCULATION');
      expect(result.metadata.version).toBe('1.0');
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
      expect(result.metadata.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(result.metadata.timestamp.getTime()).toBeLessThanOrEqual(
        afterTime.getTime(),
      );
    });
  });

  describe('calculateUrgentBookingPayment()', () => {
    it('should calculate correct amounts with 1.5x urgency multiplier', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 1.5,
        },
      );

      expect(result.baseAmount).toBe(1000);
      expect(result.platformFeePercent).toBe(0); // No commission for urgent
      expect(result.platformFee).toBe(0);
      expect(result.urgencyPremium).toBe(500); // (1000 * 1.5) - 1000 = 1500 - 1000 = 500
      expect(result.workerEarnings).toBe(1500); // 1000 + 500 = 1500
      expect(result.totalAmount).toBe(1500); // For urgent, customer pays = worker earnings
      expect(result.metadata.calculationMethod).toBe('URGENT_CALCULATION');
    });

    it('should calculate correct amounts with 2x urgency multiplier', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 2,
        },
      );

      expect(result.urgencyPremium).toBe(1000); // (1000 * 2) - 1000 = 2000 - 1000 = 1000
      expect(result.workerEarnings).toBe(2000);
      expect(result.totalAmount).toBe(2000);
    });

    it('should calculate correct amounts with 2.5x urgency multiplier', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 2.5,
        },
      );

      expect(result.urgencyPremium).toBe(1500); // (1000 * 2.5) - 1000 = 2500 - 1000 = 1500
      expect(result.workerEarnings).toBe(2500);
    });

    it('should include customer boost in worker earnings', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 1.5,
          customerBoost: 200,
        },
      );

      expect(result.urgencyBreakdown?.customerBoostAmount).toBe(200);
      expect(result.workerEarnings).toBe(1700); // 1000 + 500 + 200 = 1700
      expect(result.totalAmount).toBe(1700);
    });

    it('should set urgencyBreakdown with correct components', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 1.5,
          customerBoost: 100,
        },
      );

      expect(result.urgencyBreakdown).toBeDefined();
      expect(result.urgencyBreakdown?.baseEarnings).toBe(1000);
      expect(result.urgencyBreakdown?.urgencyEarnings).toBe(500);
      expect(result.urgencyBreakdown?.customerBoostAmount).toBe(100);
    });

    it('should store surgeMultiplier in result', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 2.5,
        },
      );

      expect(result.surgeMultiplier).toBe(2.5);
    });

    it('should have zero subscription discount for urgent', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: 'PLUS',
          customerSubscriptionActive: true,
          urgencyMultiplier: 1.5,
        },
      );

      expect(result.subscriptionDiscount).toBe(0); // No discounts for urgent
    });

    it('should have zero pending cancellation fee for urgent', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 1.5,
          pendingCancellationFee: 100,
        },
      );

      expect(result.pendingCancellationFee).toBe(0);
    });

    it('should throw error for invalid urgencyMultiplier < 1', async () => {
      await expect(
        paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 0.9,
        }),
      ).rejects.toThrow('Invalid urgencyMultiplier');
    });

    it('should throw error for negative urgencyMultiplier', async () => {
      await expect(
        paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: -1,
        }),
      ).rejects.toThrow('Invalid urgencyMultiplier');
    });

    it('should throw error for missing urgencyMultiplier', async () => {
      await expect(
        paymentCalculationService.calculateUrgentBookingPayment({
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: undefined as any,
        }),
      ).rejects.toThrow('Invalid urgencyMultiplier');
    });

    it('should have metadata with URGENT_CALCULATION method', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 1.5,
        },
      );

      expect(result.metadata.calculationMethod).toBe('URGENT_CALCULATION');
      expect(result.metadata.version).toBe('1.0');
    });
  });

  describe('recalculateAfterScopeChange()', () => {
    it('should preserve locked commission for scope increase', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      const result =
        await paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          1500,
        );

      // New calculation with locked 15% commission on new baseAmount
      expect(result.baseAmount).toBe(1500);
      expect(result.platformFeePercent).toBe(15); // Locked, unchanged
      expect(result.platformFee).toBe(225); // 1500 * 15 / 100 = 225
      expect(result.workerEarnings).toBe(1275); // 1500 - 225 = 1275
    });

    it('should preserve locked commission for scope decrease', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 10,
        workerEarnings: 900,
        totalAmount: 1000,
      };

      const result =
        await paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          800,
        );

      expect(result.baseAmount).toBe(800);
      expect(result.platformFeePercent).toBe(10); // Locked, unchanged
      expect(result.platformFee).toBe(80); // 800 * 10 / 100 = 80
      expect(result.workerEarnings).toBe(720); // 800 - 80 = 720
    });

    it('should preserve locked commission with ELITE (5%)', async () => {
      const currentBooking = {
        baseAmount: 2000,
        platformFeePercent: 5,
        workerEarnings: 1900,
        totalAmount: 2000,
      };

      const result =
        await paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          3000,
        );

      expect(result.platformFeePercent).toBe(5); // Locked 5% for ELITE
      expect(result.platformFee).toBe(150); // 3000 * 5 / 100 = 150
      expect(result.workerEarnings).toBe(2850); // 3000 - 150 = 2850
    });

    it('should preserve locked commission with 0% (urgent)', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 0,
        workerEarnings: 1500,
        totalAmount: 1500,
      };

      const result =
        await paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          2000,
        );

      expect(result.platformFeePercent).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.workerEarnings).toBe(2000); // Full amount for 0% commission
    });

    it('should have metadata with SCOPE_CHANGE_RECALCULATION method', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      const result =
        await paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          1500,
        );

      expect(result.metadata.calculationMethod).toBe(
        'SCOPE_CHANGE_RECALCULATION',
      );
      expect(result.metadata.version).toBe('1.0');
    });

    it('should throw error for zero newBaseAmount', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      await expect(
        paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          0,
        ),
      ).rejects.toThrow('Invalid newBaseAmount');
    });

    it('should throw error for negative newBaseAmount', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      await expect(
        paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          -500,
        ),
      ).rejects.toThrow('Invalid newBaseAmount');
    });

    it('should handle fractional newBaseAmount correctly', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      const result =
        await paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          1234.56,
        );

      expect(result.baseAmount).toBe(1234.56);
      expect(result.platformFee).toBe(185); // 1234.56 * 15 / 100 = 185.184 → 185
      expect(result.workerEarnings).toBe(1049.56);
    });

    it('should have zero subscription discount after scope change', async () => {
      const currentBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      const result =
        await paymentCalculationService.recalculateAfterScopeChange(
          currentBooking,
          1500,
        );

      expect(result.subscriptionDiscount).toBe(0);
    });
  });

  describe('Commission consistency across methods', () => {
    it('should apply commission only to baseAmount in standard calculation', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          pendingCancellationFee: 200,
        },
      );

      // Commission should be 15% of baseAmount only, not including pending fee
      expect(result.platformFee).toBe(150); // 1000 * 15 / 100 = 150, not affected by fee
      expect(result.workerEarnings).toBe(850); // 1000 - 150 = 850, not affected by fee
    });

    it('should never apply commission to urgency premium', async () => {
      const result = await paymentCalculationService.calculateUrgentBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'URGENT',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
          urgencyMultiplier: 2,
        },
      );

      expect(result.platformFee).toBe(0); // 0% commission on urgent
      expect(result.platformFeePercent).toBe(0);
    });

    it('should never apply commission to subscription discount', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: 'PLUS',
          customerSubscriptionActive: true,
        },
      );

      // Commission is 15% of full baseAmount = 150
      // Discount is 10% of full baseAmount = 100
      // They are independent
      expect(result.platformFee).toBe(150);
      expect(result.subscriptionDiscount).toBe(100);
    });
  });

  describe('Rounding consistency', () => {
    it('should round commission amounts to whole rupees', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 333,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        },
      );

      // 333 * 15 / 100 = 49.95 → rounds to 50
      expect(result.platformFee).toBe(50);
      expect(Number.isInteger(result.platformFee)).toBe(true);
    });

    it('should round worker earnings to paise', async () => {
      const result = await paymentCalculationService.calculateStandardBookingPayment(
        {
          baseAmount: 1000.34,
          bookingType: 'STANDARD',
          workerPlanTier: 'FREE',
          customerSubscriptionPlan: null,
          customerSubscriptionActive: false,
        },
      );

      // Result should be properly rounded
      expect(Number.isFinite(result.workerEarnings)).toBe(true);
      expect(result.workerEarnings).toBe(850.34); // 1000.34 - 150 = 850.34
    });
  });
});
