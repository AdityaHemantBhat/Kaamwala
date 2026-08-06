import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

// ─── Analytics Events ─────────────────────────────
// Lightweight, fire-and-forget event recording. Events are NOT financial truth;
// transactional DB/ledger remains authoritative. Failures never block bookings.

export type AnalyticsEventType =
  | 'request_created'
  | 'request_cancelled'
  | 'request_matched'
  | 'request_quote'
  | 'request_counter'
  | 'request_multi_task'
  | 'quote_accepted'
  | 'urgent_request'
  | 'urgent_offer_increased'
  | 'urgent_accepted'
  | 'urgent_expired'
  | 'urgent_no_eligible_workers'
  | 'urgent_demand'
  | 'worker_accepted'
  | 'scope_change_proposed'
  | 'scope_change_approved'
  | 'booking_completed'
  | 'booking_cancelled'
  | 'booking_cancelled_by_customer'
  | 'booking_cancelled_by_worker'
  | 'cancellation_compensated'
  | 'cancellation_fee_waived_by_admin'
  | 'cancellation_fee_refunded_by_admin'
  | 'cancellation_fee_collected'
  | 'price_recommendation_shown'
  | 'pricing_fallback_used'
  | 'price_anomaly'
  | 'matching_failed'
  | 'media_failed';

export const analyticsService = {
 /**
 * Record a marketplace event. Best-effort — never blocks the calling flow.
 */
  async track(
    type: AnalyticsEventType,
    input: {
      userId?: string;
      role?: string;
      category?: string;
      issueId?: string;
      zone?: string;
      payload?: any;
      ip?: string;
    } = {},
  ): Promise<void> {
    try {
      await prisma.analyticsEvent.create({
        data: {
          type,
          userId: input.userId || null,
          role: input.role || null,
          category: input.category || null,
          issueId: input.issueId || null,
          zone: input.zone || null,
          ip: input.ip || null,
          payload: input.payload || null,
        },
      });
    } catch (e) {
      logger.error('Analytics track failed (non-fatal):', e);
    }
  },

 /**
 * Query aggregated event counts by type for admin (lightweight, no heavy joins).
 */
  async getSummary(limitHours = 24): Promise<any> {
    const since = new Date(Date.now() - limitHours * 60 * 60 * 1000);
    const byType = await prisma.analyticsEvent.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { type: 'desc' } },
      take: 30,
    });
    return { since, byType };
  },
};
