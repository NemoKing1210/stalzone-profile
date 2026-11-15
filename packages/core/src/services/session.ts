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
