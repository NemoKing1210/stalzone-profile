export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  app: {
    head: {
      title: 'STALZONE Dossier',
      htmlAttrs: { lang: 'ru' },
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
    public: {
      appName: 'STALZONE Dossier',
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
