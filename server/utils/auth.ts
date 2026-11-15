import crypto from 'node:crypto';
import type { H3Event } from 'h3';
import {
  createSessionToken,
  isTruthy,
  loginClientKey,
  safeEqual,
  SESSION_TTL_MS,
  verifySessionToken,
} from '@dossier/core';
import { apiError, type ApiErrorBody } from './errors';

export const SESSION_COOKIE = 'dossier_session';

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
  const forwarded = getRequestHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwarded || getRequestURL(event).protocol.replace(/:$/, '');
  return protocol === 'https';
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

/** Bearer access exists only when `NUXT_MCP_TOKEN` is configured. */
export function hasValidBearer(event: H3Event): boolean {
  const token = String(useRuntimeConfig().mcpToken ?? '');
  if (!token) return false;
  const header = getRequestHeader(event, 'authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const candidate = match?.[1]?.trim();
  return !!candidate && safeEqual(candidate, token);
}

export function isAuthenticated(event: H3Event): boolean {
  return sessionExpiresAt(event) !== null || hasValidBearer(event);
}

/** Defence in depth for write routes; middleware already rejects anonymous requests. */
export function requireSession(event: H3Event): ApiErrorBody | null {
  if (sessionExpiresAt(event) === null) return apiError(event, 401, 'UNAUTHORIZED', 'Authentication required');
  return null;
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return '';
  }
}

/** Browser mutations must come from this origin; non-browser clients must present the bearer token. */
export function requireOrigin(event: H3Event): ApiErrorBody | null {
  const origin = getRequestHeader(event, 'origin');
  if (!origin) {
    if (hasValidBearer(event)) return null;
    return apiError(event, 403, 'ORIGIN_REQUIRED', 'Could not verify the request origin');
  }
  const host = getRequestHeader(event, 'x-forwarded-host') ?? getRequestHeader(event, 'host') ?? '';
  const originHost = hostOf(origin);
  if (!originHost || originHost !== host) {
    return apiError(event, 403, 'ORIGIN_MISMATCH', 'Request from a foreign origin rejected');
  }
  return null;
}

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, number[]>();

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
  const now = Date.now();
  const recent = (loginAttempts.get(ip) ?? []).filter((at) => now - at < windowMs);
  recent.push(now);
  loginAttempts.set(ip, recent);
  if (recent.length > maxAttempts) {
    return apiError(event, 429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again in a minute.');
  }
  return null;
}

/** Test hook: keeps the limiter from leaking between cases. */
export function resetLoginAttempts(): void {
  loginAttempts.clear();
}
