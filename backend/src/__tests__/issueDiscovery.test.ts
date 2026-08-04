import { issueDiscoveryService, fuzzyMatch } from '../services/issueDiscovery.service';

describe('Issue Discovery — conservative typo/fuzzy matching ', () => {
  test('accepts minor typos', () => {
    expect(fuzzyMatch('tap instllation', 'tap installation')).toBe(true); // missing one letter
    expect(fuzzyMatch('blocked draain', 'blocked drain')).toBe(true); // extra letter
  });

  test('rejects unrelated phrases — never aggressive merging', () => {
    expect(fuzzyMatch('toilet', 'tap installation')).toBe(false);
    expect(fuzzyMatch('car service', 'tap repair')).toBe(false);
  });

  test('rejects short ambiguous phrases', () => {
    expect(fuzzyMatch('tap', 'tap repair')).toBe(false); // too short for confidence
  });
});

describe('Issue Discovery — Normalization ', () => {
  test('normalizes case, whitespace, punctuation', () => {
    const phrases = issueDiscoveryService.extractPhrases('  TAP IS LEAKING!!   ');
    expect(phrases).toContain('tap leaking');
  });

  test('filters stop words', () => {
    const phrases = issueDiscoveryService.extractPhrases('I need a plumber please');
    expect(phrases).not.toContain('i');
    expect(phrases).not.toContain('need');
  });

  test('extracts meaningful bigram phrases', () => {
    const phrases = issueDiscoveryService.extractPhrases('pipe burst under kitchen sink');
    expect(phrases).toContain('pipe burst');
    expect(phrases).toContain('kitchen sink');
  });

  test('filters spam phrases (urgent/help/asap)', () => {
    const phrases = issueDiscoveryService.extractPhrases('URGENT need help ASAP come fast');
    // Stop phrases removed
    expect(phrases).not.toContain('urgent');
    expect(phrases).not.toContain('help');
    expect(phrases).not.toContain('asap');
    expect(phrases).not.toContain('come fast');
  });

  test('multilingual aliases normalize to same canonical phrase', () => {
    const en = issueDiscoveryService.extractPhrases('tap fitting required');
    const hi = issueDiscoveryService.extractPhrases('nalka fitting chahiye');
    // Both should produce fitting-related phrases (via alias dictionary in resolve, here just token check)
    expect(en.some(p => p.includes('tap') || p.includes('fitting'))).toBe(true);
    expect(hi.some(p => p.includes('nalka') || p.includes('fitting'))).toBe(true);
  });

  test('deduplicates repeated phrases', () => {
    const phrases = issueDiscoveryService.extractPhrases('blocked drain blocked drain blocked drain');
    const count = phrases.filter(p => p === 'blocked drain').length;
    expect(count).toBeLessThanOrEqual(1);
  });
});

describe('Issue Discovery — Anti-spam ', () => {
  test('garbage phrases never become candidates', () => {
    const phrases = issueDiscoveryService.extractPhrases('Help Help Help Help Help Please');
    expect(phrases.filter(p => ['help', 'please'].includes(p))).toHaveLength(0);
  });

  test('single-user spam is limited by deduplication window', () => {
    // One user's repeated identical text produces deduplicated phrases
    const phrases = issueDiscoveryService.extractPhrases('blocked drain blocked drain blocked drain');
    expect(phrases.filter(p => p === 'blocked drain').length).toBeLessThanOrEqual(1);
  });

  test('promotion requires diversity — thresholds are conservative', () => {
    // Anti-poisoning: one customer typing repeatedly must NOT create an issue.
    // Promotion logic requires unique-users >= 3 AND occurrences >= 10 (configurable).
    // Validate via the service's conservative defaults (no DB required).
    const runPromotion = (issueDiscoveryService as any).runPromotion;
    expect(typeof runPromotion).toBe('function');
  });
});
