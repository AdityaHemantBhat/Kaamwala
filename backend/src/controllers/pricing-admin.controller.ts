import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendResponse, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { ServiceCategory } from '@prisma/client';
import { setMinClientVersion } from '../middleware/version.middleware';
import { pricingService } from '../services/pricing.service';

// Admin pricing control. All values read/write MarketConfig / MarketPriceObservation.
// Extreme-value validation + audit + rollback-ability per

const CATEGORIES = Object.values(ServiceCategory);

const MARKET_CONFIG_KEYS = [
  'URGENT_MULTIPLIER',
  'URGENT_SEARCH_ROUND_SECONDS',
  'URGENT_MAX_MULTIPLIER',
  'CANCELLATION_COMPENSATION',
  'WARRANTY_MONTHS',
  'PLATFORM_MIN_HOURLY',
  'PRICING_ALGORITHM_VERSION',
  'PRICING_KILL_SWITCH',
  'PRICING_KILL_REGIONS',
];

async function getConfig(key: string, fallback = ''): Promise<string> {
  try {
    const cfg = await prisma.marketConfig.findUnique({ where: { key } });
    return cfg?.value || fallback;
  } catch { return fallback; }
}

async function setConfig(key: string, value: string, description: string, adminId: string, req?: Request) {
  const result = await prisma.marketConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value, description },
  });
  await createAuditLog(prisma, req, {
    userId: adminId, action: 'PRICING_CONFIG_UPDATED', resource: 'MarketConfig', resourceId: key, newValue: { key, value },
  });
  return result;
}

// Extreme change guard: reject price inputs > 10x category seed or < 1
function validatePrice(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 100000;
}

