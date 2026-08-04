/**
 * Production data-cleanup: soft-delete addresses stored with (0,0) coordinates.
 *
 * A (0,0) pin is never a real destination ("Null Island" in GPS terms). The
 * backend now refuses to create such addresses and `resolveServiceAddress`
 * refuses to return them, so the only lingerers are legacy rows saved before
 * that guard. This marks them deleted (and non-default) so they disappear from
 * the customer's address list and the customer re-adds with a real location.
 *
 * Safe to re-run — it is idempotent.
 *
 * Run from the backend directory:
 *   npx ts-node --transpile-only src/scripts/backfill-zero-addresses.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.address.findMany({
    where: { latitude: 0, longitude: 0, isDeleted: false },
    select: { id: true },
  });
  console.log(`Found ${rows.length} address(es) stored at (0,0).`);

  if (rows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const result = await prisma.address.updateMany({
    where: { latitude: 0, longitude: 0, isDeleted: false },
    data: { isDeleted: true, isDefault: false },
  });
  console.log(
    `Soft-deleted ${result.count} zero-coordinate address(es) so customers re-add ` +
    'them with a real location ("Use Current Location").',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());