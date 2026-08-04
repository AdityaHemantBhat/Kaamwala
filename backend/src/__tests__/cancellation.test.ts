import { cancellationService } from '../services/cancellation.service';

jest.mock('../config/prisma', () => ({
  prisma: {
    booking: { findUnique: jest.fn(), update: jest.fn() },
    cancellationRecord: {
      findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
      update: jest.fn(), aggregate: jest.fn(), count: jest.fn(),
    },
    customerProfile: { findUnique: jest.fn(), update: jest.fn() },
    workerProfile: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn() },
    userSubscription: { findUnique: jest.fn() },
    marketConfig: { findUnique: jest.fn() },
    appConfig: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../config/env', () => ({
  env: { LATE_CANCELLATION_FEE: '50' },
  devBackdoorsEnabled: false,
}));

jest.mock('../utils/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../services/socket.service', () => ({
  emitToUser: jest.fn(),
  emitToBooking: jest.fn(),
  emitToAdmins: jest.fn(),
}));
jest.mock('../services/notification.service', () => ({
  notificationService: { sendPushNotification: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../services/chat.service', () => ({
  chatService: { createSystemMessage: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../services/workerHealth.service', () => ({
  workerHealthService: {
    computeWorkerHealth: jest.fn().mockResolvedValue({
      healthStatus: 'ACTIVE', cancellationRate: 0, reliabilityScore: 100, warningCount: 0,
    }),
  },
}));

const { prisma } = require('../config/prisma');

// $transaction must execute the callback with `prisma` acting as the tx, so
// tx.* calls land on the same mocks.
(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));

const makeBooking = (over: any = {}) => ({
  id: 'b1',
  bookingNumber: 'B-123',
  customerId: 'C',
  workerId: 'W',
  status: 'ACCEPTED',
  paymentStatus: 'PENDING',
  totalAmount: 500,
  travelProtectionEligibleAt: null,
  cancelRequestStatus: null,
  ...over,
});

const subscribe = (plan: string, over: any = {}) =>
  (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue({ plan, status: 'active', ...over });

describe('Cancellation business rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findUnique as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(where.id ? makeBooking() : null),
    );
    (prisma.booking.update as jest.Mock).mockImplementation(({ data }: any) =>
      Promise.resolve(makeBooking({ ...data })),
    );
    (prisma.cancellationRecord.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.cancellationRecord.create as jest.Mock).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cr1', ...data }),
    );
    (prisma.cancellationRecord.update as jest.Mock).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cr1', ...data }),
    );
    (prisma.cancellationRecord.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.cancellationRecord.aggregate as jest.Mock).mockResolvedValue({ _sum: { feeAmount: 0 } });
    (prisma.cancellationRecord.count as jest.Mock).mockResolvedValue(0);
    (prisma.customerProfile.findUnique as jest.Mock).mockResolvedValue({ walletBalance: 0, pendingCancellationFee: 0 });
    (prisma.customerProfile.update as jest.Mock).mockResolvedValue({});
    (prisma.workerProfile.findUnique as jest.Mock).mockResolvedValue({ walletBalance: 0 });
    (prisma.workerProfile.update as jest.Mock).mockResolvedValue({});
    (prisma.transaction.create as jest.Mock).mockResolvedValue({});
    (prisma.marketConfig.findUnique as jest.Mock).mockResolvedValue({ value: '50' });
    (prisma.appConfig.findUnique as jest.Mock).mockResolvedValue(null);
    subscribe('BASIC');
  });

  // ─── Rule 1: before "On My Way" both sides cancel free ───────────────────

  test('Rule 1 — customer cancels before On My Way: free, no fee, no wallet deduction, no compensation', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(makeBooking({ status: 'ACCEPTED' }));
    subscribe('BASIC');

    await cancellationService.initiateCancellation('b1', 'C', 'CUSTOMER', 'CHANGE_OF_PLAN');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.cancelledBy).toBe('CUSTOMER');
    expect(createData.feeAmount).toBe(0);
    expect(createData.workerCompensation).toBe(0);
    expect(prisma.customerProfile.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.workerProfile.update).not.toHaveBeenCalled();
  });

  test('Rule 1 — worker cancels before On My Way: free, no fee for anyone', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(makeBooking({ status: 'ACCEPTED' }));

    await cancellationService.initiateCancellation('b1', 'W', 'WORKER', 'OTHER');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.cancelledBy).toBe('WORKER');
    expect(createData.feeAmount).toBe(0);
    expect(prisma.customerProfile.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.workerProfile.update.mock.calls.some((c: any) => c[0].data.walletBalance)).toBe(false);
  });

  // ─── Rule 2: worker cancels after "On My Way" → nobody pays ──────────────

  test('Rule 2 — worker cancels directly after On My Way: no customer fee, no compensation', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );

    await cancellationService.initiateCancellation('b1', 'W', 'WORKER', 'EMERGENCY');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.cancelledBy).toBe('WORKER');
    expect(createData.feeAmount).toBe(0);
    expect(createData.workerCompensation ?? 0).toBe(0);
    expect(prisma.customerProfile.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.workerProfile.update.mock.calls.some((c: any) => c[0].data.walletBalance)).toBe(false);
  });

  test('Rule 2 — worker-requested cancel confirmed by customer after On My Way: customer is NOT charged', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({
        status: 'ON_THE_WAY',
        travelProtectionEligibleAt: new Date(),
        cancelRequestStatus: 'PENDING_CUSTOMER',
      }),
    );

    const result = await cancellationService.confirmCancellationRequest('b1', 'C');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.cancelledBy).toBe('WORKER');
    expect(createData.feeAmount).toBe(0);
    expect(prisma.customerProfile.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.workerProfile.update.mock.calls.some((c: any) => c[0].data.walletBalance)).toBe(false);
    const bookingUpdate = (prisma.booking.update as jest.Mock).mock.calls[0][0].data;
    expect(bookingUpdate.status).toBe('CANCELLED');
    expect(bookingUpdate.cancelRequestStatus).toBeNull();
    expect(result.cancellationRecord.cancelledBy).toBe('WORKER');
  });

  test('Rule 2 — worker-initiated request before customer confirms: booking waits, customer not charged yet', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );

    const result: any = await cancellationService.initiateCancellation('b1', 'W', 'WORKER', 'CUSTOMER_REQUESTED');

    expect(result.requires_confirmation).toBe(true);
    const updateData = (prisma.booking.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.cancelRequestBy).toBe('WORKER');
    expect(updateData.cancelRequestStatus).toBe('PENDING_CUSTOMER');
    expect(prisma.cancellationRecord.create).not.toHaveBeenCalled();
    expect(prisma.customerProfile.update).not.toHaveBeenCalled();
  });

  // ─── Rule 2 (worker cancel of a PAID booking) → full refund, no fee ──────

  test('Rule 2 — worker cancels a PAID booking after On My Way: customer fully refunded, worker gets no compensation', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date(), paymentStatus: 'PAID', totalAmount: 500 }),
    );

    await cancellationService.initiateCancellation('b1', 'W', 'WORKER', 'EMERGENCY');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.feeAmount).toBe(0);
    expect(createData.workerCompensation ?? 0).toBe(0);

    // Customer wallet credited the full booking amount.
    expect(prisma.customerProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'C' },
      data: { walletBalance: { increment: 500 } },
    }));

    // Refund ledger row, idempotent per booking.
    const refundTx = (prisma.transaction.create as jest.Mock).mock.calls.find(
      (c: any) => c[0].data.type === 'CANCELLATION_REFUND',
    );
    expect(refundTx).toBeTruthy();
    expect(refundTx[0].data.amount).toBe(500);
    expect(refundTx[0].data.userId).toBe('C');
    expect(refundTx[0].data.idempotencyKey).toBe('cancel:refund:booking:b1');

    // Booking marked refunded.
    const bookingUpdate = (prisma.booking.update as jest.Mock).mock.calls[0][0].data;
    expect(bookingUpdate.paymentStatus).toBe('REFUNDED');

    // Worker must NOT receive compensation.
    expect(prisma.workerProfile.update.mock.calls.some((c: any) => c[0].data.walletBalance)).toBe(false);
  });

  // ─── Rule 3: customer cancels after "On My Way" → fee applies ────────────

  test('Rule 3 — BASIC customer cancels after On My Way: late fee is charged to the customer', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );
    subscribe('BASIC');

    await cancellationService.initiateCancellation('b1', 'C', 'CUSTOMER', 'CHANGE_OF_PLAN');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.cancelledBy).toBe('CUSTOMER');
    expect(createData.feeAmount).toBe(50);
    expect(createData.feeStatus).toBe('PENDING');
    expect(prisma.customerProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'C' },
      data: { pendingCancellationFee: { increment: 50 } },
    }));
    const feeTx = (prisma.transaction.create as jest.Mock).mock.calls.find((c: any) => c[0].data.type === 'CANCELLATION_FEE');
    expect(feeTx).toBeTruthy();
    expect(feeTx[0].data.amount).toBe(50);
    expect(feeTx[0].data.userId).toBe('C');
  });

  // ─── Rule 4: eligible plan customer cancels after "On My Way" → ₹0 ───────

  test('Rule 4 — PLUS customer cancels after On My Way: fee ₹0, no wallet deduction', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );
    subscribe('PLUS');

    await cancellationService.initiateCancellation('b1', 'C', 'CUSTOMER', 'CHANGE_OF_PLAN');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.feeAmount).toBe(0);
    expect(prisma.customerProfile.update).not.toHaveBeenCalled();
    const feeTx = (prisma.transaction.create as jest.Mock).mock.calls.find((c: any) => c[0].data.type === 'CANCELLATION_FEE');
    expect(feeTx).toBeFalsy();
  });

  test('Rule 4 — PRO customer cancels after On My Way: fee ₹0', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );
    subscribe('PRO');

    await cancellationService.initiateCancellation('b1', 'C', 'CUSTOMER', 'CHANGE_OF_PLAN');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.feeAmount).toBe(0);
    expect(prisma.customerProfile.update).not.toHaveBeenCalled();
  });

  test('Rule 4 — an EXPIRED PLUS plan does NOT bypass the fee', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );
    // Status is still 'active' but the billing period has lapsed.
    subscribe('PLUS', { currentPeriodEnd: new Date(Date.now() - 1000) });

    await cancellationService.initiateCancellation('b1', 'C', 'CUSTOMER', 'CHANGE_OF_PLAN');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.customerPlan).toBe('BASIC');
    expect(createData.feeAmount).toBe(50);
  });

  // ─── Mandatory worker reason after On My Way ─────────────────────────────

  test('worker must pick a valid reason when cancelling after On My Way', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );

    await expect(cancellationService.initiateCancellation('b1', 'W', 'WORKER', 'SOME_RANDOM_REASON'))
      .rejects.toThrow('Invalid cancellation reason');
    await expect(cancellationService.initiateCancellation('b1', 'W', 'WORKER', ''))
      .rejects.toThrow('Invalid cancellation reason');
  });

  test('OTHER reason after On My Way requires a description', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );

    await expect(cancellationService.initiateCancellation('b1', 'W', 'WORKER', 'OTHER', 'x'))
      .rejects.toThrow('Invalid cancellation reason');
  });

  test('worker cancelling before On My Way needs no reason', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(makeBooking({ status: 'ACCEPTED' }));

    await cancellationService.initiateCancellation('b1', 'W', 'WORKER', 'OTHER');

    const createData = (prisma.cancellationRecord.create as jest.Mock).mock.calls[0][0].data;
    expect(createData.cancelledBy).toBe('WORKER');
    expect(createData.feeAmount).toBe(0);
  });

  // ─── Cancel preview ───────────────────────────────────────────────────────

  test('preview — BASIC customer after On My Way sees the fee', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );
    subscribe('BASIC');

    const preview = await cancellationService.previewCancellation('b1', 'C', 'CUSTOMER');
    expect(preview.postOnTheWay).toBe(true);
    expect(preview.isFree).toBe(false);
    expect(preview.fee).toBe(50);
  });

  test('preview — PLUS customer after On My Way sees a free cancellation', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );
    subscribe('PLUS');

    const preview = await cancellationService.previewCancellation('b1', 'C', 'CUSTOMER');
    expect(preview.isFree).toBe(true);
    expect(preview.fee).toBe(0);
  });

  test('preview — worker on a paid booking sees the refund amount', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date(), paymentStatus: 'PAID', totalAmount: 500 }),
    );

    const preview = await cancellationService.previewCancellation('b1', 'W', 'WORKER');
    expect(preview.reasonRequired).toBe(true);
    expect(preview.refundIfCancelled).toBe(500);
  });

  // ─── Partial fee collection ───────────────────────────────────────────────

  test('collectPendingFee — partial payment covers the oldest fee FIFO and reconciles the profile', async () => {
    (prisma.customerProfile.findUnique as jest.Mock).mockResolvedValue({ pendingCancellationFee: 150 });
    (prisma.cancellationRecord.findMany as jest.Mock).mockResolvedValue([
      { id: 'r1', feeAmount: 50 },
      { id: 'r2', feeAmount: 100 },
    ]);
    (prisma.cancellationRecord.aggregate as jest.Mock).mockResolvedValue({ _sum: { feeAmount: 90 } });

    const collected = await cancellationService.collectPendingFee('C', 'b1', 60);

    expect(collected).toBe(60);
    // Oldest record fully covered → PAID.
    expect(prisma.cancellationRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r1' },
      data: { feeStatus: 'PAID', feeCollectedAt: expect.any(Date) },
    }));
    // Second record partially covered → feeAmount reduced to the remainder.
    expect(prisma.cancellationRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r2' },
      data: { feeAmount: 90 },
    }));
    // Profile reconciled to the sum of remaining PENDING fees.
    expect(prisma.customerProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'C' },
      data: { pendingCancellationFee: 90 },
    }));
  });

  // ─── Admin refund money movement ──────────────────────────────────────────

  test('admin refund of a PAID fee credits the customer wallet', async () => {
    (prisma.cancellationRecord.findUnique as jest.Mock).mockResolvedValue({
      id: 'cr1', feeAmount: 50, feeStatus: 'PAID', bookingId: 'b1', booking: { customerId: 'C' },
    });

    await cancellationService.adminRefundFee('cr1', 'ADMIN');

    expect(prisma.customerProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'C' },
      data: { walletBalance: { increment: 50 } },
    }));
    const refundTx = (prisma.transaction.create as jest.Mock).mock.calls.find(
      (c: any) => c[0].data.type === 'CANCELLATION_REFUND',
    );
    expect(refundTx).toBeTruthy();
    expect(refundTx[0].data.amount).toBe(50);
    expect(refundTx[0].data.idempotencyKey).toBe('cancel:refund:cr1');
  });

  // ─── Idempotency / safety ────────────────────────────────────────────────

  test('already-cancelled booking refuses a second cancellation', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(
      makeBooking({ status: 'ON_THE_WAY', travelProtectionEligibleAt: new Date() }),
    );
    (prisma.cancellationRecord.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

    await expect(cancellationService.initiateCancellation('b1', 'C', 'CUSTOMER', 'CHANGE_OF_PLAN'))
      .rejects.toThrow('Booking already cancelled');
  });

  test('access denied when the wrong user tries to cancel', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(makeBooking({ status: 'ACCEPTED' }));

    await expect(cancellationService.initiateCancellation('b1', 'X', 'WORKER', 'OTHER'))
      .rejects.toThrow('Access denied');
  });
});
