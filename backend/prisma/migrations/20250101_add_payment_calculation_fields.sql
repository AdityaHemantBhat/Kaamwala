-- Add payment calculation fields to Booking model
-- This migration adds fields to store locked payment calculations
-- All payment calculation fields must NEVER be null to ensure data integrity

-- Set default values for existing rows for fields without current defaults
UPDATE "Booking" SET "platformFeePercent" = COALESCE("platformFeePercent", 0) WHERE "platformFeePercent" IS NULL;
UPDATE "Booking" SET "platformFee" = COALESCE("platformFee", 0) WHERE "platformFee" IS NULL;
UPDATE "Booking" SET "workerEarnings" = COALESCE("workerEarnings", 0) WHERE "workerEarnings" IS NULL;
UPDATE "Booking" SET "totalAmount" = COALESCE("totalAmount", 0) WHERE "totalAmount" IS NULL;

-- Add new columns to the Booking table
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "appliedCommissionRate" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "subscriptionDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "pendingCancellationFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "urgencyPremiumAmount" DOUBLE PRECISION;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "urgencySurgeMultiplier" DOUBLE PRECISION;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "urgencyBreakdown" JSONB;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "lastRecalculatedAt" TIMESTAMP(3);

-- Add calculationDetails to Transaction model for audit trail
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "calculationDetails" JSONB;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- Ensure critical payment fields are NOT NULL at database level
-- This validates that application always populates these fields
ALTER TABLE "Booking" ALTER COLUMN "platformFeePercent" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "platformFee" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "workerEarnings" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "totalAmount" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "baseAmount" SET NOT NULL;

-- Add index for idempotency checks on Transaction (bookingId + type)
-- This index helps quickly find existing WALLET_CREDIT or PLATFORM_COMMISSION entries
-- to prevent double-paying workers on retry
CREATE INDEX IF NOT EXISTS "Transaction_bookingId_type_idx" ON "Transaction"("bookingId", "type");

-- Add index for wallet query optimization during payout processing
CREATE INDEX IF NOT EXISTS "Transaction_userId_type_idx" ON "Transaction"("userId", "type");

-- Note: If database requires explicit migration file naming with timestamp+description,
-- this file should be moved to: migrations/<TIMESTAMP>_add_payment_calculation_fields/migration.sql
-- where <TIMESTAMP> is the timestamp when the migration is created
