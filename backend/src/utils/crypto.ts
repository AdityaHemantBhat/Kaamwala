import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// In production (Render), JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are set as
// environment variables (multi-line PEM, with literal \n replaced by newlines).
// In local dev, they are read from keys/access.*.pem on disk.
function loadKey(envVar: string | undefined, filename: string): Buffer | string {
  if (envVar && envVar.trim().length > 0) {
    // Environment variable — replace escaped newlines if pasted as single line
    return envVar.replace(/\\n/g, '\n');
  }
  const filePath = path.join(process.cwd(), 'keys', filename);
  return fs.readFileSync(filePath);
}

const privateKey = loadKey(env.JWT_PRIVATE_KEY, 'access.private.pem');
const publicKey = loadKey(env.JWT_PUBLIC_KEY, 'access.public.pem');

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
