/**
 * Backfill customerProfile.totalSaved from the bookings ledger.
 *
 * The live code now counts the customer's real savings per booking:
 *   savings = subscriptionDiscount + max(0, recommendedPrice - baseAmount)
 * Historically totalSaved only accumulated when a `recommendedPrice` (market
 * reference) was supplied — which the client never sends — so loyal customers
 * who earned PLUS/PRO discounts show ₹0 saved. This recomputes the running
 * total from stored booking data so the dashboard/profile reflect reality.
 *
 * The rule mirrors createBooking exactly (sum over every booking, regardless of
 * status, matching the live creation-time increment). Idempotent — safe to re-run.
 *
 * Run from the backend directory:
 *   npx ts-node --transpile-only src/scripts/backfill-customer-savings.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Only rows that can contribute to savings need to move over the wire.
  const bookings = await prisma.booking.findMany({
    where: { OR: [{ subscriptionDiscount: { gt: 0 } }, { recommendedPrice: { not: null } }] },
    select: {
      customerId: true,
      baseAmount: true,
      subscriptionDiscount: true,
      recommendedPrice: true,
    },
  });

  console.log(`Loaded ${bookings.length} booking(s) with discount/market data.`);

  if (bookings.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const totals = new Map<string, number>();
  for (const b of bookings) {
    const marketSavings = b.recommendedPrice != null
      ? Math.max(0, Math.round((b.recommendedPrice - b.baseAmount) * 100) / 100)
      : 0;
    const savings = Math.round((b.subscriptionDiscount + marketSavings) * 100) / 100;
    if (savings <= 0) continue;
    totals.set(b.customerId, (totals.get(b.customerId) || 0) + savings);
  }

  let updated = 0;
  for (const [customerId, totalSaved] of totals) {
    await prisma.customerProfile.update({
      where: { userId: customerId },
      data: { totalSaved: Math.round(totalSaved * 100) / 100 },
    });
    updated++;
  }

  console.log(`Set totalSaved for ${updated} customer(s); grand total ₹${Math.round([...totals.values()].reduce((a, b) => a + b, 0) * 100) / 100}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
