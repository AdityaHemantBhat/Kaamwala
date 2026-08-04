import { detectContactInfo, contactPolicyError } from '../services/contactDetector.service';

describe('Contact Detector ', () => {
  test('detects Indian mobile numbers', () => {
    const r = detectContactInfo('Call me at 9876543210 please');
    expect(r.hasContactInfo).toBe(true);
    expect(r.phones).toContain('9876543210');
  });

  test('detects +91 prefixed numbers', () => {
    const r = detectContactInfo('WhatsApp me +91 98765 43210');
    expect(r.hasContactInfo).toBe(true);
  });

  test('detects spaced/dashed numbers', () => {
    expect(detectContactInfo('my number is 98765-43210').hasContactInfo).toBe(true);
    expect(detectContactInfo('call 98765 43210 now').hasContactInfo).toBe(true);
  });

  test('detects emails', () => {
    const r = detectContactInfo('Email me at ramesh.kumar@gmail.com');
    expect(r.hasContactInfo).toBe(true);
    expect(r.emails).toContain('ramesh.kumar@gmail.com');
  });

  test('detects social handles / wa.me links', () => {
    expect(detectContactInfo('message wa.me/9876543210').hasContactInfo).toBe(true);
    expect(detectContactInfo('follow instagram.com/kaamwala').hasContactInfo).toBe(true);
  });

  test('does not flag prices/dates as phones', () => {
    const r = detectContactInfo('Budget is 1000 and date 2000 5000 no wait');
    // Only flags 10+ digit phone candidates
    expect(r.phones.filter(p => p.replace(/\D/g, '').length >= 10)).toHaveLength(0);
  });

  test('clean text has no contact info', () => {
    expect(detectContactInfo('Need plumbing repair in kitchen, tap leaking').hasContactInfo).toBe(false);
  });

  test('policy error returns helpful message', () => {
    const err = contactPolicyError('Call me at 9876543210');
    expect(err).toContain('phone numbers');
    expect(err).toContain('KaamWala');
  });

  test('policy error null for clean text', () => {
    expect(contactPolicyError('Install new water tap in bathroom')).toBeNull();
  });
});
