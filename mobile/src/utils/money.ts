/**
 * Shared client-side money helpers.
 *
 * Money is stored server-side as Float rupees (double precision in Postgres,
 * so integers up to 2^53 are exact). These helpers make the client robust to
 * LARGE balances and earnings: inputs are parsed losslessly (no parseInt
 * truncation), and every render goes through `formatMoney` so values group
 * correctly (en-IN) and Infinity/NaN can never surface as "₹Infinity".
 */

/** Parse a rupee input string to a number. Returns NaN for empty/invalid input. */
export function parseMoneyInput(input: string | undefined | null): number {
  const cleaned = (input ?? '').replace(/[₹,\s]/g, '');
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Format a rupee amount for display — en-IN grouping, up to 2 decimals.
 * Never throws and never renders Infinity/NaN.
 */
export function formatMoney(value: unknown, fallback = '0'): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** `₹`-prefixed display helper. */
export function formatMoneyWithSymbol(value: unknown, fallback = '0'): string {
  return '₹' + formatMoney(value, fallback);
}

/**
 * Human amount for toasts/buttons (e.g. "Added ₹1,000 to wallet").
 * Same guarantees as `formatMoneyWithSymbol`.
 */
export function formatINR(value: unknown): string {
  return formatMoneyWithSymbol(value);
}
