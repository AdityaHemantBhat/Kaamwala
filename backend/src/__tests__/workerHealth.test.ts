import { workerHealthService } from '../services/workerHealth.service';

jest.mock('../config/prisma', () => ({
  prisma: {
    workerProfile: { findUnique: jest.fn(), update: jest.fn() },
    cancellationRecord: { count: jest.fn() },
    marketConfig: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock('../utils/audit', () => ({ createAuditLog: jest.fn() }));

const { prisma } = require('../config/prisma');

const profile = (over: any = {}) => ({
  id: 'wp1',
  userId: 'W',
  completedJobs: 10,
  cancelledJobs: 2,
  cancellationWarningCount: 0,
  healthStatus: 'ACTIVE',
  isUrgentEligible: true,
  isGuaranteed: true,
  isBanned: false,
  ...over,
});

describe('workerHealthService.computeWorkerHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.workerProfile.findUnique as jest.Mock).mockResolvedValue(profile());
    (prisma.cancellationRecord.count as jest.Mock).mockResolvedValue(5);
    (prisma.marketConfig.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.workerProfile.update as jest.Mock).mockImplementation(({ data }: any) =>
      Promise.resolve(profile({ ...data })),
    );
  });

  test('stays ACTIVE below the warn threshold', async () => {
    // 1 post-OMW cancel over 12 total jobs (10 completed + 2 cancelled) → 8.3% < 15% → ACTIVE
    (prisma.cancellationRecord.count as jest.Mock).mockResolvedValue(1);

    const result = (await workerHealthService.computeWorkerHealth('W'))!;

    expect(result.healthStatus).toBe('ACTIVE');
    expect(result.cancellationRate).toBeCloseTo(1 / 12, 5);
    expect(result.reliabilityScore).toBe(Math.round(100 - (1 / 12) * 100));
    const update = (prisma.workerProfile.update as jest.Mock).mock.calls[0][0];
    expect(update.data.healthStatus).toBe('ACTIVE');
    expect(update.data.isBanned).not.toBe(true);
  });

  test('escalates to RESTRICTED above the restrict threshold and strips eligibility flags', async () => {
    // 4 post-OMW cancels over 12 total jobs → 33% > 30%, < 60% → RESTRICTED
    (prisma.cancellationRecord.count as jest.Mock).mockResolvedValue(4);

    const result = (await workerHealthService.computeWorkerHealth('W'))!;

    expect(result.healthStatus).toBe('RESTRICTED');
    const update = (prisma.workerProfile.update as jest.Mock).mock.calls[0][0];
    expect(update.data.healthStatus).toBe('RESTRICTED');
    expect(update.data.isUrgentEligible).toBe(false);
    expect(update.data.isGuaranteed).toBe(false);
    expect(update.data.isBanned).not.toBe(true);
  });

  test('escalates to SUSPENDED above the suspend threshold and bans the worker', async () => {
    // 8 post-OMW cancels over 6 total jobs → 133% > 60% → SUSPENDED
    (prisma.cancellationRecord.count as jest.Mock).mockResolvedValue(8);
    (prisma.workerProfile.findUnique as jest.Mock).mockResolvedValue(profile({ completedJobs: 4 }));

    const result = (await workerHealthService.computeWorkerHealth('W'))!;

    expect(result.healthStatus).toBe('SUSPENDED');
    const update = (prisma.workerProfile.update as jest.Mock).mock.calls[0][0];
    expect(update.data.healthStatus).toBe('SUSPENDED');
    expect(update.data.isBanned).toBe(true);
    expect(update.data.banReason).toMatch(/cancellation/i);
  });

  test('warns when above the warn threshold but below restrict', async () => {
    // 2 post-OMW cancels over 12 total jobs → 16.7% > 15%, < 30% → WARNED
    (prisma.cancellationRecord.count as jest.Mock).mockResolvedValue(2);

    const result = (await workerHealthService.computeWorkerHealth('W'))!;

    expect(result.healthStatus).toBe('WARNED');
    const update = (prisma.workerProfile.update as jest.Mock).mock.calls[0][0];
    expect(update.data.healthStatus).toBe('WARNED');
    expect(update.data.cancellationWarningCount).toBe(1);
    expect(update.data.isBanned).not.toBe(true);
  });
});
