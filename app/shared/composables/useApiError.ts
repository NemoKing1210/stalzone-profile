import { apiErrorMessage } from '../lib/apiErrorMessage';

/** Locale-bound wrapper for UI code. */
export function useApiError() {
  const { t } = useI18n();

  function message(code: string | undefined, fallback?: string): string {
    return apiErrorMessage(code, fallback, t);
  }

  return { message };
}
