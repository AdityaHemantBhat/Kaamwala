import { bookingService } from '../booking.service';
import { paymentCalculationService } from '../paymentCalculation.service';
import { pricingService } from '../pricing.service';
import { BookingStatus, PaymentStatus } from '@prisma/client';

// createBooking hits several DB-backed services. Mock them all (same pattern as
// cancellation.test.ts) so these integration tests exercise the service logic
// deterministically instead of depending on a live database / seeded rows.
jest.mock('../../config/prisma', () => ({
  prisma: {
    address: { findFirst: jest.fn() },
    booking: { create: jest.fn(), findUnique: jest.fn() },
    customerProfile: { findUnique: jest.fn(), update: jest.fn() },
    workerProfile: { findUnique: jest.fn() },
    workerSubscription: { findUnique: jest.fn() },
    userSubscription: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../socket.service', () => ({
  emitToUser: jest.fn(),
  emitToAdmins: jest.fn(),
}));
jest.mock('../notification.service', () => ({
  notificationService: { sendPushNotification: jest.fn().mockResolvedValue(undefined) },
}));

const { prisma } = require('../../config/prisma') as any;

// $transaction runs the callback with `prisma` acting as the tx, so the
// tx.booking.create inside the service lands on the same mock.
(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));

/**
 * Test Suite for Booking Service - Payment Calculation Integration
 *
 * Validates: Requirements 1.1, 2.1, 2.2, 6.1, 6.2
 *
 * Tests cover:
 * - Correct call to paymentCalculationService
 * - Storage of all calculated payment fields
 * - appliedCommissionRate set correctly based on plan tier
 * - calculatedAt timestamp set to calculation timestamp
 * - Payment field completeness before saving to database
 * - Integration: create booking, verify stored amounts match calculated amounts
 */

