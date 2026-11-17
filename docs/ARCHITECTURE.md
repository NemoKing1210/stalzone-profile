# Architecture

## Components

```
                    ┌──────────────────────────────┐
  Browser ────────▶ │ Nuxt 4 (SSR) + Nuxt UI       │
                    │ app/  → shared · entities ·  │
                    │         features · pages     │
                    │ server/api → REST /api/v1    │
                    └──────────────┬───────────────┘
                                   │ better-sqlite3
                    ┌──────────────▼───────────────┐
  MCP agent ──────▶ │ packages/core                │
  (stdio / HTTP)    │ platform · modules           │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │ SQLite (WAL) dossier.db      │
                    └──────────────▲───────────────┘
                                   │ runSync
                    ┌──────────────┴───────────────┐
                    │ packages/sources adapters    │
                    │ EXBO · wiki · motifs ·       │
                    │ scpmodel                     │
                    └──────────────────────────────┘
```

One process: Nuxt/Nitro serves the site, the API and `/mcp`. There is no separate worker and
no second database.

## Packages

| Package | Responsibility |
|---|---|
| `packages/shared` | contracts (zod schemas), `norm`, formatting, ranks |
| `packages/core` | platform (config, DB, journal, security) and domain modules; no compatibility shims |
| `packages/sources` | pure source adapters: fetch + parse, no DB writes |
| `packages/mcp` | registry of 20 tools (12 read, 8 write), local client, stdio and HTTP transports |
| `app` | Nuxt UI slices: `shared → entities → features → pages`, plus layouts, plugins and middleware |
| `server` | Nitro routes, session, origin check, `/mcp`, `/api/v1/admin/*` |

Dependencies point one way: `app/server → mcp → core → sources/shared`. Adapters know
nothing about the DB; `core/src/modules/sync` connects them to the repositories.

Inside `packages/core` the layering is `platform ← domain modules ← application modules`.
A module exposes its public API through `modules/<name>/index.ts`; other modules import only
that index, never a sibling's `repo/` or `service/` file. The application modules that
orchestrate several domains are `maintenance` (journal-based rollback), `read-model`
(payload and export) and `sync`.

| Module | Owns |
|---|---|
| `catalog` | items, stats, effects, prices, icons, the DPS/TTK and artifact formulas |
| `identity` | character and its stats, including the `stat_definition` reference surface |
| `inventory` | owned rows, container overrides, fill |
| `builds` | saved builds and their artifacts |
| `sync` | source adapters binding, freshness rows, profile statistics |
| `setup` | the first-run state |
| `maintenance` | atomic cleanup and rollback through `event_log` |
| `read-model` | `buildPayload` and export |

Inside `app` the slices follow the same rule with ESLint enforcement
(`eslint.config.mjs`, `boundaries/dependencies`): `shared` imports only `shared`, `entities`
imports `shared`/`entities`, `features` imports `shared`/`entities` (never another feature),
and `pages` imports `shared`/`entities`/`features`. The app talks to the server only over
HTTP: it imports no `@dossier/core`, and `@dossier/shared` only through `/contracts`,
`/ranks` or `/format`.

## Read flow

1. A page calls `useDossier()` → `GET /api/v1/payload` or `/api/v1/meta`.
2. The route gets the shared `Db` from `server/utils/db.ts` (WAL, one migration per process).
3. `buildPayload` (`packages/core/src/modules/read-model/payload.ts`) assembles typed rows:
   character with derived fields, gear, catalog, derived `details[key]` cards, builds, icons
   and freshness, reading through each module's public read API.
4. DPS/TTK numbers come from one formula
   (`packages/core/src/modules/catalog/calc/weapons.ts`) using raw damage and rate of fire;
   no stored display value is substituted.
5. Container values follow the precedence override > item stats > `null`; missing data is
   `null`, never zero or an estimate.

## Write flow

```
form → useWrite → POST/PATCH/DELETE /api/v1/...
     → requireOrigin → zod → core write → event_log(before/after) → response
```

- `WriteResult { dryRun, diff:{before,after,human}, eventId? }`.
- `dryRun: true` returns the diff without changing anything; a real write closes the form
  and refreshes the payload.
