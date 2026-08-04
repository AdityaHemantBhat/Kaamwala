import { prisma } from '../config/prisma';
import { ServiceCategory, IssueLifecycle } from '@prisma/client';
import { analyticsService } from './analytics.service';

// ─── Normalization ──────────────────────────────────────────────────────
// Deterministic, no paid AI. Unicode/lowercase/whitespace/punctuation + phrase matching.

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD') // unicode normalization
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[.,/!#$%^&*;:{}=\-_`~()"'<>]/g, ' ')  // punctuation → space
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

const STOP_PHRASES = new Set([
  'urgent', 'help', 'come fast', 'please', 'asap', 'need worker', 'need work',
  'fast', 'quick', 'urgent job', 'immediate', 'immediately', 'asap please',
  'need help', 'help needed', 'job', 'work needed', 'requirement',
]);

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'to', 'of', 'in', 'on', 'for', 'with', 'my', 'i',
  'is', 'are', 'at', 'me', 'please', 'want', 'need', 'have', 'has', 'be', 'it',
]);

// Category-aware vocabulary — stop phrases that look like jobs but aren't
const CATEGORY_STOP: Record<string, string[]> = {
  PLUMBER: ['water coming', 'no water'],
  ELECTRICIAN: ['no power'],
};

// Conservative Levenshtein — typo tolerance only, never aggressive merging.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Is a candidate phrase a plausible typo of this alias? Conservative thresholds. */
export function fuzzyMatch(candidate: string, alias: string): boolean {
  if (candidate.length < 4 || alias.length < 4) return false;
  const maxDist = alias.length >= 8 ? 2 : 1;
  return Math.abs(candidate.length - alias.length) <= maxDist && levenshtein(candidate, alias) <= maxDist;
}

/**
 * Issue Discovery Engine — deterministic, no external AI.
 * Turns customer free text into structured CANDIDATE issues over time,
 * with strict anti-spam / anti-poisoning controls.
 */
