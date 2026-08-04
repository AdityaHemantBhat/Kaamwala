import { encryptField, decryptField } from '../utils/fieldEncryption';

jest.mock('../config/env', () => ({
  env: { MESSAGE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') },
}));

describe('fieldEncryption — AES-256-GCM encryption at rest', () => {
  test('round-trips plaintext through encrypt → decrypt', () => {
    const text = 'Hello, this is a private chat message with ₹ and emoji 😀';
    const cipher = encryptField(text);
    expect(cipher).not.toContain('private chat'); // not stored in plaintext
    expect(cipher.startsWith('enc:v1:')).toBe(true);
    expect(decryptField(cipher)).toBe(text);
  });

  test('same plaintext never yields identical ciphertext (random IV)', () => {
    const a = encryptField('same message');
    const b = encryptField('same message');
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  test('legacy plaintext passes through decrypt unchanged', () => {
    expect(decryptField('already stored plaintext')).toBe('already stored plaintext');
    expect(decryptField('')).toBe('');
  });

  test('encrypt is idempotent (does not double-encrypt)', () => {
    const once = encryptField('x');
    expect(encryptField(once)).toBe(once);
  });

  test('tampered ciphertext does not throw on decrypt', () => {
    const cipher = encryptField('secret');
    const flipped = cipher.slice(0, -2) + (cipher.endsWith('AA') ? 'BB' : 'AA');
    expect(() => decryptField(flipped)).not.toThrow();
  });
});
