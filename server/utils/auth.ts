import crypto from 'node:crypto';
import type { H3Event } from 'h3';
import {
  createSessionToken,
  isTruthy,
  loginClientKey,
  safeEqual,
  SESSION_TTL_MS,
  verifySessionToken,
} from '@profile/core';
import { apiError, type ApiErrorBody } from './errors';
import { fixedWindowLimiter, type FixedWindowLimiter } from './log-limit';
import { isSameOrigin, normalizedHost } from './origin';

export const SESSION_COOKIE = 'profile_session';

let ephemeralSecret: string | null = null;

function sessionSecret(): string {
  const configured = String(useRuntimeConfig().sessionSecret ?? '');
  if (configured.length >= 32) return configured;
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] NUXT_SESSION_SECRET is missing or shorter than 32 characters; sessions will not survive a restart');
  }
  return ephemeralSecret;
}

function isSecureRequest(event: H3Event): boolean {
  const config = useRuntimeConfig();
  if (isTruthy(config.trustProxy)) {
    const forwarded = getRequestHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim();
    if (forwarded) return forwarded === 'https';
  }
  return Boolean((event.node.req.socket as { encrypted?: boolean }).encrypted);
}

export function createSession(event: H3Event): void {
  setCookie(event, SESSION_COOKIE, createSessionToken(sessionSecret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearAuthSession(event: H3Event): void {
  setCookie(event, SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 0,
  });
}

export function sessionExpiresAt(event: H3Event): number | null {
  return verifySessionToken(getCookie(event, SESSION_COOKIE), sessionSecret());
}

/** Configured MCP token, trimmed once so `/mcp` and bearer auth agree. */
export function mcpToken(): string {
  return String(useRuntimeConfig().mcpToken ?? '').trim();
}

/** Bearer access exists only when `NUXT_MCP_TOKEN` is configured. */
export function hasValidBearer(event: H3Event): boolean {
  const token = mcpToken();
  if (!token) return false;
  const header = getRequestHeader(event, 'authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const candidate = match?.[1]?.trim();
  return !!candidate && safeEqual(candidate, token);
}

export function isAuthenticated(event: H3Event): boolean {
  return sessionExpiresAt(event) !== null || hasValidBearer(event);
}

/**
 * Defence in depth for write routes; the middleware already rejects anonymous
 * requests. Bearer clients count as authenticated, exactly as the middleware does.
 */
export function requireSession(event: H3Event): ApiErrorBody | null {
  if (!isAuthenticated(event)) return apiError(event, 401, 'UNAUTHORIZED', 'Authentication required');
  return null;
}

function requestHost(event: H3Event): string {
  const config = useRuntimeConfig();
  const forwarded = isTruthy(config.trustProxy) ? getRequestHeader(event, 'x-forwarded-host') : null;
  return normalizedHost(forwarded ?? getRequestHeader(event, 'host') ?? '');
}

/** Browser mutations must come from this origin; non-browser clients must present the bearer token. */
export function requireOrigin(event: H3Event): ApiErrorBody | null {
  const origin = getRequestHeader(event, 'origin');
  if (!origin) {
    if (hasValidBearer(event)) return null;
    return apiError(event, 403, 'ORIGIN_REQUIRED', 'Could not verify the request origin');
  }
  if (!isSameOrigin(origin, requestHost(event))) {
    return apiError(event, 403, 'ORIGIN_MISMATCH', 'Request from a foreign origin rejected');
  }
  return null;
}

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 5;
let loginLimiter: FixedWindowLimiter | null = null;
let loginLimiterKey = '';

/** Recreates the limiter when the runtime budget changes (tests, config reload). */
function limiterFor(max: number, windowMs: number): FixedWindowLimiter {
  const key = `${max}:${windowMs}`;
  if (!loginLimiter || loginLimiterKey !== key) {
    loginLimiter = fixedWindowLimiter(max, windowMs);
    loginLimiterKey = key;
  }
  return loginLimiter;
}

/** Five attempts per minute per IP by default, counted before the password is checked. */
export function assertLoginAllowed(event: H3Event): ApiErrorBody | null {
  const config = useRuntimeConfig();
  const windowMs = Number(config.loginWindowMs) || LOGIN_WINDOW_MS;
  const maxAttempts = Number(config.loginRateMax) || LOGIN_MAX_ATTEMPTS;
  const ip = loginClientKey(
    getRequestIP(event),
    getRequestHeader(event, 'x-forwarded-for'),
    isTruthy(config.trustProxy),
  );
  if (!limiterFor(maxAttempts, windowMs).take(ip)) {
    return apiError(event, 429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again in a minute.');
  }
  return null;
}

/** Test hook: keeps the limiter from leaking between cases. */
export function resetLoginAttempts(): void {
  loginLimiter = null;
  loginLimiterKey = '';
}
