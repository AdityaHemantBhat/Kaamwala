import { Request } from 'express';
import { prisma } from '../config/prisma';
import { createAuditLog } from '../utils/audit';

// ─── Feature Flags ────────────────────────────────
// Controlled rollout for major marketplace features via MarketConfig.
// Backend-authoritative; frontend never decides feature availability.

const DEFAULT_FLAGS: Record<string, boolean> = {
  LOCAL_PRICING: true,
  ISSUE_DISCOVERY: true,
  ISSUE_SPECIFIC_PRICING: false, // enable once enough trustworthy evidence
  PRICE_RECOMMENDATIONS: false, // staged rollout
  URGENT_PRICING: true,
  DYNAMIC_URGENT_MULTIPLIER: false, // future bounded surge
  CONTACT_BYPASS_DETECTION: true,
  TRAVEL_PROTECTION: true,
  SCOPE_CHANGE_ORDERS: true,
  SHADOW_PRICING: false,
};

export const featureFlagsService = {
 /**
 * Resolve a feature flag. Reads MarketConfig; falls back to default.
 */
  async isEnabled(flag: string): Promise<boolean> {
    try {
      const cfg = await prisma.marketConfig.findUnique({ where: { key: `FLAG_${flag}` } });
      if (cfg) return cfg.value === 'true';
    } catch {}
    return DEFAULT_FLAGS[flag] ?? false;
  },

 /**
 * Set a feature flag (admin).
 */
  async setFlag(flag: string, enabled: boolean, adminId: string, req?: Request): Promise<void> {
    await prisma.marketConfig.upsert({
      where: { key: `FLAG_${flag}` },
      update: { value: String(enabled) },
      create: { key: `FLAG_${flag}`, value: String(enabled), description: `Feature flag: ${flag}` },
    });
    await createAuditLog(prisma, req, {
      userId: adminId, action: 'FEATURE_FLAG_UPDATED', resource: 'MarketConfig', resourceId: `FLAG_${flag}`, newValue: { enabled },
    });
  },

  listDefaults(): Record<string, boolean> {
    return { ...DEFAULT_FLAGS };
  },
};
