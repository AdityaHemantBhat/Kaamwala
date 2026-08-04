import { Prisma } from '@prisma/client';

// Whitelist device metadata so a client can never stuff arbitrary JSON
// (scripts, huge blobs) into User.deviceInfo. Only known, bounded fields
// are persisted.
const ALLOWED_FIELDS = new Set([
  'platform',
  'osVersion',
  'model',
  'brand',
  'manufacturer',
  'deviceId',
  'appVersion',
  'screen',
  'isTablet',
]);

const MAX_STRING_LENGTH = 255;

/**
 * Coerces untrusted client-supplied device info into a safe, bounded object.
 * Returns null when nothing usable is provided.
 */
export function sanitizeDeviceInfo(raw: unknown): Prisma.InputJsonValue | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : value;
  }

  return Object.keys(out).length ? (out as Prisma.InputJsonValue) : null;
}
