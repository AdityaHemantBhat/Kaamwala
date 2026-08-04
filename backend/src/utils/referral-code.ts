import crypto from 'crypto';

export function generateReferralCode(): string {
  // Generate KW-XXXXXX (6 alphanumeric chars after KW-)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
  let code = 'KW-';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}
