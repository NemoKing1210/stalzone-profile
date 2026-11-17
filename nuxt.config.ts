/**
 * Dev server address. `npm run dev` prints exactly what it binds to, so setting
 * `DEV_HOST=stalzone-profile.local` (in `.env` or the shell) makes the console show the
 * domain instead of 127.0.0.1. The name must resolve through the hosts file (see README).
 */
const devHost = process.env.DEV_HOST?.trim() || '127.0.0.1';
const devPort = Number(process.env.DEV_PORT) || 80;
const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(devHost);
const devAllowedHosts = [...new Set(['stalzone-profile.local', ...(isIpAddress ? [] : [devHost])])];

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
  // The app tree is organised by slices; shared pieces are auto-imported from their slice.
  components: [{ path: '~/shared/ui', pathPrefix: false }],
  imports: { dirs: ['shared/composables'] },
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  devServer: {
    host: devHost,
    port: devPort,
    // Nuxt allows localhost and IPs by default; the local domain must be explicit.
    allowedHosts: devAllowedHosts,
  },
  app: {
    // Route changes use the muted fade/2px settle defined in `main.css` (DESIGN §4.5).
    // `out-in` prevents two screens from occupying <main> at once, and `appear: false`
    // keeps the first paint static so SSR hydration does not animate the entry screen.
    pageTransition: { name: 'page', mode: 'out-in', appear: false },
    head: {
      htmlAttrs: { 'data-accent': 'green' },
      title: 'Stalzone Profile',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      script: [
        {
          // The only pre-hydration write: picks the stored accent before the first paint so
          // the page does not flash green. It reads one cosmetic key and no personal data.
          innerHTML:
            "try{var a=localStorage.getItem('dossier.accent');document.documentElement.dataset.accent=['green','amber','blue','violet','bone'].indexOf(a)>-1?a:'green'}catch(e){}",
          tagPosition: 'head',
        },
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
    // NUXT_* wins at runtime; the plain names let one `.env` pair serve the site and the CLI.
    stalzoneClientId: process.env.NUXT_STALZONE_CLIENT_ID || process.env.STALZONE_CLIENT_ID || '',
    stalzoneClientSecret: process.env.NUXT_STALZONE_CLIENT_SECRET || process.env.STALZONE_CLIENT_SECRET || '',
    stalzoneApiUrl:
      process.env.NUXT_STALZONE_API_URL || process.env.STALZONE_API_URL || 'https://eapi.stalzone.com',
    stalzoneTokenUrl:
      process.env.NUXT_STALZONE_TOKEN_URL || process.env.STALZONE_TOKEN_URL || 'https://exbo.net/oauth/token',
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
    // Tracks stay session-gated; `private` keeps a shared cache out and
    // `must-revalidate` stops a cached `302 /login` from outliving the session.
    '/audio/**': {
      headers: { 'cache-control': 'private, max-age=0, must-revalidate' },
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