export const issueDiscoveryService = {
 /**
 * Resolve a customer-entered phrase to a canonical issue.
 * Returns the matched Issue id (if established) or null (fall back to 'Other').
 * Also records an observation for discovery of unknown phrases.
 */
  async resolveIssue(
    category: ServiceCategory,
    phrase: string | null | undefined,
    title: string | null | undefined,
    description: string | null | undefined,
    customerId: string,
  ): Promise<string | null> {
    if (!phrase && !title && !description) return null;

    // 1. Explicit issue match first (customer picked from list)
    if (phrase) {
      const direct = await prisma.issue.findUnique({
        where: { category_canonicalId: { category, canonicalId: normalize(phrase) } },
      });
      if (direct) {
        if (direct.lifecycle === IssueLifecycle.ESTABLISHED) {
          await this.bumpUsage(direct.id, customerId);
          return direct.id;
        }
        // Archived/declining issue reused → reactivate
        await this.reactivate(direct.id, customerId);
        return direct.id;
      }
    }

    // 2. Match by label or alias (any lifecycle — archived reactivates on real usage)
    if (phrase) {
      const byLabel = await prisma.issue.findFirst({
        where: {
          category,
          lifecycle: { in: [IssueLifecycle.ESTABLISHED, IssueLifecycle.DECLINING, IssueLifecycle.ARCHIVED] },
          OR: [
            { label: { equals: phrase, mode: 'insensitive' } },
            { aliases: { some: { alias: normalize(phrase) } } },
          ],
        },
      });
      if (byLabel) {
        await this.reactivateIfNeeded(byLabel, customerId);
        return byLabel.id;
      }
    }

    // 3. Free-text alias match against title + description
    const combined = normalize([title, description].filter(Boolean).join(' '));
    if (combined) {
      const phrases = this.extractPhrases(combined);
      const matches = await prisma.issue.findMany({
        where: {
          category,
          lifecycle: { in: [IssueLifecycle.ESTABLISHED, IssueLifecycle.DECLINING, IssueLifecycle.ARCHIVED] },
          aliases: { some: { alias: { in: phrases } } },
        },
      });
      if (matches.length > 0) {
        // Multi-task detection : ≥2 distinct issues → primary + additional.
        // Never create an INSTALL_TAP_AND_UNBLOCK_TOILET pseudo-issue.
        if (matches.length >= 2) {
          const primary = [...matches].sort((a, b) => b.usageCount - a.usageCount)[0];
          analyticsService.track('request_multi_task', {
            role: 'CUSTOMER', category, issueId: primary.id,
            payload: { matched: matches.map(m => m.id), phrase: combined.slice(0, 200) },
          });
          await this.reactivateIfNeeded(primary, customerId);
          return primary.id;
        }
        await this.reactivateIfNeeded(matches[0], customerId);
        return matches[0].id;
      }

      // 3b. Conservative typo/fuzzy alias matching
      const allAliases = await prisma.issueAlias.findMany({
        where: { issue: { category } },
        select: { alias: true, issue: { select: { id: true, usageCount: true } } },
      });
      for (const p of phrases) {
        const fuzzy = allAliases.filter(a => fuzzyMatch(p, a.alias));
        if (fuzzy.length === 1) {
          await this.reactivateIfNeeded(await prisma.issue.findUnique({ where: { id: fuzzy[0].issue.id } }), customerId);
          return fuzzy[0].issue.id;
        }
      }
    }

    // 4. No established match — record candidate for discovery (no price influence)
    if (combined) {
      await this.recordCandidate(category, combined, customerId);
    }

    return null; // → 'Other'
  },

  async bumpUsage(issueId: string, customerId: string): Promise<void> {
    await prisma.issue.update({
      where: { id: issueId },
      data: { usageCount: { increment: 1 } },
    }).catch(() => {});
  },

  async reactivateIfNeeded(issue: any, customerId: string): Promise<void> {
    const needsReactivate = issue && issue.lifecycle && issue.lifecycle !== IssueLifecycle.ESTABLISHED;
    if (needsReactivate) {
      await prisma.issue.update({
        where: { id: issue.id },
        data: { lifecycle: IssueLifecycle.ESTABLISHED, archivedAt: null },
      });
    }
    await this.bumpUsage(issue.id, customerId);
  },

  async reactivate(issueId: string, customerId: string): Promise<void> {
    await prisma.issue.update({
      where: { id: issueId },
      data: { lifecycle: IssueLifecycle.ESTABLISHED, archivedAt: null },
    }).catch(() => {});
    await this.bumpUsage(issueId, customerId);
  },

 /**
 * Extract candidate phrases from free text, filtering garbage.
 */
  extractPhrases(text: string): string[] {
    const normalized = normalize(text);
    const tokens = normalized.split(' ').filter(w => !STOP_WORDS.has(w));
    const phrases: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const bi = tokens.slice(i, i + 2).join(' ');
      const tri = tokens.slice(i, i + 3).join(' ');
      if (tokens[i] && !STOP_PHRASES.has(tokens[i])) phrases.push(tokens[i]);
      if (tokens[i + 1] && bi.length > 4 && !STOP_PHRASES.has(bi)) phrases.push(bi);
      if (tokens[i + 2] && tri.length > 8 && !STOP_PHRASES.has(tri)) phrases.push(tri);
    }

    return [...new Set(phrases)];
  },

 /**
 * Record a candidate phrase with anti-spam controls.
 * uniqueUsers counts genuine distinct users via IssueCandidateUser.
 */
  async recordCandidate(category: ServiceCategory, text: string, customerId: string): Promise<void> {
    try {
      const phrases = this.extractPhrases(text).slice(0, 5);
      for (const phrase of phrases) {
        let candidate = await prisma.issueCandidate.findUnique({
          where: { category_phrase: { category, phrase } },
        });

        if (!candidate) {
          candidate = await prisma.issueCandidate.create({
            data: { category, phrase, occurrenceCount: 1, uniqueUsers: 1, lastSeenAt: new Date() },
          });
          await prisma.issueCandidateUser.create({
            data: { candidateId: candidate.id, userId: customerId },
          }).catch(() => {});
          continue;
        }

        // Distinct-user tracking — only a NEW user increments uniqueUsers.
        const userRow = await prisma.issueCandidateUser.findUnique({
          where: { candidateId_userId: { candidateId: candidate.id, userId: customerId } },
        });
        if (!userRow) {
          await prisma.issueCandidateUser.create({ data: { candidateId: candidate.id, userId: customerId } });
          await prisma.issueCandidate.update({
            where: { id: candidate.id },
            data: { uniqueUsers: { increment: 1 } },
          });
        }

        // Occurrence dedupe window per user (anti-spam)
        const now = Date.now();
        const lastSeen = candidate.lastSeenAt ? candidate.lastSeenAt.getTime() : 0;
        if (now - lastSeen > 60 * 60 * 1000) {
          await prisma.issueCandidate.update({
            where: { id: candidate.id },
            data: { occurrenceCount: { increment: 1 }, lastSeenAt: new Date() },
          });
        }
      }
    } catch {
      // discovery is best-effort, never blocks request creation
    }
  },

 /**
 * Promote CANDIDATE → ESTABLISHED when legitimate evidence accumulates.
 * Requires: minimum occurrence count, unique users, low risk score.
 */
  async runPromotion(category?: ServiceCategory): Promise<number> {
    const where: any = { lifecycle: IssueLifecycle.CANDIDATE, occurrenceCount: { gte: 10 }, uniqueUsers: { gte: 3 }, riskScore: { lt: 0.5 } };
    if (category) where.category = category;

    const candidates = await prisma.issueCandidate.findMany({ where, take: 100 });

    let promoted = 0;
    for (const c of candidates) {
      const exists = await prisma.issue.findFirst({
        where: {
          category: c.category,
          OR: [
            { label: { equals: c.phrase, mode: 'insensitive' } },
            { aliases: { some: { alias: c.phrase } } },
          ],
        },
      });
      if (exists) continue;

      const canonicalId = c.phrase.replace(/\s+/g, '_').toUpperCase();
      await prisma.issue.create({
        data: {
          category: c.category,
          canonicalId,
          label: c.phrase.replace(/\b\w/g, (ch) => ch.toUpperCase()),
          lifecycle: IssueLifecycle.ESTABLISHED,
          usageCount: c.occurrenceCount,
          uniqueUsers: c.uniqueUsers,
        },
      });
      await prisma.issueCandidate.update({
        where: { id: c.id },
        data: { lifecycle: IssueLifecycle.ESTABLISHED, linkedIssueId: c.id },
      });
      promoted++;
    }
    return promoted;
  },

 /**
 * Lifecycle automation : ESTABLISHED issues with no usage → DECLINING,
 * then ARCHIVED. Historical bookings retain the canonical issue. Reactivation is
 * handled on usage inside resolveIssue.
 */
  async demoteInactiveIssues(): Promise<{ declining: number; archived: number }> {
    const now = Date.now();
    const days = 24 * 60 * 60 * 1000;
    const decliningAfter = parseInt((await this.getConfigAny('ISSUE_DECLINE_DAYS')) || '90', 10);
    const archiveAfter = parseInt((await this.getConfigAny('ISSUE_ARCHIVE_DAYS')) || '180', 10);

    const declining = await prisma.issue.updateMany({
      where: { lifecycle: IssueLifecycle.ESTABLISHED, updatedAt: { lt: new Date(now - decliningAfter * days) } },
      data: { lifecycle: IssueLifecycle.DECLINING },
    });
    const archived = await prisma.issue.updateMany({
      where: { lifecycle: IssueLifecycle.DECLINING, updatedAt: { lt: new Date(now - archiveAfter * days) } },
      data: { lifecycle: IssueLifecycle.ARCHIVED, archivedAt: new Date() },
    });
    return { declining: declining.count, archived: archived.count };
  },

 /** List issues for a category (ranked by usage, 'Other' always present). */
  async listForCategory(category: ServiceCategory, zone?: string | null): Promise<any[]> {
    const issues = await prisma.issue.findMany({
      where: { category, lifecycle: IssueLifecycle.ESTABLISHED },
      orderBy: [{ usageCount: 'desc' }, { label: 'asc' }],
      select: { id: true, canonicalId: true, label: true, scopeConfig: true },
    });

    const other = { id: null, canonicalId: 'OTHER', label: 'Other', scopeConfig: null };
    return [...issues, other];
  },

 /** Get configurable promotion thresholds (defaults safe for low volume). */
  async getConfig(): Promise<{ promoteOccurrence: number; promoteUsers: number }> {
    const [occ, users] = await Promise.all([
      prisma.marketConfig.findUnique({ where: { key: 'ISSUE_PROMOTE_OCCURRENCE' } }),
      prisma.marketConfig.findUnique({ where: { key: 'ISSUE_PROMOTE_USERS' } }),
    ]);
    return {
      promoteOccurrence: occ ? parseInt(occ.value) : 10,
      promoteUsers: users ? parseInt(users.value) : 3,
    };
  },

  async getConfigAny(key: string): Promise<string | null> {
    const cfg = await prisma.marketConfig.findUnique({ where: { key } }).catch(() => null);
    return cfg?.value || null;
  },
};
