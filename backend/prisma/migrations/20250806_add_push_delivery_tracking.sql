-- Add push notification delivery tracking and retry support

-- Create enum for notification delivery status
CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'DELIVERED',
  'FAILED',
  'CANCELLED'
);

-- Alter Notification table to add delivery tracking fields
ALTER TABLE "Notification" 
ADD COLUMN "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastRetryAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "failureReason" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop old indexes and create new ones optimized for retry queries
DROP INDEX IF EXISTS "Notification_userId_isRead_idx";
CREATE INDEX "Notification_userId_isRead_status_idx" ON "Notification"("userId", "isRead", "status");

-- Index for retry queue sweep (find PENDING notifications due for retry)
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- Index for finding recent failures (debugging, analytics)
CREATE INDEX "Notification_status_failureReason_createdAt_idx" ON "Notification"("status", "failureReason", "createdAt");

-- Keep the existing createdAt index for general queries
-- CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt"); -- already exists
