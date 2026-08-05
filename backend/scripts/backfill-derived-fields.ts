/**
 * Backfill fields that are derivable from data already in the database — no
 * invented values. Anything without a source in existing rows is left untouched
 * (it populates through the fixed code paths on new activity).
 *
 *   npx ts-node --transpile-only scripts/backfill-derived-fields.ts
 *
 * Covered:
 *  1. Notification.deepLink   — computed from stored type + data + recipient role.
 *  2. CustomerJobRequest.pincode — inherited from the linked saved Address.
 *  3. UrgentOfferRound.endedAt/outcome — closed from the request's final status.
 */
import { PrismaClient } from '@prisma/client';
import { buildDeepLink } from '../src/services/notification.service';

const prisma = new PrismaClient();

async function backfillNotifications(): Promise<number> {
  const rows = await prisma.notification.findMany({
    where: { deepLink: null },
    select: { id: true, userId: true, type: true, data: true },
    take: 2000,
  });
  let updated = 0;
  const roles = new Map<string, string>();
  for (const n of rows) {
    let role = roles.get(n.userId);
    if (!role) {
      const u = await prisma.user.findUnique({ where: { id: n.userId }, select: { role: true } });
      role = u?.role || 'CUSTOMER';
      roles.set(n.userId, role);
    }
    const link = buildDeepLink(role as any, n.type, (n.data as any) || undefined);
    if (link) {
      await prisma.notification.update({ where: { id: n.id }, data: { deepLink: link } });
      updated++;
    }
  }
  return updated;
}

async function backfillRequestPincodes(): Promise<number> {
  const rows = await prisma.customerJobRequest.findMany({
    where: { pincode: null, addressId: { not: null } },
    select: { id: true, addressId: true },
  });
  let updated = 0;
  for (const r of rows) {
    const addr = await prisma.address.findUnique({ where: { id: r.addressId! }, select: { pincode: true } });
    if (addr?.pincode) {
      await prisma.customerJobRequest.update({ where: { id: r.id }, data: { pincode: addr.pincode } });
      updated++;
    }
  }
  return updated;
}

async function backfillUrgentRounds(): Promise<number> {
  const rounds = await prisma.urgentOfferRound.findMany({
    where: { endedAt: null },
    select: { id: true, urgentRequestId: true },
  });
  let updated = 0;
  for (const round of rounds) {
    const req = await prisma.urgentRequest.findUnique({
      where: { id: round.urgentRequestId },
      select: { status: true },
    });
    const outcome = req?.status === 'ACCEPTED' ? 'ACCEPTED' : req?.status === 'CANCELLED' ? 'CANCELLED' : req?.status === 'EXPIRED' ? 'EXPIRED' : null;
    if (outcome) {
      await prisma.urgentOfferRound.update({ where: { id: round.id }, data: { endedAt: new Date(), outcome } });
      updated++;
    }
  }
  return updated;
}

async function main() {
  console.log('Backfilling only DERIVABLE fields (no invented values)...');
  const n = await backfillNotifications();
  console.log(`Notification.deepLink backfilled: ${n}`);
  const p = await backfillRequestPincodes();
  console.log(`CustomerJobRequest.pincode backfilled: ${p}`);
  const u = await backfillUrgentRounds();
  console.log(`UrgentOfferRound closed: ${u}`);
  await prisma.$disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
