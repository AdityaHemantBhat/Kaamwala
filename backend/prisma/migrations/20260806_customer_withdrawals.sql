-- Support customer wallet withdrawals alongside worker withdrawals.
--
-- A WithdrawalRequest is now issued against exactly ONE wallet: the existing
-- worker wallet (workerProfileId) or the customer wallet (customerProfileId).
-- Both columns are nullable; exactly one must be set per row. The customer
-- payment screen was previously debiting the wallet and creating a "completed"
-- ledger row WITHOUT ever moving money to the beneficiary — a money-losing bug.
-- Routing it through WithdrawalRequest makes it flow through the same
-- admin-approval + Cashfree payout pipeline as worker withdrawals, with the
-- withdrawal id as the idempotent transfer id.

-- Worker withdrawals are unchanged; only loosen the required-ness so a row can
-- reference a customer wallet instead.
ALTER TABLE "WithdrawalRequest" ALTER COLUMN "workerProfileId" DROP NOT NULL;

-- Customer wallet withdrawals.
ALTER TABLE "WithdrawalRequest" ADD COLUMN "customerProfileId" TEXT;
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_customerProfileId_fkey"
  FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same hot path as workerProfileId: admin lists / processes per wallet owner.
CREATE INDEX "WithdrawalRequest_customerProfileId_idx" ON "WithdrawalRequest"("customerProfileId");

-- Booking-payment webhook reconciliation: findFirst on paymentOrderId for every
-- booking-payment webhook would otherwise scan the whole Booking table.
CREATE INDEX "Booking_paymentOrderId_idx" ON "Booking"("paymentOrderId");
