import { pricingService, normalizeZone, scopeBucket } from '../services/pricing.service';

// Mock Prisma + Redis so we can exercise calculateMarketBase deterministically.
jest.mock('../config/prisma', () => ({
  prisma: {
    marketConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    marketPriceObservation: { findMany: jest.fn() },
    pricingAudit: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
  },
}));
jest.mock('../config/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
}));
jest.mock('../services/analytics.service', () => ({
  analyticsService: { track: jest.fn() },
}));

const { prisma } = require('../config/prisma');

function obs(partial: any) {
  return {
    unitRate: 300, quantity: null, zone: 'delhi', issueId: null, scopeBucket: null,
    pairId: 'c_w', customerId: 'c', workerId: 'w', riskScore: 0,
    observedAt: new Date(), ...partial,
  };
}

function many(n: number, partial: any) {
  return Array.from({ length: n }, (_, i) => obs({ ...partial, pairId: `c_${i}`, customerId: `c${i}`, workerId: `w${i}` }));
}

describe('Pricing — normalizeZone & scopeBucket', () => {
  test('normalizes city to lowercase zone', () => {
    expect(normalizeZone('  New Delhi ')).toBe('new delhi');
    expect(normalizeZone(undefined)).toBe('UNKNOWN');
  });

  test('scopeBucket produces stable normalized signature', () => {
    expect(scopeBucket({ taps: 3 })).toBe('taps:3');
    expect(scopeBucket({ taps: 3, bhk: 2 })).toBe('bhk:2|taps:3');
    expect(scopeBucket({})).toBe(null);
    expect(scopeBucket(undefined)).toBe(null);
  });
});

describe('Pricing — market base ', () => {
  beforeEach(() => jest.clearAllMocks());

  test('zero data → configured seed, never invents a price', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([]);
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    expect(price).toBe(300); // PLUMBER FLAT seed
    const create = prisma.pricingAudit.create as jest.Mock;
    expect(create).toHaveBeenCalled();
    expect(create.mock.calls[0][0].data.fallbackSource).toBe('SEED_REFERENCE');
  });

  test('low data (1 obs) → conservative seed, NOT the single observation ', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([obs({ unitRate: 350 })]);
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    expect(price).toBe(300); // falls back to seed rather than trusting 1 datapoint
  });

  test('mature market (≥5) uses weighted median of evidence', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue(many(6, { unitRate: 350 }));
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    expect(price).toBe(350);
  });

  test('outliers do not skew the weighted median', async () => {
    const data = [100, 110, 120, 130, 9999].map(u => obs({ unitRate: u }));
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue(data);
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    expect(price).toBeLessThan(200); // outlier must not dominate
    expect(price).toBe(120);
  });

  test('hourly vs flat use separate dimensions (different seeds)', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([]);
    const flat = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    const hourly = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'PER_HOUR', null);
    expect(flat).toBe(300);
    expect(hourly).toBe(150);
  });

  test('old data decays — fresh evidence dominates ', async () => {
    const fresh = many(5, { unitRate: 300, observedAt: new Date() });
    const old = obs({ unitRate: 1000, observedAt: new Date(Date.now() - 364 * 24 * 3600000) });
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([...fresh, old]);
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    expect(price).toBe(300); // the old 1000 carries ~30% weight, fresh 300s dominate
  });

  test('suspicious observations are downweighted ', async () => {
    const clean = many(5, { unitRate: 300, riskScore: 0 });
    const risky = obs({ unitRate: 100, riskScore: 0.95 });
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([...clean, risky]);
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    expect(price).toBe(300); // risky obs carries ~no weight
  });

  test('issue-specific pricing when enough issue evidence exists ', async () => {
    const issueId = 'TAP_INSTALLATION';
    const issueObs = many(5, { issueId, unitRate: 400 });
    const otherObs = obs({ issueId: 'PIPE_BURST', unitRate: 600 });
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([...issueObs, otherObs]);
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', issueId);
    expect(price).toBe(400); // only the matching issue's evidence used
  });

  test('different scope buckets are not mixed ', async () => {
    const small = many(5, { unitRate: 200, scopeBucket: 'taps:1' });
    const big = obs({ unitRate: 800, scopeBucket: 'taps:6' });
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([...small, big]);
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null, { taps: 1 });
    expect(price).toBe(200); // scope-filtered to taps:1 only
  });

  test('kill switch falls back to seed immediately ', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue(many(6, { unitRate: 800 }));
    (prisma.marketConfig.findUnique as jest.Mock).mockImplementation(({ where }: any) => {
      if (where.key === 'PRICING_KILL_SWITCH') return Promise.resolve({ value: 'true' });
      return Promise.resolve(null);
    });
    const price = await pricingService.calculateMarketBase('PLUMBER', 'delhi', 'FLAT', null);
    expect(price).toBe(300); // dynamic pricing disabled → seed
  });
});

describe('Pricing — dynamic minimum floor ', () => {
  beforeEach(() => jest.clearAllMocks());

  function obs(unitRate: number, zone: string, riskScore = 0) {
    return { unitRate, zone, riskScore, observedAt: new Date() };
  }

  test('cold market → configured absolute floor (₹150/hr, ₹300/flat)', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([]);
    expect(await pricingService.getMinimumFloor('PLUMBER', 'PER_HOUR')).toBe(150);
    expect(await pricingService.getMinimumFloor('PLUMBER', 'FLAT')).toBe(300);
  });

  test('mature market below ₹150 → market floor falls below the old constant', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue(
      [80, 90, 100, 110, 120].map(u => obs(u, 'delhi')),
    );
    // p15 ≈ 86 → rounded to a human ₹90
    expect(await pricingService.getMinimumFloor('PLUMBER', 'PER_HOUR', 'delhi')).toBe(90);
  });

  test('fraud-flagged low quotes cannot drag the floor down', async () => {
    const data = [obs(10, 'delhi', 0.95), ...[80, 90, 100, 110, 120].map(u => obs(u, 'delhi'))];
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue(data);
    expect(await pricingService.getMinimumFloor('PLUMBER', 'PER_HOUR', 'delhi')).toBe(90);
  });

  test('zone evidence is preferred when the zone itself has enough data', async () => {
    const local = [80, 90, 100, 110, 120].map(u => obs(u, 'delhi'));
    const other = [500, 550, 600, 650, 700].map(u => obs(u, 'mumbai'));
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([...other, ...local]);
    expect(await pricingService.getMinimumFloor('PLUMBER', 'PER_HOUR', 'delhi')).toBe(90);
  });

  test('validateMinimumFloor compares against the market floor', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue(
      [80, 90, 100, 110, 120].map(u => obs(u, 'delhi')),
    );
    await expect(pricingService.validateMinimumFloor('PLUMBER', 95, 'PER_HOUR', 'delhi')).resolves.toBe(true);
    await expect(pricingService.validateMinimumFloor('PLUMBER', 80, 'PER_HOUR', 'delhi')).resolves.toBe(false);
  });

  test('admin per-category flat override (PLATFORM_MIN_FLAT_OVERRIDES) wins over 2× hourly', async () => {
    (prisma.marketPriceObservation.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.marketConfig.findUnique as jest.Mock).mockImplementation(({ where }: any) => {
      if (where.key === 'PLATFORM_MIN_FLAT_OVERRIDES') return Promise.resolve({ value: JSON.stringify({ PLUMBER: 250 }) });
      return Promise.resolve(null);
    });
    expect(await pricingService.getMinimumFloor('PLUMBER', 'FLAT')).toBe(250);
  });
});
