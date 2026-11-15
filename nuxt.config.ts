export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/i18n', '@nuxt/ui', '@nuxt/eslint'],
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    langDir: 'locales',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'ru', language: 'ru-RU', name: 'Русский', file: 'ru.json' },
    ],
    detectBrowserLanguage: false,
  },
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  devServer: {
    host: '127.0.0.1',
    port: 80,
    // Nuxt allows localhost and IPs by default; the local domain must be explicit.
    allowedHosts: ['stalzone-profile.local'],
  },
  app: {
    head: {
      title: 'Stalzone Profile',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    },
  },
  runtimeConfig: {
    dbPath: './data/dossier.db',
    realm: 'ru',
    sessionSecret: '',
    passwordHash: '',
    password: '',
    mcpToken: '',
    loginRateMax: 5,
    loginWindowMs: 60_000,
    trustProxy: '',
    public: {
      appName: 'Stalzone Profile',
    },
  },
  nitro: {
    externals: {
      external: ['better-sqlite3'],
    },
  },
  routeRules: {
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    '/**': {
      headers: { 'cache-control': 'private, no-store' },
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
});
