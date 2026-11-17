/**
 * Known API error codes. Server messages are English; the UI localizes these
 * codes so the Russian interface keeps Russian errors.
 */
export const API_ERROR_CODES = new Set([
  'UNAUTHORIZED',
  'INVALID_PASSWORD',
  'VALIDATION',
  'ORIGIN_REQUIRED',
  'ORIGIN_MISMATCH',
  'TOO_MANY_ATTEMPTS',
  'UNKNOWN_ITEM',
  'OWNED_NOT_FOUND',
  'OWNED_CONFLICT',
  'NOT_A_CONTAINER',
  'BUILD_NOT_FOUND',
  'DETAIL_NOT_FOUND',
  'ITEM_NOT_FOUND',
  'EVENT_NOT_FOUND',
  'NOT_ROLLBACKABLE',
  'NOTHING_TO_CLEAR',
  'DB_UNAVAILABLE',
  'NO_CHARACTER',
]);

type Translate = (key: string) => string;

/**
 * Localizes an API error: known code → `errors.<code>`, otherwise the server
 * message, otherwise the generic localized error. A catalog without the key
 * (vue-i18n returns the key itself) falls through to the same fallbacks.
 */
export function apiErrorMessage(
  code: string | undefined,
  fallback: string | undefined,
  t: Translate,
): string {
  if (code && API_ERROR_CODES.has(code)) {
    const key = `errors.${code}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  if (fallback) return fallback;
  return t('errors.generic');
}
