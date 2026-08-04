import { prisma } from '../config/prisma';
import { roundINRWhole } from '../utils/money';

// Single source of truth for worker plan commission rates.
// Worker plans are FREE/PRO/ELITE — distinct from customer BASIC/PLUS/PRO.
// All financial decisions read from here — never hardcode in controllers.
// Commission applies ONLY to the frozen base, never to urgency premium/boosts.

export const WORKER_PLANS = {
  FREE:  { price: 0,   label: 'Free',  commission: 15, featured: false },
  PRO:   { price: 199, label: 'Pro',   commission: 10, featured: true },
  ELITE: { price: 499, label: 'Elite', commission: 5,  featured: true },
} as const;

export type WorkerPlanKey = keyof typeof WORKER_PLANS;

/**
 * Resolve a worker's effective plan + commission rate.
 * Expired/inactive subscriptions fall back to FREE (15%).
 */
export async function getWorkerPlan(workerId: string): Promise<{
  plan: WorkerPlanKey;
  commissionPercent: number;
}> {
  try {
    const sub = await prisma.workerSubscription.findUnique({ where: { userId: workerId } });
    const planKey = String(sub?.plan) as WorkerPlanKey;
    if (sub && sub.status === 'active' && WORKER_PLANS[planKey]) {
      return { plan: planKey, commissionPercent: WORKER_PLANS[planKey].commission };
    }
  } catch {}
  return { plan: 'FREE', commissionPercent: WORKER_PLANS.FREE.commission };
}

/**
 * Compute commission + worker earnings for a booking.
 * Commission applies ONLY to the frozen base, never to urgency premium/boosts.
 */
export function computeUrgentFinance(
  base: number,
  finalOffer: number,
  urgencyPremium: number,
  commissionPercent: number,
): { commission: number; workerEarnings: number; customerBoost: number } {
  const commission = roundINRWhole((base * commissionPercent) / 100);
  const customerBoost = roundINRWhole(Math.max(0, finalOffer - base - urgencyPremium));
  const workerEarnings = roundINRWhole(finalOffer - commission); // worker keeps all premium + boosts
  return { commission, workerEarnings, customerBoost };
}
