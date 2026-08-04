import { computeUrgentFinance } from '../services/workerPlans.service';

describe('Urgent Finance ', () => {
  // Base ₹300, multiplier 1.3 → urgency premium ₹90, offer ₹390

  test('FREE (15%) commission applies only to base', () => {
    const f = computeUrgentFinance(300, 390, 90, 15);
    expect(f.commission).toBe(45); // 15% × 300
    expect(f.workerEarnings).toBe(345); // 390 - 45 (worker keeps all premium)
    expect(f.customerBoost).toBe(0);
  });

  test('PLUS (10%) commission', () => {
    const f = computeUrgentFinance(300, 390, 90, 10);
    expect(f.commission).toBe(30);
    expect(f.workerEarnings).toBe(360);
  });

  test('PRO (5%) commission', () => {
    const f = computeUrgentFinance(300, 390, 90, 5);
    expect(f.commission).toBe(15);
    expect(f.workerEarnings).toBe(375);
  });

  test('customer boost (100% to worker, commission on base only)', () => {
    // Base 300, urgent 390, customer boosts to 500 → boost 110
    const f = computeUrgentFinance(300, 500, 90, 15);
    expect(f.customerBoost).toBe(110);
    expect(f.commission).toBe(45); // still 15% × base 300 only
    expect(f.workerEarnings).toBe(455); // 500 - 45
  });

  test('urgency premium is commission-free (worker keeps full ₹90)', () => {
    // workerEarnings = finalOffer - commission; premium not part of commission base.
    // base 300 − 15% commission (45) + premium (90) = 345
    const f = computeUrgentFinance(300, 390, 90, 15);
    expect(f.workerEarnings).toBe(345);
    // The premium component the worker keeps = workerEarnings − (base − commission)
    const premiumKept = f.workerEarnings - (300 - f.commission);
    expect(premiumKept).toBe(90);
  });

  test('rounding is deterministic', () => {
    const a = computeUrgentFinance(333, 433, 100, 15);
    const b = computeUrgentFinance(333, 433, 100, 15);
    expect(a).toEqual(b);
    expect(a.commission).toBe(Math.round(333 * 0.15));
  });
});