- `PATCH /api/v1/character` edits identity columns and raw counters through the `stats`
  object (`manual` origin); clearing a value writes `null` and reveals the API value.
- Rollback restores the entity from the snapshot in `event_log` and writes a new `rollback`
  event; rolling back the rollback itself is not offered.
- Errors use one envelope `{ error: { code, message, details? } }` with English messages;
  the UI maps known codes through `useApiError`.

## Authorization

- Password: a scrypt hash (`NUXT_PASSWORD_HASH`) or plain (`NUXT_PASSWORD`) for dev.
- Cookie `dossier_session`: HMAC-SHA256, HttpOnly, SameSite=Lax, Secure over HTTPS.
- Middleware guards everything except `/login`, `/api/auth/login`, `/api/v1/healthz`, `/mcp`.
- `/mcp` checks `Authorization: Bearer NUXT_MCP_TOKEN` itself; without a token — 404.
- Mutations require a matching `Origin` (or Bearer for non-browser clients).
- Sign-in is rate-limited (`NUXT_LOGIN_RATE_MAX`, 60 s window).

## MCP

One tool registry (`packages/mcp/src/registry.ts`) serves both transports:

- **stdio** — `packages/mcp/src/stdio.ts`: with `DOSSIER_API_URL` it works as an HTTP
  client, otherwise it opens `DB_PATH` and works locally.
- **HTTP** — `POST /mcp`: stateless `StreamableHTTPServerTransport`, a new server per
  request, one rate limiter per process.

Writes: `dry_run` by default, `confirm: true` is mandatory, no more than 30 changes per
minute. The `dossier://schema` resource describes the tools and the write rules.

## Sources and freshness

| id | Source | What it updates |
|---|---|---|
| `exbo_base` | GitHub EXBO-Studio/stalzone-database | items and stats |
| `wiki` | stalzone.wiki API | artifacts, armor, weapons, containers, TTK |
| `motifs` | stalzone.wiki `category=other` | skins' `item.base_item_id` |
| `scpmodel` | scpmodel.ru/api/predictions | `price_quote` (TTL 15 min) |
| `icons` | EXBO repository (same commit snapshot) | `icon` rows and `.png` files in `ICONS_DIR` |
| `profile` | official STALZONE API (OAuth client credentials) | `character_stat` with origin `api`, clan/alliance, `profile_fetched_at` |

`all` means the catalog sources (`exbo_base`, `wiki`, `motifs`, `scpmodel`, `icons`).
`profile` is opt-in: it needs both client credentials and is never run implicitly.
`source.status`: `idle | ok | stale | error`; `last_ok_at`, `last_try_at`, `last_error`.
On failure data is not erased — the UI shows the age of the last successful snapshot.
A profile refresh deletes only `origin='api'` rows before inserting the current values, so
manual overrides survive and a counter missing from the response does not linger.

## First run

`POST /api/auth/login` → an authenticated HTML navigation without a character is
redirected to `/setup` by `server/middleware/auth.ts`. The wizard reads
`GET /api/v1/setup` (`needsSetup`, `catalogItems`, `profileApiConfigured`, `sources`),
creates the character with `POST /api/v1/character`, runs the catalog syncs and optionally
`profile`. API calls, `/_*`, `/icons/*` and non-HTML requests are never redirected; they
answer as themselves. Once a character exists, `/setup` redirects to `/`.

## Interface languages

The site is an English-default Nuxt app with a Russian translation, powered by
`@nuxtjs/i18n` in `no_prefix` mode. Catalogs are lazy-loaded from `i18n/locales/*.json`;
`app/plugins/i18n-locale.ts` persists the choice in the `dossier_lang` cookie.
Game data (item names, stat labels, categories from the sources) is not translated.
Server and MCP messages are English; the UI localizes error codes. Details: `docs/I18N.md`.

## Deployment

One image: the Nuxt + CLI build, a runtime with `.output`, `node_modules`, `dist`,
`db/migrations` and an empty database created on first run. The `/data` volume holds
`dossier.db` and backups. Caddy is an optional profile for TLS. See `docs/RUNBOOK.md`.
