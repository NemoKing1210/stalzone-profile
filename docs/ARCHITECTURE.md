# Architecture

## Components

```
                    ┌──────────────────────────────┐
  Browser ────────▶ │ Nuxt 4 (SSR) + Nuxt UI       │
                    │ app/  → pages and forms      │
                    │ server/api → REST /api/v1    │
                    └──────────────┬───────────────┘
                                   │ better-sqlite3
                    ┌──────────────▼───────────────┐
  MCP agent ──────▶ │ packages/core                │
  (stdio / HTTP)    │ repo · calc · services       │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │ SQLite (WAL) dossier.db      │
                    └──────────────▲───────────────┘
                                   │ runSync
                    ┌──────────────┴───────────────┐
                    │ packages/sources adapters    │
                    │ EXBO · wiki · motifs ·       │
                    │ profile · scpmodel           │
                    └──────────────────────────────┘
```

One process: Nuxt/Nitro serves the site, the API and `/mcp`. There is no separate worker and
no second database.

## Packages

| Package | Responsibility |
|---|---|
| `packages/shared` | zod schemas for API/MCP, `norm`, formatting, ranks |
| `packages/core` | opening/migrating SQLite, repositories, formulas, import, writes, sync, export |
| `packages/sources` | pure source adapters: fetch + parse, no DB writes |
| `packages/mcp` | registry of 21 tools, local client, stdio and HTTP transports |
| `app` | Nuxt UI: sections, tables, modal forms, event log, i18n catalogs |
| `server` | Nitro routes, session, origin check, `/mcp`, `/api/v1/admin/*` |

Dependencies point one way: `app/server → mcp → core → sources/shared`. Adapters know
nothing about the DB; `core/services/sync.ts` connects them to the repositories.

## Read flow

1. A page calls `useDossier()` → `GET /api/v1/payload` or `/api/v1/meta`.
2. The route gets the shared `Db` from `server/utils/db.ts` (WAL, one migration per process).
3. `buildPayload` assembles gear, catalog, cards, builds and content blocks.
4. DPS/TTK numbers come from one formula (`packages/core/src/calc/weapons.ts`) using raw
   damage and rate of fire; stored legacy values are never substituted.

## Write flow

```
form → useWrite → POST/PATCH/PUT/DELETE /api/v1/...
     → requireOrigin → zod → core write → event_log(before/after) → response
```

- `WriteResult { dryRun, diff:{before,after,human}, eventId? }`.
- `dryRun: true` returns the diff without changing anything; a real write closes the form
  and refreshes the payload.
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
| `profile` | a manual snapshot of the public profile | `character.stats` |
| `scpmodel` | scpmodel.ru/api/predictions | `price_snapshot` (TTL 15 min) |

`source.status`: `idle | ok | stale | error`; `last_ok_at`, `last_try_at`, `last_error`.
On failure data is not erased — the UI shows the age of the last successful snapshot.

## Interface languages

The site is an English-default Nuxt app with a Russian translation, powered by
`@nuxtjs/i18n` in `no_prefix` mode. Catalogs are lazy-loaded from `i18n/locales/*.json`;
`app/plugins/i18n-locale.ts` persists the choice in the `dossier_lang` cookie.
Game data (item names, stat labels, categories from seeds/legacy) is not translated.
Server and MCP messages are English; the UI localizes error codes. Details: `docs/I18N.md`.

## Deployment

One image: the Nuxt + CLI build, a runtime with `.output`, `node_modules`, `dist`,
`db/migrations`, `db/seeds`. The `/data` volume holds `dossier.db` and backups. Caddy is an
optional profile for TLS. See `docs/RUNBOOK.md`.
