import { prisma } from '../config/prisma';
import { paymentCalculationService } from '../services/paymentCalculation.service';
import { roundINR, roundINRWhole, pct } from '../utils/money';

/**
 * Tests for scope change recalculation in scope-change.controller.ts
 *
 * Requirements: 2.3, 7.1, 7.3
 * - 2.3: Preserve locked commission percentage and recalculate using new baseAmount
 * - 7.1: Show before/after calculation details with locked commission applied
 * - 7.3: Reject scope changes that would result in negative or zero total
 */
describe('Scope Change Recalculation', () => {
  // ─────────────────────────────────────────────────────────
  // Test 1: Scope increase (new amount > old amount)
  // ─────────────────────────────────────────────────────────
  describe('Scope Increase', () => {
    it('should preserve locked commission when increasing scope', async () => {
      // Original booking: ₹1000 baseAmount with 15% commission (FREE plan)
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15, // FREE plan commission (locked at booking acceptance)
        workerEarnings: roundINR(1000 - roundINRWhole(pct(1000, 15))), // 1000 - 150 = 850
        totalAmount: 1000,
      };

      // Scope change: increase to ₹1500
      const newBaseAmount = 1500;

      // Recalculate with locked commission
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        newBaseAmount,
      );

      // Verify locked commission is preserved
      expect(recalculated.platformFeePercent).toBe(15);

      // Verify new platform fee is calculated with locked commission
      const expectedPlatformFee = roundINRWhole(pct(1500, 15)); // 1500 * 15% = 225
      expect(recalculated.platformFee).toBe(expectedPlatformFee);

      // Verify worker earnings are recalculated correctly
      const expectedWorkerEarnings = roundINR(1500 - expectedPlatformFee); // 1500 - 225 = 1275
      expect(recalculated.workerEarnings).toBe(expectedWorkerEarnings);

      // Verify new total is the new baseAmount
      expect(recalculated.totalAmount).toBe(newBaseAmount);

      // Verify new amount > old amount (scope increase)
      expect(recalculated.totalAmount).toBeGreaterThan(originalBooking.totalAmount);

      // Verify calculation method is marked
      expect(recalculated.metadata.calculationMethod).toBe('SCOPE_CHANGE_RECALCULATION');

      console.log('✓ Scope increase: locked commission preserved, new amount calculated correctly');
      console.log(`  Original: ₹${originalBooking.baseAmount} @ 15% → worker ₹${originalBooking.workerEarnings}`);
      console.log(`  New:      ₹${newBaseAmount} @ 15% → worker ₹${recalculated.workerEarnings}`);
      console.log(`  Surcharge: ₹${recalculated.totalAmount - originalBooking.totalAmount}`);
    });

    it('should calculate surcharge correctly for scope increase', async () => {
      // Original: ₹1000, 10% commission (PRO plan)
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 10,
        workerEarnings: roundINR(1000 - roundINRWhole(pct(1000, 10))),
        totalAmount: 1000,
      };

      // Increase to ₹2000
      const newBaseAmount = 2000;
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        newBaseAmount,
      );

      // Surcharge = new total - old total
      const surcharge = recalculated.totalAmount - originalBooking.totalAmount;
      expect(surcharge).toBe(1000); // ₹2000 - ₹1000 = ₹1000

      // Verify surcharge is positive (customer pays more)
      expect(surcharge).toBeGreaterThan(0);

      console.log(`✓ Surcharge calculation: ₹${surcharge} (customer pays more)`);
    });

    it('should preserve locked commission across different plan tiers', async () => {
      // Test with ELITE plan (5% commission)
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 5, // ELITE plan
        workerEarnings: roundINR(1000 - roundINRWhole(pct(1000, 5))),
        totalAmount: 1000,
      };

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        1500,
      );

      // Verify ELITE commission is still 5%
      expect(recalculated.platformFeePercent).toBe(5);
      expect(recalculated.platformFee).toBe(roundINRWhole(pct(1500, 5))); // 75

      console.log('✓ ELITE plan (5% commission) locked correctly across scope change');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test 2: Scope decrease (new amount < old amount, refund issued)
  // ─────────────────────────────────────────────────────────
  describe('Scope Decrease', () => {
    it('should calculate refund correctly with locked commission', async () => {
      // Original: ₹1000 baseAmount, 15% commission (FREE plan)
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: roundINR(1000 - roundINRWhole(pct(1000, 15))), // 850
        totalAmount: 1000,
      };

      // Scope decrease: reduce to ₹500
      const newBaseAmount = 500;
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        newBaseAmount,
      );

      // New platform fee with locked commission
      const newPlatformFee = roundINRWhole(pct(500, 15)); // 75
      expect(recalculated.platformFee).toBe(newPlatformFee);

      // New worker earnings
      const newWorkerEarnings = roundINR(500 - newPlatformFee); // 425
      expect(recalculated.workerEarnings).toBe(newWorkerEarnings);

      // Refund = old total - new total (should be positive)
      const refund = originalBooking.totalAmount - recalculated.totalAmount;
      expect(refund).toBe(500); // ₹1000 - ₹500 = ₹500

      // Verify refund is positive (customer gets refund)
      expect(refund).toBeGreaterThan(0);

      // Verify new amount < old amount
      expect(recalculated.totalAmount).toBeLessThan(originalBooking.totalAmount);

      console.log('✓ Scope decrease: locked commission preserved, refund calculated correctly');
      console.log(`  Original: ₹${originalBooking.baseAmount} @ 15% → customer pays ₹${originalBooking.totalAmount}`);
      console.log(`  New:      ₹${newBaseAmount} @ 15% → customer pays ₹${recalculated.totalAmount}`);
      console.log(`  Refund:   ₹${refund}`);
    });

    it('should preserve locked commission percentage during scope decrease', async () => {
      // PRO plan: 10% commission
      const originalBooking = {
        baseAmount: 2000,
        platformFeePercent: 10,
        workerEarnings: roundINR(2000 - roundINRWhole(pct(2000, 10))), // 1800
        totalAmount: 2000,
      };

      // Decrease to ₹1000
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        1000,
      );

      // Verify locked commission is preserved
      expect(recalculated.platformFeePercent).toBe(10);

      // Verify new fee is applied to new base only
      const expectedNewFee = roundINRWhole(pct(1000, 10)); // 100
      expect(recalculated.platformFee).toBe(expectedNewFee);

      console.log('✓ PRO plan (10% commission) locked correctly during scope decrease');
    });

    it('should handle partial scope decrease (multiple changes)', async () => {
      // First booking: ₹1000
      const booking1 = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: roundINR(1000 - roundINRWhole(pct(1000, 15))),
        totalAmount: 1000,
      };

      // First scope change: ₹1500
      const after1stChange = await paymentCalculationService.recalculateAfterScopeChange(
        booking1,
        1500,
      );
      expect(after1stChange.totalAmount).toBe(1500);

      // Second scope change: ₹800
      const after2ndChange = await paymentCalculationService.recalculateAfterScopeChange(
        {
          baseAmount: after1stChange.baseAmount,
          platformFeePercent: after1stChange.platformFeePercent, // Still locked at 15%
          workerEarnings: after1stChange.workerEarnings,
          totalAmount: after1stChange.totalAmount,
        },
        800,
      );

      // Verify locked commission is still 15%
      expect(after2ndChange.platformFeePercent).toBe(15);

      // Verify new calculation
      const expectedFee = roundINRWhole(pct(800, 15)); // 120
      expect(after2ndChange.platformFee).toBe(expectedFee);

      console.log('✓ Multiple scope changes: locked commission preserved across all changes');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test 3: Edge cases and rejections
  // ─────────────────────────────────────────────────────────
  describe('Edge Cases & Rejections', () => {
    it('should reject scope change with zero baseAmount', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      // Scope change to ₹0 should be rejected
      await expect(
        paymentCalculationService.recalculateAfterScopeChange(originalBooking, 0),
      ).rejects.toThrow('Invalid newBaseAmount');

      console.log('✓ Rejected scope change to ₹0');
    });

    it('should reject scope change with negative baseAmount', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      // Scope change to negative should be rejected
      await expect(
        paymentCalculationService.recalculateAfterScopeChange(originalBooking, -500),
      ).rejects.toThrow('Invalid newBaseAmount');

      console.log('✓ Rejected scope change to negative amount');
    });

    it('should reject scope change with very small baseAmount', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      // Scope change to ₹0.01 should fail validation
      await expect(
        paymentCalculationService.recalculateAfterScopeChange(
          originalBooking,
          0.01,
        ),
      ).rejects.toThrow();

      console.log('✓ Rejected scope change to very small amount (₹0.01)');
    });

    it('should reject scope change with NaN baseAmount', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      // Scope change with NaN should be rejected
      await expect(
        paymentCalculationService.recalculateAfterScopeChange(
          originalBooking,
          NaN,
        ),
      ).rejects.toThrow('Invalid newBaseAmount');

      console.log('✓ Rejected scope change with NaN');
    });

    it('should reject scope change with non-numeric baseAmount', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      // Scope change with non-numeric value should be rejected
      await expect(
        paymentCalculationService.recalculateAfterScopeChange(
          originalBooking,
          'invalid' as any,
        ),
      ).rejects.toThrow();

      console.log('✓ Rejected scope change with non-numeric value');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test 4: Locked commission across urgent bookings
  // ─────────────────────────────────────────────────────────
  describe('Scope Change with Urgent (Zero Commission) Bookings', () => {
    it('should preserve 0% commission for urgent scope changes', async () => {
      // Urgent booking: ₹1000 baseAmount with 0% commission
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 0, // Urgent booking
        workerEarnings: 1000, // No commission deducted
        totalAmount: 1000,
      };

      // Scope change: increase to ₹1500
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        1500,
      );

      // Verify 0% commission is preserved
      expect(recalculated.platformFeePercent).toBe(0);
      expect(recalculated.platformFee).toBe(0);

      // Verify worker gets full new baseAmount
      expect(recalculated.workerEarnings).toBe(1500);

      console.log('✓ Urgent booking: 0% commission preserved during scope change');
    });

    it('should handle urgent scope decrease', async () => {
      const originalBooking = {
        baseAmount: 2000,
        platformFeePercent: 0,
        workerEarnings: 2000,
        totalAmount: 2000,
      };

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        1000,
      );

      // 0% commission preserved
      expect(recalculated.platformFeePercent).toBe(0);
      expect(recalculated.workerEarnings).toBe(1000);

      // Refund calculation
      const refund = originalBooking.totalAmount - recalculated.totalAmount;
      expect(refund).toBe(1000);

      console.log('✓ Urgent booking scope decrease: 0% commission preserved, refund calculated');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test 5: Rounding consistency
  // ─────────────────────────────────────────────────────────
  describe('Rounding Consistency', () => {
    it('should handle rounding correctly for odd amounts', async () => {
      // ₹999 with 15% commission
      const originalBooking = {
        baseAmount: 999,
        platformFeePercent: 15,
        workerEarnings: roundINR(999 - roundINRWhole(pct(999, 15))), // 999 - 150 = 849
        totalAmount: 999,
      };

      // Scope change to ₹1234
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        1234,
      );

      // 15% of 1234 = 185.1 → rounds to 185
      const expectedFee = roundINRWhole(pct(1234, 15));
      expect(recalculated.platformFee).toBe(expectedFee);

      // Worker: 1234 - 185 = 1049
      const expectedWorkerEarnings = roundINR(1234 - expectedFee);
      expect(recalculated.workerEarnings).toBe(expectedWorkerEarnings);

      console.log(
        `✓ Rounding consistency: ₹1234 with 15% = ₹${expectedFee} commission, ₹${expectedWorkerEarnings} to worker`,
      );
    });

    it('should handle small amounts with commission rounding', async () => {
      // ₹50 with 15% commission
      const originalBooking = {
        baseAmount: 50,
        platformFeePercent: 15,
        workerEarnings: roundINR(50 - roundINRWhole(pct(50, 15))), // 50 - 8 = 42 (rounded)
        totalAmount: 50,
      };

      // Scope change to ₹100
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        100,
      );

      // 15% of 100 = 15
      expect(recalculated.platformFee).toBe(15);
      expect(recalculated.workerEarnings).toBe(85);

      console.log('✓ Small amounts: rounding preserved correctly');
    });

    it('should handle large amounts with consistent rounding', async () => {
      // ₹50000 with 10% commission
      const originalBooking = {
        baseAmount: 50000,
        platformFeePercent: 10,
        workerEarnings: roundINR(50000 - roundINRWhole(pct(50000, 10))), // 50000 - 5000 = 45000
        totalAmount: 50000,
      };

      // Scope change to ₹75000
      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        75000,
      );

      // 10% of 75000 = 7500
      expect(recalculated.platformFee).toBe(7500);
      expect(recalculated.workerEarnings).toBe(67500);

      console.log('✓ Large amounts: rounding preserved at scale');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test 6: Commission rate variations
  // ─────────────────────────────────────────────────────────
  describe('Commission Rate Variations', () => {
    it('should correctly apply FREE plan (15%) commission', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        2000,
      );

      // 15% of 2000 = 300
      expect(recalculated.platformFee).toBe(300);
      expect(recalculated.workerEarnings).toBe(1700);

      console.log('✓ FREE plan (15%) commission applied correctly to scope increase');
    });

    it('should correctly apply PRO plan (10%) commission', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 10,
        workerEarnings: 900,
        totalAmount: 1000,
      };

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        2000,
      );

      // 10% of 2000 = 200
      expect(recalculated.platformFee).toBe(200);
      expect(recalculated.workerEarnings).toBe(1800);

      console.log('✓ PRO plan (10%) commission applied correctly');
    });

    it('should correctly apply ELITE plan (5%) commission', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 5,
        workerEarnings: 950,
        totalAmount: 1000,
      };

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        2000,
      );

      // 5% of 2000 = 100
      expect(recalculated.platformFee).toBe(100);
      expect(recalculated.workerEarnings).toBe(1900);

      console.log('✓ ELITE plan (5%) commission applied correctly');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test 7: Metadata and audit trail
  // ─────────────────────────────────────────────────────────
  describe('Metadata & Audit Trail', () => {
    it('should include proper metadata for audit trail', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        1500,
      );

      // Verify metadata fields
      expect(recalculated.metadata).toBeDefined();
      expect(recalculated.metadata.calculationMethod).toBe('SCOPE_CHANGE_RECALCULATION');
      expect(recalculated.metadata.timestamp).toBeInstanceOf(Date);
      expect(recalculated.metadata.version).toBe('1.0');

      console.log('✓ Metadata present for audit trail');
    });

    it('should timestamp each scope change calculation', async () => {
      const originalBooking = {
        baseAmount: 1000,
        platformFeePercent: 15,
        workerEarnings: 850,
        totalAmount: 1000,
      };

      const beforeTime = new Date();

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        1500,
      );

      const afterTime = new Date();

      // Verify timestamp is between before and after
      expect(recalculated.metadata.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(recalculated.metadata.timestamp.getTime()).toBeLessThanOrEqual(
        afterTime.getTime(),
      );

      console.log('✓ Timestamp recorded for scope change calculation');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test 8: Decimal precision and money handling
  // ─────────────────────────────────────────────────────────
  describe('Decimal Precision & Money Handling', () => {
    it('should maintain decimal precision for calculations', async () => {
      // ₹333.33 with 15% commission
      const originalBooking = {
        baseAmount: 333.33,
        platformFeePercent: 15,
        workerEarnings: roundINR(333.33 - roundINRWhole(pct(333.33, 15))),
        totalAmount: 333.33,
      };

      const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
        originalBooking,
        666.67,
      );

      // Verify calculations are precise
      expect(recalculated.baseAmount).toBe(666.67);

      // Calculate expected fee
      const expectedFee = roundINRWhole(pct(666.67, 15)); // 100
      expect(recalculated.platformFee).toBeCloseTo(expectedFee, 0);

      console.log('✓ Decimal precision maintained in calculations');
    });

    it('should not have floating point errors', async () => {
      const originalBooking = {
        baseAmount: 100,
        platformFeePercent: 15,
        workerEarnings: roundINR(100 - roundINRWhole(pct(100, 15))),
        totalAmount: 100,
      };

      // Multiple scope changes to test accumulation of floating point errors
      let current: any = originalBooking;
      for (let i = 0; i < 5; i++) {
        const recalculated = await paymentCalculationService.recalculateAfterScopeChange(
          current,
          100 * (i + 2),
        );

        current = recalculated;

        // platformFee should always be whole rupees
        expect(Number.isInteger(recalculated.platformFee)).toBe(true);
        expect(recalculated.platformFee).toBeGreaterThanOrEqual(0);

        // workerEarnings should be positive
        expect(recalculated.workerEarnings).toBeGreaterThan(0);
      }

      console.log('✓ No floating point errors after 5 consecutive scope changes');
    });
  });
});