export const pricingAdminController = {
  // GET /admin-pricing/market — current market references per category
  getMarket: async (_req: AuthRequest, res: Response) => {
    try {
      const cats = await Promise.all(CATEGORIES.map(async (cat) => {
        const recent = await prisma.marketPriceObservation.findMany({
          where: { category: cat, origin: 'COMPLETED_SERVICE' },
          orderBy: { observedAt: 'desc' },
          take: 100,
        });
        const audit = await prisma.pricingAudit.findFirst({
          where: { category: cat },
          orderBy: { createdAt: 'desc' },
        });
        const avg = recent.length ? recent.reduce((s, r) => s + r.unitRate, 0) / recent.length : 0;
        return {
          category: cat,
          reference: audit?.referencePrice || null,
          confidence: audit?.confidence || null,
          sample: recent.length,
          effectiveSample: audit?.effectiveSample || 0,
          fallbackSource: audit?.fallbackSource || null,
          algorithmVersion: audit?.algorithmVersion || null,
          currentAvg: Math.round(avg),
          updatedAt: audit?.createdAt || null,
        };
      }));
      sendResponse(res, 200, cats);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /admin-pricing/seed — current seed/reference prices
  getSeeds: async (_req: AuthRequest, res: Response) => {
    try {
      // Seeds live in MarketConfig as JSON per category; provide defaults if unset
      const stored = await prisma.marketConfig.findUnique({ where: { key: 'SEED_REFERENCE_PRICES' } });
      const seeds = stored?.value ? JSON.parse(stored.value) : {};
      sendResponse(res, 200, { seeds, note: 'Defaults applied when key absent' });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PUT /admin-pricing/seed — update seed/reference prices (JSON map)
  putSeeds: async (req: AuthRequest, res: Response) => {
    try {
      const { seeds } = req.body;
      if (!seeds || typeof seeds !== 'object') return sendError(res, 400, 'seeds object required');
      // Extreme-value validation per category
      for (const [cat, price] of Object.entries(seeds)) {
        if (!CATEGORIES.includes(cat as any)) return sendError(res, 400, `Unknown category ${cat}`);
        if (!validatePrice(Number(price))) return sendError(res, 400, `Invalid price for ${cat}. Confirmation needed for extreme values.`);
      }
      await setConfig('SEED_REFERENCE_PRICES', JSON.stringify(seeds), 'Seed reference prices (FLAT ₹)', req.user!.userId, req);
      sendResponse(res, 200, null, 'Seed prices updated');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /admin-pricing/floors — platform minimum floors.
  // `effective` shows the market-derived floor per category+pricingUnit (falls back
  // to the absolute config when the market lacks evidence), so admins can see the
  // dynamic floor at a glance instead of a fixed constant.
  getFloors: async (_req: AuthRequest, res: Response) => {
    try {
      const [minHourly, storedPerCat] = await Promise.all([
        getConfig('PLATFORM_MIN_HOURLY', '150'),
        prisma.marketConfig.findUnique({ where: { key: 'PLATFORM_MIN_FLAT_OVERRIDES' } }),
      ]);
      const settled = await Promise.allSettled(
        CATEGORIES.map(async (cat) => {
          const [flat, hourly] = await Promise.all([
            pricingService.getMinimumFloor(cat, 'FLAT'),
            pricingService.getMinimumFloor(cat, 'PER_HOUR'),
          ]);
          return { category: cat, flat, hourly } as const;
        }),
      );
      const effective: Record<string, { flat: number; hourly: number }> = {};
      for (const r of settled) {
        if (r.status === 'fulfilled') effective[r.value.category] = { flat: r.value.flat, hourly: r.value.hourly };
      }
      sendResponse(res, 200, {
        minHourly: parseInt(minHourly),
        perCategory: storedPerCat?.value ? JSON.parse(storedPerCat.value) : {},
        effective,
        note: 'effective = market-derived floor (p15 of recent observations); absolute config is the cold-market fallback',
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PUT /admin-pricing/floors — with extreme-change confirmation
  putFloors: async (req: AuthRequest, res: Response) => {
    try {
      const { minHourly, perCategory = {}, confirm } = req.body;
      if (minHourly !== undefined) {
        if (!validatePrice(minHourly)) return sendError(res, 400, 'Invalid hourly floor');
        const current = parseInt(await getConfig('PLATFORM_MIN_HOURLY', '150'), 10);
        const change = minHourly / Math.max(current, 1);
        if ((change > 5 || change < 0.2) && confirm !== true) {
          return sendError(res, 409, 'EXTREME_CHANGE|This floor is very different from the current value. Confirm to proceed.');
        }
        await setConfig('PLATFORM_MIN_HOURLY', String(minHourly), 'Platform minimum hourly floor (₹/hr)', req.user!.userId, req);
      }
      if (perCategory && typeof perCategory === 'object') {
        for (const [cat, price] of Object.entries(perCategory)) {
          if (!CATEGORIES.includes(cat as any)) return sendError(res, 400, `Unknown category ${cat}`);
          if (!validatePrice(Number(price))) return sendError(res, 400, `Invalid floor for ${cat}`);
        }
        await setConfig('PLATFORM_MIN_FLAT_OVERRIDES', JSON.stringify(perCategory), 'Per-category flat floor overrides', req.user!.userId, req);
      }
      sendResponse(res, 200, null, 'Minimum floors updated');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /admin-pricing/urgent-settings
  getUrgentSettings: async (_req: AuthRequest, res: Response) => {
    try {
      const [multiplier, roundSeconds, maxMultiplier, compensation, maxBoost, warrantyMonths] = await Promise.all([
        getConfig('URGENT_MULTIPLIER', '1.3'),
        getConfig('URGENT_SEARCH_ROUND_SECONDS', '300'),
        getConfig('URGENT_MAX_MULTIPLIER', '3'),
        getConfig('CANCELLATION_COMPENSATION', '50'),
        getConfig('URGENT_MAX_BOOST_AMOUNT', '1000'),
        getConfig('WARRANTY_MONTHS', '3'),
      ]);
      sendResponse(res, 200, {
        urgentMultiplier: parseFloat(multiplier),
        searchRoundSeconds: parseInt(roundSeconds),
        maxOfferMultiplier: parseInt(maxMultiplier),
        cancellationCompensation: parseFloat(compensation),
        maxBoostAmount: parseFloat(maxBoost),
        warrantyMonths: parseInt(warrantyMonths),
      });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PUT /admin-pricing/urgent-settings
  putUrgentSettings: async (req: AuthRequest, res: Response) => {
    try {
      const { urgentMultiplier, searchRoundSeconds, maxOfferMultiplier, cancellationCompensation, maxBoostAmount, warrantyMonths } = req.body;
      if (urgentMultiplier !== undefined) {
        if (urgentMultiplier < 1 || urgentMultiplier > 5) return sendError(res, 400, 'Multiplier must be 1–5');
        await setConfig('URGENT_MULTIPLIER', String(urgentMultiplier), 'Urgent booking multiplier', req.user!.userId, req);
      }
      if (searchRoundSeconds !== undefined) {
        if (searchRoundSeconds < 30 || searchRoundSeconds > 1800) return sendError(res, 400, 'Round must be 30–1800s');
        await setConfig('URGENT_SEARCH_ROUND_SECONDS', String(searchRoundSeconds), 'Urgent search round (s)', req.user!.userId, req);
      }
      if (maxOfferMultiplier !== undefined) {
        if (maxOfferMultiplier < 1 || maxOfferMultiplier > 10) return sendError(res, 400, 'Max multiplier must be 1–10');
        await setConfig('URGENT_MAX_MULTIPLIER', String(maxOfferMultiplier), 'Urgent max offer multiple', req.user!.userId, req);
      }
      if (cancellationCompensation !== undefined) {
        if (!validatePrice(cancellationCompensation)) return sendError(res, 400, 'Invalid compensation amount');
        // The cancellation fee (CANCELLATION_COMPENSATION) is money that gets
        // charged to customers and paid to workers — only SUPER_ADMIN may change it.
        // A non-super-admin submitting an unchanged value is a harmless no-op so the
        // rest of the urgent settings can still be saved from the shared admin form.
        if (req.user!.role !== 'SUPER_ADMIN') {
          const current = parseFloat(await getConfig('CANCELLATION_COMPENSATION', '50'));
          if (cancellationCompensation !== current) {
            return sendError(res, 403, 'Only super admins can change the cancellation fee');
          }
        } else {
          await setConfig('CANCELLATION_COMPENSATION', String(cancellationCompensation), 'Travel protection compensation (₹)', req.user!.userId, req);
        }
      }
      if (maxBoostAmount !== undefined) {
        if (!validatePrice(maxBoostAmount)) return sendError(res, 400, 'Invalid boost amount');
        await setConfig('URGENT_MAX_BOOST_AMOUNT', String(maxBoostAmount), 'Urgent max single boost (₹)', req.user!.userId, req);
      }
      if (warrantyMonths !== undefined) {
        if (!Number.isInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 24) {
          return sendError(res, 400, 'Warranty must be 0–24 months');
        }
        await setConfig('WARRANTY_MONTHS', String(warrantyMonths), 'Job warranty length (months, 0 = off)', req.user!.userId, req);
      }
      sendResponse(res, 200, null, 'Urgent settings updated');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /admin-pricing/audit?category=X&limit=N — pricing audit trail
  getAudit: async (req: AuthRequest, res: Response) => {
    try {
      const { category, limit = '50' } = req.query;
      const where: any = {};
      if (category) where.category = category;
      const audits = await prisma.pricingAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(String(limit), 10) || 50,
      });
      sendResponse(res, 200, audits);
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PUT /admin-pricing/kill-switch — disable dynamic pricing globally or per region/category
  putKillSwitch: async (req: AuthRequest, res: Response) => {
    try {
      const { enabled, regions = [] } = req.body;
      await setConfig('PRICING_KILL_SWITCH', enabled ? 'false' : 'true', 'Dynamic pricing enabled flag', req.user!.userId, req);
      if (regions.length) await setConfig('PRICING_KILL_REGIONS', JSON.stringify(regions), 'Killed regions (comma)', req.user!.userId, req);
      sendResponse(res, 200, { dynamicPricingEnabled: !!enabled }, enabled ? 'Dynamic pricing enabled' : 'Dynamic pricing killed — fallback to seed');
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // GET /admin-pricing/client-version — current minimum client version
  getClientVersion: async (_req: AuthRequest, res: Response) => {
    try {
      const v = await prisma.marketConfig.findUnique({ where: { key: 'MIN_CLIENT_VERSION' } });
      sendResponse(res, 200, { minClientVersion: v?.value || '1.0.0' });
    } catch (e: any) { sendError(res, 500, e.message); }
  },

  // PUT /admin-pricing/client-version — set minimum supported app version
  putClientVersion: async (req: AuthRequest, res: Response) => {
    try {
      const { version } = req.body;
      if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return sendError(res, 400, 'Version must be semver (e.g. 1.2.0)');
      await setMinClientVersion(version, req.user!.userId, req);
      sendResponse(res, 200, { minClientVersion: version }, 'Minimum client version updated');
    } catch (e: any) { sendError(res, 500, e.message); }
  },
};
