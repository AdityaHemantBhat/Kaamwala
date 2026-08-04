import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Encryption-at-rest for sensitive text fields (chat message content).
 *
 * AES-256-GCM with a 32-byte key held ONLY in the environment / secret manager
 * (never in the DB). Each value gets a fresh random 12-byte IV and a 16-byte
 * auth tag, so identical plaintexts never produce identical ciphertext and any
 * tampering is detected.
 *
 * Format: `enc:v1:<ivB64>:<tagB64>:<cipherB64>` — base64 never contains `:`,
 * so the prefix split is safe.
 *
 * NOTE: this is server-side encryption-at-rest, NOT end-to-end encryption. The
 * server can still decrypt (it must, to serve authorized clients). True E2EE
 * (WhatsApp-style, client-held keys) is a client-side protocol on top of this.
 */
const KEY = Buffer.from(env.MESSAGE_ENCRYPTION_KEY, 'base64');
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;

export function encryptField(plaintext: string): string {
  if (plaintext == null) return plaintext;
  if (typeof plaintext !== 'string') return String(plaintext);
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted — idempotent

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptField(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value; // legacy plaintext or empty
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
  if (!ivB64 || !tagB64 || !dataB64) return value;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Tampered / wrong key — never throw on read; surface the raw value.
    return value;
  }
}