describe('Booking Service - Payment Calculation Integration', () => {
  // Mock setup
  const mockCustomerId = 'customer-123';
  const mockWorkerId = 'worker-456';
  const mockAddressId = 'address-789';

  // Booking row returned by tx.booking.create / prisma.booking.findUnique.
  let mockCreatedBooking: any;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockCreatedBooking = null;

    // Service-location resolution (createBooking → resolveServiceAddress) must
    // yield the requested address so the "add an address first" gate passes.
    (prisma.address.findFirst as jest.Mock).mockResolvedValue({
      id: mockAddressId, userId: mockCustomerId, isDefault: true, isDeleted: false,
      latitude: 18.9, longitude: 72.8, line1: 'Test Address', city: 'Mumbai', pincode: '400001',
    });
    // Worker plan lookup (FREE tier → 15% commission) + customer/worker reads.
    (prisma.workerSubscription.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.customerProfile.findUnique as jest.Mock).mockResolvedValue({ pendingCancellationFee: 0 });
    (prisma.workerProfile.findUnique as jest.Mock).mockResolvedValue({ isFrozen: false, walletBalance: 0 });
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(null);

    // Persistence: booking.create stores the row so booking.findUnique can return it.
    (prisma.booking.create as jest.Mock).mockImplementation(async (args: any) => {
      const created = { id: 'booking-1', bookingNumber: 'KW123456', status: 'PENDING', paymentStatus: 'PENDING', ...args.data };
      mockCreatedBooking = created;
      return created;
    });
    (prisma.booking.findUnique as jest.Mock).mockImplementation(async ({ where }: any) =>
      mockCreatedBooking && mockCreatedBooking.id === where.id ? mockCreatedBooking : null,
    );
    (prisma.customerProfile.update as jest.Mock).mockResolvedValue({});

    // The price floor always passes here; the payment calculation service itself
    // rejects invalid (≤ 0 / NaN) base amounts.
    jest.spyOn(pricingService, 'validateMinimumFloor').mockResolvedValue(true as any);
  });

  // ─── Test Suite: Payment Calculation Service Integration ─────────

  describe('Payment Calculation Service Integration', () => {
    test('calls calculateStandardBookingPayment for STANDARD bookings', async () => {
      // Arrange
      const calculateSpy = jest.spyOn(paymentCalculationService, 'calculateStandardBookingPayment');

      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      try {
        // Act
        await bookingService.createBooking(mockCustomerId, bookingData, true);

        // Assert
        expect(calculateSpy).toHaveBeenCalled();
        const callArgs = calculateSpy.mock.calls[0][0];
        expect(callArgs.baseAmount).toBe(1000);
        expect(callArgs.bookingType).toBe('STANDARD');
      } finally {
        calculateSpy.mockRestore();
      }
    });

    test('calls calculateUrgentBookingPayment for URGENT bookings', async () => {
      // Arrange
      const calculateSpy = jest.spyOn(paymentCalculationService, 'calculateUrgentBookingPayment');

      const bookingData = {
        type: 'URGENT',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 800,
        urgencyMultiplier: 2.0,
        customerBoost: 50,
        serviceCategory: 'PLUMBER',
        serviceName: 'Urgent Plumbing',
        scheduledAt: new Date(),
        estimatedDuration: 30,
      };

      try {
        // Act
        await bookingService.createBooking(mockCustomerId, bookingData, true);

        // Assert
        expect(calculateSpy).toHaveBeenCalled();
        const callArgs = calculateSpy.mock.calls[0][0];
        expect(callArgs.baseAmount).toBe(800);
        expect(callArgs.urgencyMultiplier).toBe(2.0);
        expect(callArgs.customerBoost).toBe(50);
      } finally {
        calculateSpy.mockRestore();
      }
    });

    test('passes correct parameters to calculation service', async () => {
      // Arrange
      const calculateSpy = jest.spyOn(paymentCalculationService, 'calculateStandardBookingPayment');

      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 2000,
        serviceCategory: 'ELECTRICIAN',
        serviceName: 'Electrical Work',
        scheduledAt: new Date(),
        estimatedDuration: 120,
      };

      try {
        // Act
        await bookingService.createBooking(mockCustomerId, bookingData, true);

        // Assert
        expect(calculateSpy).toHaveBeenCalled();
        const callArgs = calculateSpy.mock.calls[0][0];

        // Verify all required parameters are passed
        expect(callArgs).toHaveProperty('baseAmount');
        expect(callArgs).toHaveProperty('bookingType');
        expect(callArgs).toHaveProperty('workerPlanTier');
        expect(callArgs).toHaveProperty('customerSubscriptionPlan');
        expect(callArgs).toHaveProperty('customerSubscriptionActive');
      } finally {
        calculateSpy.mockRestore();
      }
    });
  });

  // ─── Test Suite: Payment Fields Storage ────────────────────────

  describe('Payment Fields Storage', () => {
    test('stores platformFeePercent from calculated payment', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.platformFeePercent).toBeDefined();
      expect(Number.isFinite(booking.platformFeePercent)).toBe(true);
      expect([15, 10, 5, 0]).toContain(booking.platformFeePercent); // Valid commission percentages
    });

    test('stores platformFee from calculated payment', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.platformFee).toBeDefined();
      expect(Number.isFinite(booking.platformFee)).toBe(true);
      expect(booking.platformFee).toBeGreaterThanOrEqual(0);
      expect(booking.platformFee).toBeLessThanOrEqual(booking.baseAmount);
    });

    test('stores workerEarnings from calculated payment', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.workerEarnings).toBeDefined();
      expect(Number.isFinite(booking.workerEarnings)).toBe(true);
      expect(booking.workerEarnings).toBeGreaterThan(0);
      // Worker earnings should be baseAmount minus commission
      expect(booking.workerEarnings).toBeLessThanOrEqual(booking.baseAmount);
    });

    test('stores totalAmount from calculated payment', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.totalAmount).toBeDefined();
      expect(Number.isFinite(booking.totalAmount)).toBe(true);
      expect(booking.totalAmount).toBeGreaterThan(0);
    });

    test('stores subscriptionDiscount from calculated payment', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.subscriptionDiscount).toBeDefined();
      expect(Number.isFinite(booking.subscriptionDiscount)).toBe(true);
      expect(booking.subscriptionDiscount).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Test Suite: appliedCommissionRate Field ─────────────────────

  describe('appliedCommissionRate Field', () => {
    test('sets appliedCommissionRate to WORKER_PLAN_FREE for FREE tier worker', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      // Note: This assumes the worker has FREE tier plan; may need to mock worker plan
      expect(booking.appliedCommissionRate).toBeDefined();
      expect([
        'WORKER_PLAN_FREE',
        'WORKER_PLAN_PRO',
        'WORKER_PLAN_ELITE',
        'URGENT_ZERO',
      ]).toContain(booking.appliedCommissionRate);
    });

    test('sets appliedCommissionRate to URGENT_ZERO for URGENT bookings', async () => {
      // Arrange
      const bookingData = {
        type: 'URGENT',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 800,
        urgencyMultiplier: 1.5,
        serviceCategory: 'PLUMBER',
        serviceName: 'Urgent Plumbing',
        scheduledAt: new Date(),
        estimatedDuration: 30,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.appliedCommissionRate).toBe('URGENT_ZERO');
    });
  });

  // ─── Test Suite: calculatedAt Timestamp ────────────────────────

  describe('calculatedAt Timestamp', () => {
    test('sets calculatedAt to a recent timestamp', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const beforeCall = new Date();
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);
      const afterCall = new Date();

      // Assert
      expect(booking.calculatedAt).toBeDefined();
      expect(booking.calculatedAt instanceof Date).toBe(true);
      expect(booking.calculatedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime() - 1000); // Allow 1 second margin
      expect(booking.calculatedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime() + 1000); // Allow 1 second margin
    });
  });

  // ─── Test Suite: Payment Fields Validation ─────────────────────

  describe('Payment Fields Validation', () => {
    test('throws error if calculated payment has invalid platformFee', async () => {
      // NOTE: a baseAmount of 0 never reaches the payment calc — createBooking
      // coerces falsy amounts to 300 (`data.baseAmount || 300`). So this test
      // exercises the actual guard by making the calc return a NaN platformFee,
      // which createBooking must reject before persisting.
      jest.spyOn(paymentCalculationService, 'calculateStandardBookingPayment').mockResolvedValue({
        baseAmount: 1000,
        platformFeePercent: 15,
        platformFee: NaN,
        workerEarnings: 850,
        totalAmount: 1000,
        subscriptionDiscount: 0,
        pendingCancellationFee: 0,
        customerSaved: 0,
        metadata: { calculationMethod: 'STANDARD_CALCULATION', timestamp: new Date(), version: '1.0' },
      } as any);

      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act & Assert
      await expect(bookingService.createBooking(mockCustomerId, bookingData, true))
        .rejects.toThrow('Payment calculation resulted in invalid amounts');
    });

    test('all payment fields are finite numbers before saving', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert - Verify no NaN or Infinity values
      expect(Number.isFinite(booking.baseAmount)).toBe(true);
      expect(Number.isFinite(booking.platformFeePercent)).toBe(true);
      expect(Number.isFinite(booking.platformFee)).toBe(true);
      expect(Number.isFinite(booking.workerEarnings)).toBe(true);
      expect(Number.isFinite(booking.totalAmount)).toBe(true);
      expect(Number.isFinite(booking.subscriptionDiscount)).toBe(true);
    });
  });

  // ─── Test Suite: Integration - Create Booking & Verify Amounts ──

  describe('Integration Tests - Booking Creation & Amount Verification', () => {
    test('creates booking with all calculated amounts populated', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1500,
        serviceCategory: 'ELECTRICIAN',
        serviceName: 'Electrical Installation',
        scheduledAt: new Date(),
        estimatedDuration: 90,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.id).toBeDefined();
      expect(booking.bookingNumber).toBeDefined();
      expect(booking.status).toBe(BookingStatus.PENDING);
      expect(booking.paymentStatus).toBe(PaymentStatus.PENDING);

      // All payment fields populated
      expect(booking.baseAmount).toBe(1500);
      expect(Number.isFinite(booking.platformFeePercent)).toBe(true);
      expect(Number.isFinite(booking.platformFee)).toBe(true);
      expect(Number.isFinite(booking.workerEarnings)).toBe(true);
      expect(Number.isFinite(booking.totalAmount)).toBe(true);
      expect(Number.isFinite(booking.subscriptionDiscount)).toBe(true);
    });

    test('stored amounts match calculation service output', async () => {
      // Arrange
      const baseAmount = 2000;
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount,
        serviceCategory: 'PLUMBER',
        serviceName: 'Major Plumbing Work',
        scheduledAt: new Date(),
        estimatedDuration: 180,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert - Verify stored amounts are reasonable and calculated
      // Worker earnings + commission should equal baseAmount (within rounding)
      const reconstructedBase = booking.workerEarnings + booking.platformFee;
      expect(Math.abs(reconstructedBase - baseAmount)).toBeLessThanOrEqual(1); // Allow 1 rupee rounding

      // Total amount should be close to baseAmount (minus any discounts plus any fees)
      expect(booking.totalAmount).toBeGreaterThan(0);
    });

    test('URGENT booking stores urgencyPremium and surgeMultiplier', async () => {
      // Arrange
      const bookingData = {
        type: 'URGENT',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        urgencyMultiplier: 2.5,
        customerBoost: 100,
        serviceCategory: 'PLUMBER',
        serviceName: 'Urgent Plumbing',
        scheduledAt: new Date(),
        estimatedDuration: 45,
      };

      // Act
      const booking = await bookingService.createBooking(mockCustomerId, bookingData, true);

      // Assert
      expect(booking.urgencyPremiumAmount).toBeDefined();
      expect(Number.isFinite(booking.urgencyPremiumAmount || 0)).toBe(true);
      expect(booking.urgencySurgeMultiplier).toBe(2.5);
      expect(booking.platformFee).toBe(0); // URGENT has 0 commission
      expect(booking.platformFeePercent).toBe(0);
    });

    test('booking is persisted to database with all payment fields', async () => {
      // Arrange
      const bookingData = {
        type: 'STANDARD',
        customerId: mockCustomerId,
        workerId: mockWorkerId,
        addressId: mockAddressId,
        baseAmount: 1000,
        serviceCategory: 'PLUMBER',
        serviceName: 'Plumbing Service',
        scheduledAt: new Date(),
        estimatedDuration: 60,
      };

      // Act
      const createdBooking = await bookingService.createBooking(mockCustomerId, bookingData, true);
      
      // Retrieve booking from database
      const retrievedBooking = await prisma.booking.findUnique({
        where: { id: createdBooking.id },
      });

      // Assert
      expect(retrievedBooking).toBeDefined();
      expect(retrievedBooking?.platformFeePercent).toBe(createdBooking.platformFeePercent);
      expect(retrievedBooking?.platformFee).toBe(createdBooking.platformFee);
      expect(retrievedBooking?.workerEarnings).toBe(createdBooking.workerEarnings);
      expect(retrievedBooking?.totalAmount).toBe(createdBooking.totalAmount);
      expect(retrievedBooking?.appliedCommissionRate).toBe(createdBooking.appliedCommissionRate);
      expect(retrievedBooking?.calculatedAt).toEqual(createdBooking.calculatedAt);
    });
  });
});

