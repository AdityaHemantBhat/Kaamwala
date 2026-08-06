/**
 * Apply the push-delivery tracking migration
 * (prisma/migrations/20250806_add_push_delivery_tracking.sql).
 *
 * Idempotent — checks each type/column/index before creating it, so it is safe
 * to re-run after a partial or aborted apply. Statements run one at a time so
 * the transaction pooler (pgbouncer) never sees a multi-statement batch.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function typeExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw`SELECT 1 FROM pg_type WHERE typname = ${name}`;
  return (rows as any[]).length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`;
  return (rows as any[]).length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw`SELECT 1 FROM pg_indexes WHERE indexname = ${name}`;
  return (rows as any[]).length > 0;
}

async function exec(label: string, sql: string): Promise<void> {
  await prisma.$executeRawUnsafe(sql);
  console.log(`✔ ${label}`);
}

async function main(): Promise<void> {
  console.log('Migrating Notification table (push delivery tracking)...');

  // 1. Delivery-status enum
  if (!(await typeExists('NotificationDeliveryStatus'))) {
    await exec('create enum NotificationDeliveryStatus',
      `CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING','DELIVERED','FAILED','CANCELLED')`);
  } else {
    console.log('• enum NotificationDeliveryStatus already exists');
  }

  // 2. New columns (each guarded so re-runs are safe)
  const columns: Array<[string, string]> = [
    ['status', `"status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING'`],
    ['retryCount', '"retryCount" INTEGER NOT NULL DEFAULT 0'],
    ['lastRetryAt', '"lastRetryAt" TIMESTAMP(3)'],
    ['deliveredAt', '"deliveredAt" TIMESTAMP(3)'],
    ['failureReason', '"failureReason" TEXT'],
    ['updatedAt', '"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ];
  for (const [name, definition] of columns) {
    if (!(await columnExists('Notification', name))) {
      await exec(`add column Notification.${name}`, `ALTER TABLE "Notification" ADD COLUMN ${definition}`);
    } else {
      console.log(`• column Notification.${name} already exists`);
    }
  }

  // 3. Indexes — replace the old (userId, isRead) with (userId, isRead, status),
  //    then add the retry-sweep and failure-debug indexes.
  if (await indexExists('Notification_userId_isRead_idx')) {
    await exec('drop legacy index', 'DROP INDEX "Notification_userId_isRead_idx"');
  }
  if (!(await indexExists('Notification_userId_isRead_status_idx'))) {
    await exec('create index (userId, isRead, status)',
      'CREATE INDEX "Notification_userId_isRead_status_idx" ON "Notification"("userId", "isRead", "status")');
  }
  if (!(await indexExists('Notification_status_createdAt_idx'))) {
    await exec('create index (status, createdAt)',
      'CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt")');
  }
  if (!(await indexExists('Notification_status_failureReason_createdAt_idx'))) {
    await exec('create index (status, failureReason, createdAt)',
      'CREATE INDEX "Notification_status_failureReason_createdAt_idx" ON "Notification"("status", "failureReason", "createdAt")');
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch(async (e) => {
  console.error('Migration failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
