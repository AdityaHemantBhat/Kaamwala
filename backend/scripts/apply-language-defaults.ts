/**
 * Apply the language-default fix (prisma/migrations/20250805_fix_language_defaults.sql).
 * Idempotent — safe to run more than once.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Correct the User.preferredLang column default + existing rows. The value
  // was never user-settable before the fix, so every 'hi' is the old schema
  // default (not a real choice) — overwriting it with the app default 'en'.
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "preferredLang" SET DEFAULT 'en'`);
  const userFix = await prisma.$executeRawUnsafe(`UPDATE "User" SET "preferredLang" = 'en' WHERE "preferredLang" = 'hi'`);
  console.log(`User.preferredLang default -> 'en' (rows corrected: ${userFix})`);

  // 2. Correct the WorkerProfile.languages column default for new rows only.
  await prisma.$executeRawUnsafe(`ALTER TABLE "WorkerProfile" ALTER COLUMN "languages" SET DEFAULT ARRAY['en']::TEXT[]`);
  console.log(`WorkerProfile.languages default -> ['en']`);

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
