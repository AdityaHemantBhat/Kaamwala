import { roundINR, roundINRWhole, toPaise, moneyEqual, pct, sumINR, formatINR, guardAmount, MAX_MONEY_AMOUNT } from '../utils/money';

// centralized rounding, INR currency, no false precision.
describe('Money util — rounding & format', () => {
  test('rounds to paise-safe values', () => {
    expect(roundINR(10.005)).toBe(10.01);
    expect(roundINR(10.001)).toBe(10);
  });

  test('rounds to whole rupees for commissions', () => {
    expect(roundINRWhole(49.95)).toBe(50);
    expect(roundINRWhole(333 * 0.15)).toBe(50); // ₹49.95 → ₹50
  });

  test('converts to integer paise — never float paise', () => {
    expect(toPaise(10.1)).toBe(1010);
    expect(toPaise(333 * 0.15)).toBe(4995);
    expect(Number.isInteger(toPaise(19.99))).toBe(true);
  });

  test('money equality via paise with tolerance', () => {
    expect(moneyEqual(10, 10.001)).toBe(true);
    expect(moneyEqual(10, 10.02)).toBe(false);
  });

  test('percentage math rounds consistently', () => {
    expect(pct(333, 15)).toBe(49.95);
    expect(pct(100, 5)).toBe(5);
  });

  test('sum is rounding-safe', () => {
    expect(sumINR([10.1, 20.2, 0.1])).toBe(30.4);
  });

  test('formats with INR symbol and en-IN grouping', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
  });

  test('handles non-finite input safely', () => {
    expect(roundINR(NaN)).toBe(0);
    expect(roundINR(Infinity)).toBe(0);
  });
});

describe('Money util — guardAmount validation', () => {
  test('accepts realistic positive amounts and rounds to paise', () => {
    expect(guardAmount(100)).toBe(100);
    expect(guardAmount('150.5')).toBe(150.5);
    expect(guardAmount(99999999.999)).toBe(100000000);
  });

  test('rejects empty / non-numeric / non-finite input', () => {
    expect(guardAmount(undefined)).toBeNull();
    expect(guardAmount(null)).toBeNull();
    expect(guardAmount('')).toBeNull();
    expect(guardAmount('abc')).toBeNull();
    expect(guardAmount(NaN)).toBeNull();
    expect(guardAmount(Infinity)).toBeNull();
  });

  test('rejects zero and negatives by default (positive guard)', () => {
    expect(guardAmount(0)).toBeNull();
    expect(guardAmount(-5)).toBeNull();
  });

  test('allows zero when allowZero is set', () => {
    expect(guardAmount(0, { allowZero: true })).toBe(0);
  });

  test('enforces the realistic ceiling', () => {
    expect(guardAmount(MAX_MONEY_AMOUNT)).toBe(MAX_MONEY_AMOUNT);
    expect(guardAmount(MAX_MONEY_AMOUNT + 1)).toBeNull();
    expect(guardAmount(-MAX_MONEY_AMOUNT - 1)).toBeNull();
  });
});
