// ─── Free-Text Contact Bypass Detection ──────────────
// Deterministic pattern detection — no AI. Enforces platform contact policy.
// Detects phone numbers, emails, and common social handles in free text.

const PHONE_PATTERNS = [
  /(\+?91[\s-]?)?[6-9]\d{9}/g, // Indian mobile (10 digits, +91 optional, 6-9 start)
  /(\+?91[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{4}/g, // spaced/dashed Indian number
  /\b\d{5}[\s-]?\d{5}\b/g, // 10 digits split 5+5
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const SOCIAL_HANDLES = [
  /whatsapp\.com\/(wa\.me\/)?[a-zA-Z0-9_]+/gi,
  /instagram\.com\/[a-zA-Z0-9_.]+/gi,
  /wa\.me\/\d+/gi,
  /@[a-zA-Z0-9_]{3,}/g, // generic handle
];

export interface ContactDetectionResult {
  hasContactInfo: boolean;
  phones: string[];
  emails: string[];
  handles: string[];
}

export function detectContactInfo(text: string): ContactDetectionResult {
  const phones = new Set<string>();
  const emails = new Set<string>();
  const handles = new Set<string>();

  if (!text) return { hasContactInfo: false, phones: [], emails: [], handles: [] };

  for (const re of PHONE_PATTERNS) {
    const matches = text.match(re);
    if (matches) matches.forEach(m => phones.add(m.replace(/\s|-/g, '')));
  }
  const emailMatches = text.match(EMAIL_PATTERN);
  if (emailMatches) emailMatches.forEach(m => emails.add(m.toLowerCase()));
  for (const re of SOCIAL_HANDLES) {
    const matches = text.match(re);
    if (matches) matches.forEach(m => handles.add(m));
  }

  // Guard: don't flag dates/prices as phones (5+5 digit split could match "1000 5000")
  // Only keep 10+ digit phone candidates
  const validPhones = [...phones].filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10;
  });

  return {
    hasContactInfo: validPhones.length > 0 || emails.size > 0 || handles.size > 0,
    phones: validPhones,
    emails: [...emails],
    handles: [...handles],
  };
}

/**
 * Policy enforcement: if contact info detected in a request description,
 * return an error message (platform policy). Callers decide whether to block.
 */
export function contactPolicyError(text: string): string | null {
  const detected = detectContactInfo(text);
  if (!detected.hasContactInfo) return null;

  const parts: string[] = [];
  if (detected.phones.length) parts.push('phone numbers');
  if (detected.emails.length) parts.push('email addresses');
  if (detected.handles.length) parts.push('social handles');

  return `Contact details (${parts.join(', ')}) are not allowed in request descriptions. Please keep all communication on KaamWala — off-platform contact may lose warranty and support protection.`;
}
