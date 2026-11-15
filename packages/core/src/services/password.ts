import crypto from 'node:crypto';

export interface PasswordConfig {
  passwordHash?: string | null;
  password?: string | null;
}

const KEY_LENGTH = 64;

/** Stores passwords as `scrypt$<salt hex>$<key hex>`; the salt is random per call. */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Verifies a site password. The scrypt hash wins when configured; the plain
 * password is a development fallback. Both comparisons are constant-time and
 * hash to a fixed length so a length difference cannot leak through timing.
 */
export function verifyPassword(plain: string, config: PasswordConfig): boolean {
  const hash = config.passwordHash?.trim();
  if (hash) {
    const parts = hash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, saltHex, keyHex] = parts;
    if (!saltHex || !keyHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (!salt.length || expected.length !== KEY_LENGTH) return false;
    const actual = crypto.scryptSync(plain, salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  }

  const password = config.password ?? '';
  if (!password) return false;
  return crypto.timingSafeEqual(sha256(plain), sha256(password));
}

/** Constant-time comparison for bearer tokens and other equal-length secrets. */
export function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}
