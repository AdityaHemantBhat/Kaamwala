/**
 * One-off: adds pg_trgm GIN indexes that make case-insensitive substring search
 * (ILIKE '%query%') fast even on large tables. The default btree index cannot
 * help a leading-wildcard LIKE; trigram indexes can.
 *
 *   CREATE EXTENSION pg_trgm;                          (requires superuser or owner)
 *   GIN index on "User"."name"                         -> name substring search
 *   GIN index on "WorkerProfile"."bio"                 -> bio substring search
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const statements = [
    `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
    `CREATE INDEX IF NOT EXISTS "user_name_trgm" ON "User" USING GIN ("name" gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS "workerprofile_bio_trgm" ON "WorkerProfile" USING GIN ("bio" gin_trgm_ops)`,
  ];
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`OK: ${sql}`);
    } catch (e: any) {
      console.error(`FAILED: ${sql}\n  ${e.message?.slice(0, 160)}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
