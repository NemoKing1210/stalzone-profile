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
  'DETAIL_NOT_FOUND',
  'ITEM_NOT_FOUND',
  'EVENT_NOT_FOUND',
  'NOT_ROLLBACKABLE',
  'EVENT_NOT_ROLLBACKABLE',
  'ROLLBACK_CONFLICT',
  'NOTHING_TO_CLEAR',
  'DB_UNAVAILABLE',
  'NO_CHARACTER',
  'CHARACTER_EXISTS',
  'CHARACTER_NOT_EMPTY',
  'STALZONE_API_NOT_CONFIGURED',
  'SYNC_IN_PROGRESS',
  'LOG_FILTER_REQUIRED',
  'INVALID_LOG_PURGE',
  'INVALID_LOGGING_SETTINGS',
  'CLIENT_LOG_RATE_LIMITED',
  'CLIENT_LOG_BATCH_TOO_LARGE',
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
