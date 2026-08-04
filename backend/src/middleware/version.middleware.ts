import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { createAuditLog } from '../utils/audit';

// ─── Minimum Client Version Enforcement ─────────────
// Old app versions must not bypass pricing/verification/commission/cancellation
// rules. Backend enforces regardless of frontend version; we only hard-block
// when the protocol is incompatible (safe to decline).

const DEFAULT_MIN_VERSION = '1.0.0';
const CACHE_TTL_MS = 60_000;

// This value changes rarely (admin override) — cache it so money routes don't
// pay a DB read on every request. Invalidated on write; otherwise TTL-bounded.
let cachedMinVersion: string | null = null;
let cachedAt = 0;

async function getMinClientVersion(): Promise<string> {
  if (cachedMinVersion && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedMinVersion;
  }
  try {
    const cfg = await prisma.marketConfig.findUnique({ where: { key: 'MIN_CLIENT_VERSION' } });
    cachedMinVersion = cfg?.value || DEFAULT_MIN_VERSION;
    cachedAt = Date.now();
    return cachedMinVersion;
  } catch { return DEFAULT_MIN_VERSION; }
}

function versionToNumber(v: string): number {
  return v.split('.').reduce((acc: number, part: string) => acc * 100 + (parseInt(part, 10) || 0), 0);
}

/**
 * Middleware: rejects requests from app versions older than the configured minimum.
 * Reads `x-app-version` header. Applied to money/eligibility-sensitive routes.
 *
 * A MISSING header is treated as permissive (backwards-compatible): backend enforces
 * all rules regardless of client version , so old/unknown clients are never
 * hard-blocked just because they don't self-report. Only an EXPLICIT older version is
 * rejected, when protocol incompatibility makes safe operation impossible.
 */
export const requireMinVersion = () => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers['x-app-version'];
  // Permissive on missing header — do NOT invent '0.0.0' (that would 426 every client).
  if (!header) { next(); return; }

  const clientVersion = Array.isArray(header) ? header[0] : header;
  const minVersion = await getMinClientVersion();
  if (versionToNumber(clientVersion) < versionToNumber(minVersion)) {
    res.status(426).json({ success: false, error: 'App update required. Please update KaamWala to continue.' });
    return;
  }
  next();
};

/**
 * Thin helper for admin to set the minimum version.
 */
export async function setMinClientVersion(version: string, adminId: string, req?: Request): Promise<void> {
  await prisma.marketConfig.upsert({
    where: { key: 'MIN_CLIENT_VERSION' },
    update: { value: version },
    create: { key: 'MIN_CLIENT_VERSION', value: version, description: 'Minimum supported app version' },
  });
  cachedMinVersion = version;
  cachedAt = Date.now();
  await createAuditLog(prisma, req, {
    userId: adminId, action: 'MIN_VERSION_UPDATED', resource: 'MarketConfig', resourceId: 'MIN_CLIENT_VERSION', newValue: { version },
  });
}
