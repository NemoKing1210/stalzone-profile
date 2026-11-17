import crypto from 'node:crypto';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function signature(exp: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`owner.${exp}`).digest('base64url');
}

/** Returns the signed HttpOnly cookie value: `owner.<expires ms>.<hmac>`. */
export function createSessionToken(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS): string {
  const exp = String(now + ttlMs);
  return `owner.${exp}.${signature(exp, secret)}`;
}

/** Returns the expiry timestamp for a valid token, or null for anything malformed/tampered/expired. */
export function verifySessionToken(token: string | null | undefined, secret: string, now = Date.now()): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'owner') return null;
  const [, expPart, sigPart] = parts;
  if (!expPart || !sigPart) return null;
  const exp = Number(expPart);
  if (!Number.isSafeInteger(exp) || exp <= now) return null;

  const expected = Buffer.from(signature(expPart, secret), 'utf8');
  const actual = Buffer.from(sigPart, 'utf8');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  return exp;
}

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
  // Env values that look numeric arrive as numbers through Nitro runtime config.
  const hash = config.passwordHash == null ? '' : String(config.passwordHash).trim();
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

  const password = config.password == null ? '' : String(config.password);
  if (!password) return false;
  return crypto.timingSafeEqual(sha256(plain), sha256(password));
}

/** Constant-time comparison for bearer tokens and other equal-length secrets. */
export function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Key used to count login attempts. `X-Forwarded-For` is client-controlled, so it
 * is honoured only when the deployment says a trusted reverse proxy sets it.
 */
export function loginClientKey(
  remoteAddress: string | null | undefined,
  forwardedFor: string | null | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy && forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const socket = remoteAddress?.trim();
  return socket || 'unknown';
}
