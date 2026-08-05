/**
 * Shared wallet-transaction metadata: maps every backend TransactionType to a
 * consistent icon / color / label so the worker earnings ledger and the customer
 * payments ledger render identically. Unknown types fall back gracefully instead
 * of rendering raw enum names.
 */

import { t } from './i18n';

interface TransactionMetaBase {
  icon: string;
  color: string;
  bg: string;
}

export interface TransactionMeta extends TransactionMetaBase {
  label: string;
}

const META: Record<string, TransactionMetaBase> = {
  BOOKING_PAYMENT:                      { icon: 'briefcase-check',   color: '#1A73E8', bg: '#E8F0FE' },
  PLATFORM_COMMISSION:                  { icon: 'percent',           color: '#B06000', bg: '#FEF7E0' },
  WALLET_CREDIT:                        { icon: 'wallet',            color: '#137333', bg: '#E6F4EA' },
  WALLET_WITHDRAWAL:                    { icon: 'bank-transfer-out', color: '#0D0D0D', bg: '#EDE8DC' },
  REFERRAL_BONUS:                       { icon: 'gift',              color: '#8E44AD', bg: '#F3E8FF' },
  SUBSCRIPTION_PAYMENT:                 { icon: 'crown',             color: '#FF5C00', bg: '#FFF0E8' },
  REFUND:                               { icon: 'cash-refund',       color: '#1A73E8', bg: '#E8F0FE' },
  LOYALTY_REDEMPTION:                   { icon: 'star',              color: '#E8710A', bg: '#FEF7E0' },
  SURGE_CHARGE:                         { icon: 'trending-up',       color: '#C5221F', bg: '#FCE8E6' },
  GROUP_DISCOUNT:                       { icon: 'account-group',     color: '#137333', bg: '#E6F4EA' },
  PLUS_DISCOUNT:                        { icon: 'tag',               color: '#137333', bg: '#E6F4EA' },
  PENALTY:                              { icon: 'alert-circle',      color: '#D32F2F', bg: '#FFEBEE' },
  CANCELLATION_FEE:                     { icon: 'calendar-remove',   color: '#C5221F', bg: '#FCE8E6' },
  CANCELLATION_REFUND:                  { icon: 'cash-refund',       color: '#137333', bg: '#E6F4EA' },
  URGENT_CANCELLATION_COMPENSATION:     { icon: 'hand-coin',         color: '#137333', bg: '#E6F4EA' },
  CANCELLATION_RECOVERY:                { icon: 'currency-inr',      color: '#1A73E8', bg: '#E8F0FE' },
};

const DEFAULT_META: TransactionMetaBase = { icon: 'swap-horizontal', color: '#6B6B6B', bg: '#F0EBE0' };

const LABEL: Record<string, string> = {
  BOOKING_PAYMENT:                      'Booking payment',
  PLATFORM_COMMISSION:                  'Platform commission',
  WALLET_CREDIT:                        'Money added',
  WALLET_WITHDRAWAL:                    'Withdrawal',
  REFERRAL_BONUS:                       'Referral bonus',
  SUBSCRIPTION_PAYMENT:                 'Subscription',
  REFUND:                               'Refund',
  LOYALTY_REDEMPTION:                   'Loyalty redemption',
  SURGE_CHARGE:                         'Surge charge',
  GROUP_DISCOUNT:                       'Group discount',
  PLUS_DISCOUNT:                        'Plan discount',
  PENALTY:                              'Penalty',
  CANCELLATION_FEE:                     'Cancellation fee',
  CANCELLATION_REFUND:                  'Cancellation refund',
  URGENT_CANCELLATION_COMPENSATION:     'Cancellation compensation',
  CANCELLATION_RECOVERY:                'Cancellation recovery',
};

/** Readable label for a transaction type, with a safe fallback for unknown types. */
export function transactionLabel(type: string): string {
  return LABEL[type] ? t(LABEL[type]) : type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Icon + color + label for a transaction type. */
export function getTransactionMeta(type: string): TransactionMeta {
  const base = META[type] || DEFAULT_META;
  return { ...base, label: transactionLabel(type) };
}

/** Amounts are stored as signed INR floats; render as "+₹50" / "−₹120". */
export function formatSignedINR(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  const n = Math.round(Math.abs(amount)).toLocaleString('en-IN');
  if (amount > 0) return `+₹${n}`;
  if (amount < 0) return `−₹${n}`;
  return '₹0';
}

export interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  description?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

/** "Today" / "Yesterday" / "12 Aug" — used for ledger section headers. */
export function dayLabel(iso: string | null | undefined): string {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return t('Today');
  if (diffDays === 1) return t('Yesterday');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Group transactions into date sections, newest first. Each section is a
 * stable { title, items } entry suitable for rendering a ledger.
 */
export function groupByDay(txns: TransactionRow[]): { title: string; items: TransactionRow[] }[] {
  const ordered = [...txns].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  const sections: { title: string; items: TransactionRow[] }[] = [];
  const byDay = new Map<string, TransactionRow[]>();
  for (const txn of ordered) {
    const key = dayLabel(txn.createdAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(txn);
  }
  for (const [title, items] of byDay) sections.push({ title, items });
  return sections;
}
