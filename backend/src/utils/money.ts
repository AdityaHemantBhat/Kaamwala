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
