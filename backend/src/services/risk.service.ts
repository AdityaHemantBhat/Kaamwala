import { prisma } from '../config/prisma';

// ─── Fraud / Data Poisoning Risk Engine ─────────
// Deterministic heuristics, no paid AI. Assigns risk scores used to
// downweight suspicious observations in pricing. Never auto-accuses users.

const WINDOW_DAYS = 30;
const LOW_RATE = 0.15;
const MED_RATE = 0.4;
const HIGH_RATE = 0.7;

interface RiskAssessment {
  score: number; // 0..1
  flags: string[];
}

/**
 * Assess risk for a completed booking observation before it enters
 * market-learning evidence. Combines deterministic signals.
 */
export async function assessBookingRisk(input: {
  customerId: string;
  workerId: string;
  amount: number;
  category: string;
  bookingId?: string;
}): Promise<RiskAssessment> {
  const flags: string[] = [];
  let score = 0;

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);

  // 1. Repeated same customer-worker pair (diminishing independence) — needed by #2.
  const pairCount = await prisma.booking.count({
    where: {
      customerId: input.customerId,
      workerId: input.workerId,
      status: 'COMPLETED',
      completedAt: { gte: since },
    },
  });
  if (pairCount >= 5) { score += LOW_RATE; flags.push('REPEATED_PAIR'); }
  if (pairCount >= 15) { score += MED_RATE; flags.push('HIGH_PAIR_FREQUENCY'); }

  // 2-6 are independent of each other — run concurrently instead of 5 sequential round-trips.
  const [distinctCustomers, categoryAvg, booking, customerCancellations, workerCancellations] = await Promise.all([
    // 2. Many accounts interacting with one worker (collusion ring)
    prisma.booking.groupBy({
      by: ['customerId'],
      where: { workerId: input.workerId, status: 'COMPLETED', completedAt: { gte: since } },
      _count: true,
    }),
    // 3. Unusual price vs category market (outlier heuristic)
    prisma.marketPriceObservation.aggregate({
      where: { category: input.category as any, origin: 'COMPLETED_SERVICE' },
      _avg: { unitRate: true },
    }),
    // 4. Extremely short jobs (fake completions) — completed within a minute
    input.bookingId
      ? prisma.booking.findUnique({
          where: { id: input.bookingId },
          select: { createdAt: true, completedAt: true },
        })
      : Promise.resolve(null),
    // 5. Customer cancellation history (repeated cancels → unreliable)
    prisma.booking.count({
      where: { customerId: input.customerId, cancelledBy: 'CUSTOMER', createdAt: { gte: since } },
    }),
    // 6. Worker cancellation rate (unreliable worker → downweight their evidence)
    prisma.booking.count({
      where: { workerId: input.workerId, cancelledBy: 'WORKER', createdAt: { gte: since } },
    }),
  ]);

  if (distinctCustomers.length <= 2 && pairCount >= 10) {
    score += MED_RATE;
    flags.push('CONCENTRATED_CUSTOMERS');
  }

  if (categoryAvg._avg.unitRate && categoryAvg._avg.unitRate > 0) {
    const ratio = input.amount / categoryAvg._avg.unitRate;
    if (ratio > 3 || ratio < 0.3) { score += MED_RATE; flags.push('PRICE_OUTLIER'); }
  }

  if (booking?.createdAt && booking?.completedAt) {
    const mins = (booking.completedAt.getTime() - booking.createdAt.getTime()) / 60000;
    if (mins < 1) { score += HIGH_RATE; flags.push('SUSPICIOUS_SHORT_JOB'); }
  }

  if (customerCancellations >= 10) { score += LOW_RATE; flags.push('REPEATED_CUSTOMER_CANCELLATIONS'); }

  if (workerCancellations >= 8) { score += MED_RATE; flags.push('REPEATED_WORKER_CANCELLATIONS'); }

  return { score: Math.min(score, 1), flags };
}

/**
 * Detect anomalies for admin — extreme price movement, dominance,
 * availability coordination, region divergence.
 */
export async function getMarketAnomalies(): Promise<any[]> {
  const anomalies: any[] = [];
  const now = new Date();

  // Overnight price movement > 40%
  const recent = await prisma.marketPriceObservation.findMany({
    where: { observedAt: { gte: new Date(now.getTime() - 48 * 3600000) } },
    orderBy: { observedAt: 'asc' },
    take: 500,
    select: { unitRate: true },
  });
  if (recent.length > 10) {
    const first = recent.slice(0, 5).reduce((s, r) => s + r.unitRate, 0) / 5;
    const last = recent.slice(-5).reduce((s, r) => s + r.unitRate, 0) / 5;
    if (first > 0 && Math.abs(last - first) / first > 0.4) {
      anomalies.push({ type: 'PRICE_MOVEMENT', severity: 'high', detail: `+${Math.round((Math.abs(last - first) / first) * 100)}% movement over 48h` });
    }
  }

  // One account dominating data
  const dominant = await prisma.marketPriceObservation.groupBy({
    by: ['customerId'],
    _count: true,
    orderBy: { _count: { customerId: 'desc' } },
    take: 5,
  });
  if (dominant[0] && dominant[0]._count > 50) {
    anomalies.push({ type: 'ACCOUNT_DOMINANCE', severity: 'medium', detail: `${dominant[0]._count} observations from one customer` });
  }

  // Repeated compensations (farming)
  const farmed = await prisma.cancellationRecord.findMany({
    where: { reviewFlag: 'COMPENSATION_FARMING' },
    take: 20,
  });
  if (farmed.length > 0) {
    anomalies.push({ type: 'COMPENSATION_FARMING', severity: 'high', detail: `${farmed.length} flagged cancellation(s) pending review` });
  }

  return anomalies;
}
