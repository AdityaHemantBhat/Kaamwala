-- Support tickets carry an optional contact email so the support team can reach
-- the user directly. Nullable — existing tickets and phone-only users have none;
-- the create-ticket modal pre-fills it from the user's account email.

ALTER TABLE "SupportTicket" ADD COLUMN "contactEmail" TEXT;
