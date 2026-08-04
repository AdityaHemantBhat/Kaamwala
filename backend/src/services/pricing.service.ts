import { prisma } from '../config/prisma';
import { ServiceCategory, PriceOrigin } from '@prisma/client';
import { roundINRWhole } from '../utils/money';
import { redis } from '../config/redis';
import { analyticsService } from './analytics.service';

// ─── Geographic zone normalization ─────────────────────────────────────────
// City-level coarse zone. Future: grid cells while keeping proximity smoothing
// (no hard cliffs across a street). Keep city as the stable, data-dense key.
export function normalizeZone(city?: string | null): string {
  if (!city) return 'UNKNOWN';
  return city.trim().toLowerCase();
}

/**
 * Normalized scope signature — a compact, stable key so pricing can
 * be scope-aware (1 tap vs 6 taps, 1 BHK vs 4 BHK) without storing raw JSON.
 */
export function scopeBucket(scope?: any): string | null {
  if (!scope || typeof scope !== 'object') return null;
  const keys = Object.keys(scope).sort();
  if (!keys.length) return null;
  const parts: string[] = [];
  for (const k of keys) {
    const v = scope[k];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${k}:${String(v).toLowerCase()}`);
  }
  return parts.length ? parts.join('|') : null;
}

// ─── Robust statistics (no naive averages) ────────────────────────────────
function weightedMedian(values: { value: number; weight: number }[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return sorted[Math.floor(sorted.length / 2)].value;

  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= totalWeight / 2) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

/** Linear-interpolated percentile of a sorted numeric array (robust for small n). */
function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─── Confidence calculation ───────────────────────────────────────────────
interface ConfidenceInput {
  effectiveSample: number; // diversity-adjusted
  recencyFactor: number; // 0..1
  relevance: number; // 0..1 (zone+issue+scope match)
}
function confidenceScore({ effectiveSample, recencyFactor, relevance }: ConfidenceInput): number {
  const volume = Math.min(effectiveSample / 30, 1);
  return Math.round((volume * 0.5 + recencyFactor * 0.3 + relevance * 0.2) * 100);
}

// ─── Seed/reference prices (admin-researched, not invented) ──────────────
const SEED_BASELINE: Record<string, Record<string, number>> = {
  PLUMBER:        { FLAT: 300, PER_HOUR: 150 },
  ELECTRICIAN:    { FLAT: 350, PER_HOUR: 175 },
  CARPENTER:      { FLAT: 400, PER_HOUR: 200 },
  MAID:           { FLAT: 250, PER_HOUR: 125 },
  DRIVER:         { FLAT: 500, PER_HOUR: 250 },
  PAINTER:        { FLAT: 500, PER_HOUR: 250 },
  AC_TECHNICIAN:  { FLAT: 450, PER_HOUR: 225 },
  PEST_CONTROL:   { FLAT: 800, PER_HOUR: 400 },
  GARDENER:       { FLAT: 300, PER_HOUR: 150 },
  COOK:           { FLAT: 500, PER_HOUR: 250 },
  TUTOR:          { FLAT: 400, PER_HOUR: 200 },
  SECURITY_GUARD: { FLAT: 450, PER_HOUR: 225 },
  NURSE:          { FLAT: 600, PER_HOUR: 300 },
  BABYSITTER:     { FLAT: 350, PER_HOUR: 175 },
};

const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_OBS_FOR_ISSUE = 5;

// Dynamic platform minimum floor — market-derived so a healthy market
// can settle below the old fixed ₹150 constant while a cold market keeps the
// configured absolute safety floor. Same conservative philosophy as the market
// base: never trust too little data.
const MIN_FLOOR_OBS = 5; // trust the market floor only with this much evidence
const FLOOR_PERCENTILE = 0.15; // p15 — 85% of legit transactions sit above it
const FLOOR_RECENCY_MS = 180 * 24 * 60 * 60 * 1000; // 6 months of evidence
const FLOOR_SUSPICIOUS_RISK = 0.5; // fraud-flagged observations are excluded
const FLOOR_ROUND_TO = 10; // floor reads as a human price (nearest ₹10)

export const pricingService = {
 /**
 * Calculate a hyperlocal market base price.
 * Signals (strongest first): COMPLETED_SERVICE / FINAL_AGREED observations,
 * then configured seed reference when confidence is low.
 * Never invents prices; low data → conservative fallback.
 */
  async calculateMarketBase(
    category: ServiceCategory,
    city?: string | null,
    pricingUnit: string = 'FLAT',
    issueId?: string | null,
    scope?: any,
  ): Promise<number> {
    const zone = normalizeZone(city);
    const scopeBucketKey = scopeBucket(scope);
    const algorithmVersion = await this.getConfig('PRICING_ALGORITHM_VERSION', 'LOCAL_MARKET_V1');

    // Cache : fast lookups, key includes every pricing dimension.
    // Never leak Area A/category X into Area B/category Y.
    const cacheKey = `price:${category}:${pricingUnit}:${zone}:${issueId || 'none'}:${scopeBucketKey || 'none'}:${algorithmVersion}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return Number(cached);
    } catch { /* redis down — compute directly */ }

    const reference = await this._computeMarketBase(category, zone, pricingUnit, issueId, scopeBucketKey, scope, algorithmVersion);

    // Cache with TTL (configurable, default 5 min). Invalidate handled by kill-switch/seed paths.
    try {
      const ttl = parseInt(await this.getConfig('PRICING_CACHE_TTL_SECONDS', '300'), 10);
      await redis.set(cacheKey, String(reference), { EX: Math.max(30, Math.min(ttl, 3600)) });
    } catch {}

    return reference;
  },

  async _computeMarketBase(
    category: ServiceCategory,
    zone: string,
    pricingUnit: string,
    issueId: string | null | undefined,
    scopeBucketKey: string | null,
    scope: any,
    algorithmVersion: string,
  ): Promise<number> {
    // Kill switch — global or per-region, fall back to safe seed immediately
    const killSwitch = await this.getConfig('PRICING_KILL_SWITCH', 'false');
    const killRegions = (await this.getConfig('PRICING_KILL_REGIONS', '')).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (killSwitch === 'true' || (zone !== 'UNKNOWN' && killRegions.includes(zone))) {
      return await this._seedFor(category, pricingUnit, zone, algorithmVersion, 'KILL_SWITCH');
    }

    const now = Date.now();

    // 1. Gather legitimate completed observations (strongest signal)
    const observations = await prisma.marketPriceObservation.findMany({
      where: {
        category,
        pricingUnit,
        origin: { in: [PriceOrigin.COMPLETED_SERVICE, PriceOrigin.FINAL_AGREED] },
        observedAt: { gte: new Date(now - MAX_AGE_MS) }, // 1yr window
      },
      select: {
        unitRate: true, quantity: true, zone: true, issueId: true, scopeBucket: true,
        pairId: true, customerId: true, workerId: true, observedAt: true, riskScore: true,
      },
      orderBy: { observedAt: 'desc' },
      take: 500,
    });

    // 2. Relevance tiers (most specific first) — scope → issue → category.
    const zoneMatches = observations.filter(o => !zone || o.zone === zone || o.zone === null);
    const issueMatches = issueId ? zoneMatches.filter(o => o.issueId === issueId) : zoneMatches;
    const scopeMatches = scopeBucketKey ? issueMatches.filter(o => o.scopeBucket === scopeBucketKey) : issueMatches;

    let useObservations = scopeMatches;
    let fallbackSource = issueId ? (scopeBucketKey ? 'SCOPE_ISSUE_ZONE' : 'ISSUE_ZONE') : 'CATEGORY_ZONE';
    let relevance = scopeBucketKey ? 1 : 0.9;

    if (useObservations.length < MIN_OBS_FOR_ISSUE && issueMatches.length >= MIN_OBS_FOR_ISSUE) {
      useObservations = issueMatches;
      fallbackSource = 'ISSUE_ZONE';
      relevance = 0.9;
    } else if (useObservations.length < MIN_OBS_FOR_ISSUE && zoneMatches.length >= MIN_OBS_FOR_ISSUE) {
      useObservations = zoneMatches;
      fallbackSource = 'CATEGORY_ZONE';
      relevance = 0.8;
    } else if (useObservations.length < MIN_OBS_FOR_ISSUE) {
      useObservations = observations;
      fallbackSource = 'CATEGORY_GLOBAL';
      relevance = 0.6;
    }

    if (useObservations.length >= MIN_OBS_FOR_ISSUE) {
      // 3. Diversity-aware effective sample (repeated pairs diminish)
      const pairSet = new Set(useObservations.map(o => o.pairId || `${o.customerId}_${o.workerId}`));
      const effectiveSample = Math.min(useObservations.length, Math.max(pairSet.size, 1) + Math.floor(useObservations.length / 3));

      // 4. Dominance downweighting — one account/hotel can't dominate.
      const customerCounts = new Map<string, number>();
      const workerCounts = new Map<string, number>();
      for (const o of useObservations) {
        customerCounts.set(o.customerId || '?', (customerCounts.get(o.customerId || '?') || 0) + 1);
        workerCounts.set(o.workerId || '?', (workerCounts.get(o.workerId || '?') || 0) + 1);
      }

      // 5. Weighted median: recency decay + risk + dominance.
      const weighted = useObservations.map(o => ({
        value: o.unitRate,
        weight: (1 - Math.min((now - o.observedAt.getTime()) / MAX_AGE_MS, 1) * 0.7)
 * (1 - o.riskScore)
 * (1 / (1 + 0.2 * ((customerCounts.get(o.customerId || '?') || 1) - 1)))
 * (1 / (1 + 0.1 * ((workerCounts.get(o.workerId || '?') || 1) - 1))),
      }));
      const recencyFactor = useObservations.reduce((acc, o) => acc + (1 - Math.min((now - o.observedAt.getTime()) / MAX_AGE_MS, 1)), 0) / useObservations.length;
      const reference = weightedMedian(weighted);
      const confidence = confidenceScore({ effectiveSample, recencyFactor, relevance });

      // 6. Stability — no wild jumps without strong evidence.
      const lastAudit = await prisma.pricingAudit.findFirst({
        where: { category, zone, pricingUnit },
        orderBy: { createdAt: 'desc' },
      });
      let finalReference = reference;
      if (lastAudit && lastAudit.referencePrice > 0) {
        const change = Math.abs(reference - lastAudit.referencePrice) / lastAudit.referencePrice;
        if (change > 0.4 && confidence < 60) {
          finalReference = lastAudit.referencePrice * (reference > lastAudit.referencePrice ? 1.4 : 0.6);
        }
      }

      // 7. Shadow pricing — alternate reference computed alongside, never shown.
      const shadowVersion = await this.getConfig('PRICING_SHADOW_VERSION', '');
      let shadowReference: number | null = null;
      if (shadowVersion && shadowVersion !== algorithmVersion) {
        const sortedVals = weighted.map(w => w.value).sort((a, b) => a - b);
        const n = sortedVals.length;
        if (n >= 5) {
          const trim = Math.floor(n * 0.2);
          const core = sortedVals.slice(trim, n - trim);
          shadowReference = Math.round(core.reduce((s, v) => s + v, 0) / core.length);
        }
      }

      // 8. Audit trail — explain why this price exists
      await prisma.pricingAudit.create({
        data: {
          category, issueId, scope, pricingUnit, zone,
          referencePrice: roundINRWhole(finalReference),
          confidence, fallbackSource, algorithmVersion,
          effectiveSample,
          metadata: { observations: useObservations.length, pairs: pairSet.size, scopeBucketKey, shadowVersion, shadowReference },
        },
      }).catch(() => {});

      return roundINRWhole(finalReference);
    }

    // 9. Cold start → configured seed reference (never invent)
    return await this._seedFor(category, pricingUnit, zone, algorithmVersion, 'SEED_REFERENCE');
  },

 /**
 * Seed/reference price — reads admin-configured MarketConfig SEED_REFERENCE_PRICES
 * (a JSON category→₹ map), falling back to the researched in-code baseline.
 */
  async _seedFor(category: ServiceCategory, pricingUnit: string, zone: string, algorithmVersion: string, fallbackSource: string): Promise<number> {
    let seed = SEED_BASELINE[category]?.[pricingUnit] || SEED_BASELINE[category]?.FLAT || 300;
    try {
      const stored = await prisma.marketConfig.findUnique({ where: { key: 'SEED_REFERENCE_PRICES' } });
      if (stored?.value) {
        const seeds = JSON.parse(stored.value);
        if (seeds[category] !== undefined) seed = Number(seeds[category]) || seed;
      }
    } catch {}
    const rounded = roundINRWhole(seed);
    prisma.pricingAudit.create({
      data: {
        category, pricingUnit, zone,
        referencePrice: rounded, confidence: 10, fallbackSource,
        algorithmVersion, effectiveSample: 0, metadata: { reason: 'insufficient_evidence', source: 'SEED_REFERENCE_PRICES' },
      },
    }).catch(() => {});
    // Observability — fallback usage is a signal for the admin.
    analyticsService.track('pricing_fallback_used', {
      category, zone: zone === 'UNKNOWN' ? undefined : zone,
      payload: { fallbackSource, reference: rounded, algorithmVersion },
    });
    return rounded;
  },

 /**
 * Price recommendation for normal Post Requests.
 * Returns a reference + honest range. Range widens as confidence drops
 * never false precision. recommendationExposed=true so any
 * accepted amount is never treated as fully independent evidence.
 */
  async getRecommendation(
    category: ServiceCategory,
    zone: string | null | undefined,
    pricingUnit: string = 'FLAT',
    issueId?: string | null,
    scope?: any,
  ): Promise<{
    reference: number;
    rangeLow: number;
    rangeHigh: number;
    confidence: number;
    fallbackSource: string | null;
    recommendationExposed: boolean;
  }> {
    const reference = await this.calculateMarketBase(category, zone, pricingUnit, issueId || null, scope);
    const algorithmVersion = await this.getConfig('PRICING_ALGORITHM_VERSION', 'LOCAL_MARKET_V1');
    const audit = await prisma.pricingAudit.findFirst({
      where: { category, pricingUnit, zone: normalizeZone(zone), algorithmVersion },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    const confidence = audit?.confidence ?? 0;

    // Range band scales inversely with confidence (no false precision at low confidence)
    const band = confidence >= 70 ? 0.1 : confidence >= 40 ? 0.2 : 0.3;
    const rangeLow = Math.max(0, Math.round(reference * (1 - band)));
    const rangeHigh = Math.round(reference * (1 + band));

    return {
      reference,
      rangeLow,
      rangeHigh,
      confidence,
      fallbackSource: audit?.fallbackSource ?? null,
      recommendationExposed: true,
    };
  },

 /**
 * Record a completed-service observation as legitimate market evidence.
 * Called on booking completion (normal) — never for urgent-only amounts.
 */
  async recordObservation(input: {
    category: ServiceCategory;
    issueId?: string | null;
    scope?: any;
    pricingUnit: string;
    zone?: string | null;
    unitRate: number;
    quantity?: number | null;
    totalAmount: number;
    origin: PriceOrigin;
    customerId?: string | null;
    workerId?: string | null;
    bookingId?: string | null;
    recommendationExposed?: boolean;
    experimentVersion?: string;
    riskScore?: number;
  }): Promise<void> {
    try {
      await prisma.marketPriceObservation.create({
        data: {
          category: input.category,
          issueId: input.issueId || null,
          scope: input.scope || null,
          scopeBucket: scopeBucket(input.scope),
          pricingUnit: input.pricingUnit,
          zone: normalizeZone(input.zone),
          unitRate: input.unitRate,
          quantity: input.quantity || null,
          totalAmount: input.totalAmount,
          origin: input.origin,
          customerId: input.customerId || null,
          workerId: input.workerId || null,
          pairId: input.customerId && input.workerId ? `${input.customerId}_${input.workerId}` : null,
          bookingId: input.bookingId || null,
          recommendationExposed: input.recommendationExposed || false,
          experimentVersion: input.experimentVersion || null,
          riskScore: input.riskScore || 0,
        },
      });
    } catch {}
  },

 /**
 * Current effective platform minimum floor for a category+pricingUnit.
 * Market-derived (p15 of recent legitimate observations, zone-aware) when there
 * is enough evidence; otherwise the configured absolute floor
 * (PLATFORM_MIN_HOURLY, per-category overrides). Returns a whole, human ₹ value.
 */
  async getMinimumFloor(
    category: ServiceCategory | string,
    pricingUnit: string = 'FLAT',
    zone?: string | null,
  ): Promise<number> {
    const unit = pricingUnit === 'PER_HOUR' ? 'PER_HOUR' : 'FLAT';
    const zoneKey = normalizeZone(zone);

    // Cache like the market base — the floor only shifts as evidence accrues.
    const cacheKey = `floor:${category}:${unit}:${zoneKey}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return Number(cached);
    } catch { /* redis down — compute directly */ }

    const floor = (await this._marketFloor(category as ServiceCategory, unit, zoneKey))
      ?? (await this._absoluteFloor(category as ServiceCategory, unit));

    try {
      const ttl = parseInt(await this.getConfig('PRICING_CACHE_TTL_SECONDS', '300'), 10);
      await redis.set(cacheKey, String(floor), { EX: Math.max(30, Math.min(ttl, 3600)) });
    } catch {}

    return floor;
  },

 /** Configured absolute safety floor — used when the market has too little data. */
  async _absoluteFloor(category: ServiceCategory, pricingUnit: 'FLAT' | 'PER_HOUR'): Promise<number> {
    const cat = category as string;
    const minHourly = parseInt(await this.getConfig(`PLATFORM_MIN_HOURLY_${cat}`, ''), 10)
      || parseInt(await this.getConfig('PLATFORM_MIN_HOURLY', '150'), 10);
    if (pricingUnit === 'PER_HOUR') return minHourly;
    // Per-category flat override: legacy per-key form, then the admin JSON map, then ~2hr minimum.
    const perCatKey = parseInt(await this.getConfig(`PLATFORM_MIN_FLAT_${cat}`, ''), 10);
    if (perCatKey) return perCatKey;
    try {
      const map = await prisma.marketConfig.findUnique({ where: { key: 'PLATFORM_MIN_FLAT_OVERRIDES' } });
      if (map?.value) {
        const parsed = JSON.parse(map.value);
        if (parsed[cat] !== undefined && Number(parsed[cat]) > 0) return Math.round(Number(parsed[cat]));
      }
    } catch {}
    return minHourly * 2;
  },

 /**
 * Market-derived floor: p15 of recent legitimate observations for the
 * category+pricingUnit, preferring the zone's own evidence. Null when there is
 * not enough data — caller falls back to the absolute floor.
 */
  async _marketFloor(category: ServiceCategory, pricingUnit: 'FLAT' | 'PER_HOUR', zoneKey: string): Promise<number | null> {
    const observations = await prisma.marketPriceObservation.findMany({
      where: {
        category,
        pricingUnit,
        origin: { in: [PriceOrigin.COMPLETED_SERVICE, PriceOrigin.FINAL_AGREED] },
        observedAt: { gte: new Date(Date.now() - FLOOR_RECENCY_MS) },
      },
      select: { unitRate: true, zone: true, riskScore: true },
      orderBy: { observedAt: 'desc' },
      take: 200,
    }).catch(() => []);

    // Fraud-flagged observations must not drag the floor down to a bogus ₹1 quote.
    const clean = observations.filter(o => o.riskScore < FLOOR_SUSPICIOUS_RISK);
    if (clean.length < MIN_FLOOR_OBS) return null;

    let pool = clean;
    if (zoneKey !== 'UNKNOWN') {
      const local = clean.filter(o => !o.zone || o.zone === zoneKey);
      if (local.length >= MIN_FLOOR_OBS) pool = local;
    }

    const sorted = pool.map(o => o.unitRate).sort((a, b) => a - b);
    const p = percentile(sorted, FLOOR_PERCENTILE);
    // Round to a human-friendly ₹10 so the message reads "₹90" not "₹88".
    return Math.max(1, Math.round(p / FLOOR_ROUND_TO) * FLOOR_ROUND_TO);
  },

 /**
 * Validate worker rate against the (market-derived) platform minimum floor.
 * Optional per-category overrides: PLATFORM_MIN_HOURLY_<CATEGORY>, PLATFORM_MIN_FLAT_<CATEGORY>,
 * PLATFORM_MIN_FLAT_OVERRIDES (admin JSON map).
 */
  async validateMinimumFloor(
    category: ServiceCategory,
    price: number,
    pricingUnit: string = 'FLAT',
    zone?: string | null,
  ): Promise<boolean> {
    const floor = await this.getMinimumFloor(category, pricingUnit, zone);
    return price >= floor;
  },

  async getConfig(key: string, fallback: string): Promise<string> {
    try {
      const cfg = await prisma.marketConfig.findUnique({ where: { key } });
      return cfg?.value || fallback;
    } catch { return fallback; }
  },
};
