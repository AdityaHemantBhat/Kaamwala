/**
 * Database-integrity verification (READ-ONLY).
 *
 * For every table+field from the production audit, reports how many rows exist,
 * how many are populated (non-null), and how many are NULL — so the state of the
 * fixes can be verified directly in the database.
 *
 *   npx ts-node --transpile-only scripts/verify-db-integrity.ts
 *
 * Never writes. Safe to run against any environment.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// (table, field, human label, expected rule)
const CHECKS: Array<[string, string, string, string]> = [
  ['Address', 'pincode', 'Address.pincode', 'populated from reverse geocode / form'],
  ['Booking', 'maintenancePlanId', 'Booking.maintenancePlanId', 'only when a maintenance plan is spawned'],
  ['Booking', 'recommendedPrice', 'Booking.recommendedPrice', 'only when platform-recommended'],
  ['BookingSafetyCheck', 'id', 'BookingSafetyCheck rows', 'feature absent — expect 0 rows'],
  ['CancellationRecord', 'feeCollectedAt', 'CancellationRecord.feeCollectedAt', 'when a fee is collected'],
  ['CancellationRecord', 'feeWaivedBy', 'CancellationRecord.feeWaivedBy', 'when admin waives a fee'],
  ['CancellationRecord', 'feeWaivedReason', 'CancellationRecord.feeWaivedReason', 'when admin waives a fee'],
  ['CancellationRecord', 'feeRefundedAt', 'CancellationRecord.feeRefundedAt', 'when a fee is refunded'],
  ['CancellationRecord', 'feeRefundedBy', 'CancellationRecord.feeRefundedBy', 'when a fee is refunded'],
  ['CancellationRecord', 'reviewFlag', 'CancellationRecord.reviewFlag', 'only when flagged for review'],
  ['CustomerJobRequest', 'recommendedPrice', 'CustomerJobRequest.recommendedPrice', 'when a recommendation was shown'],
  ['CustomerJobRequest', 'pincode', 'CustomerJobRequest.pincode', 'inherited from the saved address'],
  ['Dispute', 'adminNotes', 'Dispute.adminNotes', 'on admin resolution'],
  ['Dispute', 'refundAmount', 'Dispute.refundAmount', 'on refund-style resolution'],
  ['Dispute', 'resolvedAt', 'Dispute.resolvedAt', 'on resolution'],
  ['Dispute', 'resolvedBy', 'Dispute.resolvedBy', 'on resolution'],
  ['Issue', 'description', 'Issue.description', 'optional'],
  ['Issue', 'scopeConfig', 'Issue.scopeConfig', 'optional (null for seeded issues)'],
  ['Issue', 'archivedAt', 'Issue.archivedAt', 'only when archived'],
  ['IssueCandidate', 'linkedIssueId', 'IssueCandidate.linkedIssueId', 'when a candidate is linked'],
  ['LoginAttempt', 'ip', 'LoginAttempt.ip', 'populated on every login attempt'],
  ['MarketPriceObservation', 'quantity', 'MarketPriceObservation.quantity', 'dead column (never consumed)'],
  ['MediaAsset', 'verificationSubmissionId', 'MediaAsset.verificationSubmissionId', 'when linked to a verification'],
  ['Message', 'latitude', 'Message.latitude', 'feature absent (no location sharing)'],
  ['Message', 'longitude', 'Message.longitude', 'feature absent (no location sharing)'],
  ['Negotiation', 'finalPrice', 'Negotiation.finalPrice', 'on accepted negotiation'],
  ['NegotiationOffer', 'respondedAt', 'NegotiationOffer.respondedAt', 'on accept/reject'],
  ['Notification', 'deepLink', 'Notification.deepLink', 'populated by the backend now'],
  ['OtpAuditLog', 'ip', 'OtpAuditLog.ip', 'populated on OTP flows now'],
  ['PriceAlert', 'lastTriggered', 'PriceAlert.lastTriggered', 'feature absent'],
  ['PricingAudit', 'issueId', 'PricingAudit.issueId', 'when recommendation has an issue'],
  ['PricingAudit', 'scope', 'PricingAudit.scope', 'when recommendation has scope'],
  ['ReferralEvent', 'id', 'ReferralEvent rows', 'feature implemented'],
  ['RefreshToken', 'userAgent', 'RefreshToken.userAgent', 'populated on issue/rotate now'],
  ['RefreshToken', 'ipAddress', 'RefreshToken.ipAddress', 'populated on issue/rotate now'],
  ['RefreshToken', 'lastUsedAt', 'RefreshToken.lastUsedAt', 'populated on issue/rotate now'],
  ['RequestInterest', 'message', 'RequestInterest.message', 'when worker sends one'],
  ['RequestInterest', 'quoteAmount', 'RequestInterest.quoteAmount', 'when worker quotes'],
  ['RequestInterest', 'quoteMessage', 'RequestInterest.quoteMessage', 'when worker quotes'],
  ['ScopeChangeRequest', 'id', 'ScopeChangeRequest rows', 'feature implemented'],
  ['SupportTicket', 'bookingId', 'SupportTicket.bookingId', 'when created from a booking'],
  ['SupportTicket', 'adminReply', 'SupportTicket.adminReply', 'when admin replies'],
  ['SupportTicket', 'resolvedAt', 'SupportTicket.resolvedAt', 'when resolved'],
  ['TicketMessage', 'imageUrl', 'TicketMessage.imageUrl', 'when an image is attached'],
  ['Transaction', 'bookingId', 'Transaction.bookingId', 'for booking-linked txns'],
  ['Transaction', 'balanceBefore', 'Transaction.balanceBefore', 'when recorded'],
  ['Transaction', 'balanceAfter', 'Transaction.balanceAfter', 'when recorded'],
  ['Transaction', 'reference', 'Transaction.reference', 'when set'],
  ['Transaction', 'meta', 'Transaction.meta', 'when set'],
  ['Transaction', 'calculationDetails', 'Transaction.calculationDetails', 'when computed'],
  ['UrgentOfferRound', 'endedAt', 'UrgentOfferRound.endedAt', 'on round close now'],
  ['UrgentOfferRound', 'outcome', 'UrgentOfferRound.outcome', 'on round close now'],
  ['UrgentRequest', 'scope', 'UrgentRequest.scope', 'feature absent (no scope UI)'],
  ['User', 'email', 'User.email', 'phone-only registration (intentionally NULL)'],
  ['User', 'secondaryRole', 'User.secondaryRole', 'dead column'],
  ['User', 'fcmToken', 'User.fcmToken', 'when push registration succeeds'],
  ['User', 'preferredLang', 'User.preferredLang', 'sent at OTP verify / settings now'],
  ['UserSubscription', 'paymentSubId', 'UserSubscription.paymentSubId', 'when a subscription payment exists'],
  ['UserSubscription', 'cancelledAt', 'UserSubscription.cancelledAt', 'when cancelled'],
  ['WithdrawalRequest', 'id', 'WithdrawalRequest rows', 'feature implemented'],
  ['WorkerJob', 'id', 'WorkerJob rows', 'feature implemented (route fixed)'],
  ['WorkerLocation', 'accuracy', 'WorkerLocation.accuracy', 'captured from GPS now'],
  ['WorkerProfile', 'subCategories', 'WorkerProfile.subCategories', 'now writable via profile'],
  ['WorkerProfile', 'introVideoUrl', 'WorkerProfile.introVideoUrl', 'now writable via profile'],
  ['WorkerProfile', 'skills', 'WorkerProfile.skills', 'editable on profile now'],
  ['WorkerProfile', 'guaranteedSince', 'WorkerProfile.guaranteedSince', 'when ELITE-guaranteed'],
  ['WorkerProfile', 'verificationNote', 'WorkerProfile.verificationNote', 'on admin verification'],
  ['WorkerProfile', 'pincode', 'WorkerProfile.pincode', 'editable on profile now'],
  ['WorkerProfile', 'workPhotos', 'WorkerProfile.workPhotos', 'now writable via profile'],
  ['WorkerProfile', 'languages', 'WorkerProfile.languages', 'synced from settings now'],
  ['WorkerSchedule', 'note', 'WorkerSchedule.note', 'feature absent'],
  ['WorkerService', 'marketRate', 'WorkerService.marketRate', 'dead (no market-rate writer)'],
  ['WorkerSubscription', 'paymentSubId', 'WorkerSubscription.paymentSubId', 'when a subscription payment exists'],
  ['WorkerSubscription', 'cancelledAt', 'WorkerSubscription.cancelledAt', 'when cancelled'],
  ['WorkerVerificationSubmission', 'rejectionNote', 'WorkerVerificationSubmission.rejectionNote', 'on rejection'],
  ['WorkerVerificationSubmission', 'expiryDate', 'WorkerVerificationSubmission.expiryDate', 'feature absent'],
  ['WorkerVerificationSubmission', 'clientRequestId', 'WorkerVerificationSubmission.clientRequestId', 'sent by mobile now'],
];

function fieldSql(field: string): string {
  return field === 'id' ? '"id"' : `"${field}"`;
}

async function check(table: string, field: string, label: string, rule: string): Promise<void> {
  const sql = `SELECT COUNT(*) AS total, COUNT(${fieldSql(field)}) AS filled FROM "${table}";`;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ total: number | bigint; filled: number | bigint }>>(sql);
    const total = Number(rows[0]?.total ?? 0);
    const filled = Number(rows[0]?.filled ?? 0);
    const nullCount = total - filled;
    const ok = field === 'id' ? total > 0 : nullCount === 0;
    const flag = ok ? '  OK ' : ' MISS';
    console.log(
      `${flag} ${label.padEnd(50)} rows=${String(total).padStart(6)}  filled=${String(filled).padStart(6)}  NULL=${String(nullCount).padStart(6)}  ${rule}`,
    );
  } catch (e: any) {
    console.log(` ERR  ${label.padEnd(50)} ${String(e.message).slice(0, 80)}`);
  }
}

async function main() {
  console.log('KaamWala DB integrity audit (READ-ONLY)\n');
  console.log(`${'FLAG'.padEnd(6)} ${'FIELD'.padEnd(50)} rows   filled     NULL  expected-rule`);
  console.log('-'.repeat(120));
  for (const [table, field, label, rule] of CHECKS) {
    await check(table, field, label, rule);
  }
  console.log('-'.repeat(120));
  console.log('\nLegend: OK = populated as expected (or 0 rows for dead/absent features).');
  console.log('MISS = rows exist but field is NULL for some/all — usually PRE-FIX data that predates the fixes.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
