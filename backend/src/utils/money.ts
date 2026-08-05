// ─── Centralized money handling ───────────────────────
// All amounts are stored as Float rupees (existing architecture decision).
// Money math is never left to raw floating point: every financial value passes
// through these helpers so rounding is consistent across the system.
// Frontend displays backend values; no client-calculated prices are trusted.

/** Round to the nearest rupee — the display/authoritative unit for INR bookings. */
export function roundINR(amount: number): number {
  if (!isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Round to the nearest whole rupee (used where bookings are whole-₹). */
export function roundINRWhole(amount: number): number {
  if (!isFinite(amount)) return 0;
  return Math.round(amount);
}

/** Convert rupees to paise as an integer — never store float paise. */
export function toPaise(amount: number): number {
  return Math.round(roundINR(amount) * 100);
}

/** Money-safe equality comparison (via paise). */
export function moneyEqual(a: number, b: number, tolerancePaise = 1): boolean {
  return Math.abs(toPaise(a) - toPaise(b)) <= tolerancePaise;
}

/** Percentage of an amount, rounded to the nearest paise-safe rupee. */
export function pct(amount: number, percent: number): number {
  return roundINR((amount * percent) / 100);
}

/** Percentage of an amount, floored (used for commission so platform never over-takes). */
export function pctFloor(amount: number, percent: number): number {
  return Math.floor(roundINR(amount) * percent) / 100;
}

/** Sum of an array of rupee amounts. */
export function sumINR(values: number[]): number {
  return roundINR(values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0));
}

/** Format for display — ₹ + en-IN grouping. */
export function formatINR(amount: number): string {
  return '₹' + roundINR(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ─── Amount validation ───────────────────────────────
// Money is stored as Float (double precision) rupees — exact for integers up to
// 2^53, so "large" is only a problem at absurd magnitudes. Rather than leave
// every money entry point unguarded (which lets `1e21` / NaN / negative amounts
// into the ledger), we enforce one realistic ceiling + a finite/positive guard.
// MAX_MONEY_AMOUNT = ₹10 crore — far above any real local-service transaction
// yet safely inside double-precision exact-integer range.
export const MAX_MONEY_AMOUNT = 100_000_000; // ₹10,00,00,000

export interface AmountGuardOptions {
  /** Reject amounts <= 0 (for payments/withdrawals). Default true. */
  positive?: boolean;
  /** Allow zero explicitly (e.g. a 0 fee). Default false. */
  allowZero?: boolean;
}

/**
 * Validate + normalize a money input coming from an API body.
 * Returns `null` when the value is not a usable money amount, otherwise the
 * amount rounded to paise. Applies the realistic ceiling in both directions
 * (a negative amount beyond the cap is equally garbage).
 */
export function guardAmount(input: unknown, opts: AmountGuardOptions = {}): number | null {
  const positive = opts.positive ?? true;
  const allowZero = opts.allowZero ?? false;

  if (input === undefined || input === null || input === '') return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;            // NaN / Infinity / malformed
  if (allowZero && n === 0) return 0;
  if (positive && n <= 0) return null;             // zero + negatives
  if (!positive && n < 0) return null;
  if (Math.abs(n) > MAX_MONEY_AMOUNT) return null; // ceiling (both directions)
  return roundINR(n);
}
