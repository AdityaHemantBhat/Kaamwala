import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Keys are provisioned via scripts/generate-keys.ts. Keep them out of VCS
// (gitignored) and rotate via a secret manager in production.
const privateKey = fs.readFileSync(path.join(process.cwd(), 'keys/access.private.pem'));
const publicKey = fs.readFileSync(path.join(process.cwd(), 'keys/access.public.pem'));

export function signAccessToken(payload: object): string {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
}

/** Parse a duration string like "15m", "7d", "2h" into milliseconds. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(duration.trim());
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] || 0);
}
