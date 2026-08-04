import { assessBookingRisk } from '../services/risk.service';

jest.mock('../config/prisma', () => ({
  prisma: {
    booking: { count: jest.fn(), groupBy: jest.fn(), findUnique: jest.fn() },
    marketPriceObservation: { aggregate: jest.fn() },
  },
}));

const { prisma } = require('../config/prisma');

// suspicious patterns are flagged and their pricing
// evidence downweighted — never auto-accused, never silently trusted.
describe('Risk — data poisoning / fraud detection', () => {
  beforeEach(() => jest.clearAllMocks());

  test('clean booking → low score, no flags', async () => {
    (prisma.booking.count as jest.Mock).mockResolvedValue(1);
    (prisma.booking.groupBy as jest.Mock).mockResolvedValue([{ customerId: 'a' }, { customerId: 'b' }]);
    (prisma.marketPriceObservation.aggregate as jest.Mock).mockResolvedValue({ _avg: { unitRate: 300 } });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ createdAt: new Date(Date.now() - 60000), completedAt: new Date() });

    const r = await assessBookingRisk({ customerId: 'c', workerId: 'w', amount: 300, category: 'PLUMBER', bookingId: 'b' });
    expect(r.score).toBeLessThan(0.4);
    expect(r.flags).not.toContain('REPEATED_PAIR');
    expect(r.flags).not.toContain('PRICE_OUTLIER');
  });

  test('repeated same customer-worker pair → REPEATED_PAIR', async () => {
    (prisma.booking.count as jest.Mock).mockResolvedValue(12); // >= 5
    (prisma.booking.groupBy as jest.Mock).mockResolvedValue([{ customerId: 'c' }, { customerId: 'd' }]);
    (prisma.marketPriceObservation.aggregate as jest.Mock).mockResolvedValue({ _avg: { unitRate: 300 } });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ createdAt: new Date(Date.now() - 60000), completedAt: new Date() });

    const r = await assessBookingRisk({ customerId: 'c', workerId: 'w', amount: 300, category: 'PLUMBER', bookingId: 'b' });
    expect(r.flags).toContain('REPEATED_PAIR');
    expect(r.score).toBeGreaterThan(0);
  });

  test('concentrated customers interacting with one worker → collusion flag', async () => {
    (prisma.booking.count as jest.Mock).mockResolvedValue(12);
    (prisma.booking.groupBy as jest.Mock).mockResolvedValue([{ customerId: 'c' }]); // only 1 distinct
    (prisma.marketPriceObservation.aggregate as jest.Mock).mockResolvedValue({ _avg: { unitRate: 300 } });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ createdAt: new Date(Date.now() - 60000), completedAt: new Date() });

    const r = await assessBookingRisk({ customerId: 'c', workerId: 'w', amount: 300, category: 'PLUMBER', bookingId: 'b' });
    expect(r.flags).toContain('CONCENTRATED_CUSTOMERS');
  });

  test('extreme price vs market → PRICE_OUTLIER (fake completions)', async () => {
    (prisma.booking.count as jest.Mock).mockResolvedValue(1);
    (prisma.booking.groupBy as jest.Mock).mockResolvedValue([{ customerId: 'a' }, { customerId: 'b' }]);
    (prisma.marketPriceObservation.aggregate as jest.Mock).mockResolvedValue({ _avg: { unitRate: 300 } });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ createdAt: new Date(Date.now() - 60000), completedAt: new Date() });

    const r = await assessBookingRisk({ customerId: 'c', workerId: 'w', amount: 5000, category: 'PLUMBER', bookingId: 'b' });
    expect(r.flags).toContain('PRICE_OUTLIER'); // 5000 / 300 > 3
  });

  test('extremely short job → SUSPICIOUS_SHORT_JOB (fake completion)', async () => {
    (prisma.booking.count as jest.Mock).mockResolvedValue(1);
    (prisma.booking.groupBy as jest.Mock).mockResolvedValue([{ customerId: 'a' }, { customerId: 'b' }]);
    (prisma.marketPriceObservation.aggregate as jest.Mock).mockResolvedValue({ _avg: { unitRate: 300 } });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ createdAt: new Date(Date.now() - 1000), completedAt: new Date() });

    const r = await assessBookingRisk({ customerId: 'c', workerId: 'w', amount: 300, category: 'PLUMBER', bookingId: 'b' });
    expect(r.flags).toContain('SUSPICIOUS_SHORT_JOB'); // completed < 1 min
  });

  test('score is capped at 1 — never exceeds bounds', async () => {
    (prisma.booking.count as jest.Mock).mockResolvedValue(50);
    (prisma.booking.groupBy as jest.Mock).mockResolvedValue([{ customerId: 'c' }]);
    (prisma.marketPriceObservation.aggregate as jest.Mock).mockResolvedValue({ _avg: { unitRate: 100 } });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ createdAt: new Date(Date.now() - 1000), completedAt: new Date() });

    const r = await assessBookingRisk({ customerId: 'c', workerId: 'w', amount: 10000, category: 'PLUMBER', bookingId: 'b' });
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
