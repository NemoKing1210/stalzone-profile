import { apiErrorMessage } from '../lib/apiErrorMessage';

/** Locale-bound wrapper for UI code and Pinia setup stores (not a component setup). */
export function useApiError() {
  const { t } = useNuxtApp().$i18n;

  function message(code: string | undefined, fallback?: string): string {
    return apiErrorMessage(code, fallback, t);
  }

  return { message };
}
