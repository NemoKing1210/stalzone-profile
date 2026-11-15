const SUPPORTED_LOCALES = ['en', 'ru'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupported(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Persists the explicit language choice in a cookie so SSR renders the same locale.
 * `useI18n()` needs a component setup context; inside a Nuxt plugin the composer
 * is available as `nuxtApp.$i18n`.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const cookie = useCookie<string | null>('dossier_lang', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  const { locale, setLocale } = nuxtApp.$i18n;

  if (isSupported(cookie.value) && cookie.value !== locale.value) {
    await setLocale(cookie.value);
  }

  watch(locale, (value) => {
    if (isSupported(value)) cookie.value = value;
  });
});
