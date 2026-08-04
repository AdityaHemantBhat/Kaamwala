/**
 * One-off provisioning script: promotes an existing user to the SUPER_ADMIN role.
 *
 * SUPER_ADMIN is the platform's highest privilege (equivalent to the old
 * hardcoded bootstrap phone). It is granted deliberately — never self-serve.
 *
 * Usage (after `prisma db push` has applied the new enum value):
 * SUPER_ADMIN_PHONE="+91XXXXXXXXXX" npx ts-node scripts/promote-super-admin.ts
 *
 * Defaults to the legacy bootstrap phone so existing installs keep their
 * current super admin after upgrading.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.SUPER_ADMIN_PHONE || '+919999999999';

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`No user found with phone ${phone}. Create/login the account first.`);
    process.exit(1);
  }
  if (user.role === 'SUPER_ADMIN') {
    console.log(`User ${phone} is already SUPER_ADMIN.`);
    return;
  }

  await prisma.user.update({ where: { phone }, data: { role: 'SUPER_ADMIN' } });
  console.log(`Promoted ${phone} (${user.name}) to SUPER_ADMIN.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
