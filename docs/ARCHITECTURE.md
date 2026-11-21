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
                    │ SQLite (WAL) profile.db      │
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
| `packages/mcp` | tool registry (read and write tools listed in `docs/MCP.md`), local client, stdio and HTTP transports |
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
| `inventory` | storages, gear instances, placements, container data, weapon modules, the computed loadout |
| `sync` | source adapters binding, freshness rows, profile statistics |
| `setup` | the first-run state |
| `maintenance` | scoped profile resets and rollback through `event_log` |
| `read-model` | `buildPayload` and export |

Inside `app` the slices follow the same rule with ESLint enforcement
(`eslint.config.mjs`, `boundaries/dependencies`): `shared` imports only `shared`, `entities`
imports `shared`/`entities`, `features` imports `shared`/`entities` (never another feature),
and `pages` imports `shared`/`entities`/`features`. The app talks to the server only over
HTTP: it imports no `@profile/core`, and `@profile/shared` only through `/contracts`,
`/ranks` or `/format`.

## Read flow

1. A page calls `useProfileData()` → the Pinia profile store → one Pinia Colada query for
   `GET /api/v1/payload`. Meta is derived from that payload locally. The section routes
   (`/api/v1/meta`, `/character`, `/containers`, `/catalog`) use `read-model/sections.ts`
   and build only their own section.
2. The route gets the shared `Db` from `server/utils/db.ts` (WAL, one migration per process;
   `cache_size`, `mmap_size` and `temp_store` are tuned in `platform/db/index.ts`).
3. `buildPayload` (`packages/core/src/modules/read-model/payload.ts`) loads one catalog
   context (`loadCatalogContext`) and one inventory snapshot (`loadInventorySnapshot`), then
   reuses the same card index for details, both catalogs and the flat instance lists.
   Character rows and stats are read once; freshness uses the requested character.
   A payload is cached per `Db` and rebuilt when `total_changes()` moves (30 s TTL for
   clock-derived freshness), so repeated page loads do not rebuild 40k stats rows.
4. The flat `weapons`/`armor`/`containers`/`artifacts` lists are a table view built from the
   same instances; each row adds `instanceId`, `storageId` and `placement` to the old card.
5. DPS/TTK numbers come from one formula (`packages/shared/src/calc/weapons.ts`, re-exported
   by `packages/core/src/modules/catalog/calc/weapons.ts`) using raw damage and rate of fire;
   no stored display value is substituted.
6. Container values follow the precedence `container_data` > item stats > `null`; missing
   data is `null`, never zero or an estimate.

## Client data layer

Pinia owns shared client state; Pinia Colada owns server state. `app/stores/keys.ts` is the
single list of query keys, `app/stores/profile.ts` owns the payload query, and
`app/stores/write.ts` is the only write mutation. Each successful write invalidates the
profile key; a screen that depends on another read (journal, logs, sources, setup) refreshes
that key explicitly after its mutation.

- Read or refresh: `useProfileData()` for the payload, or `useQuery` for one screen's read.
- Write: `useWrite()`; it shows the toast, records the last API error and invalidates the
  profile. No screen calls `$fetch` for profile data.
- Auth mutations, the logging page and sync use the same Pinia Colada primitives; the
  server, MCP and CLI keep their existing API and never import the app layer.
- SSR: the store and queries run on the server; the inline head script still restores the
  cosmetic theme/accent/font choice before hydration, and the first client render uses the
  same defaults when storage is unavailable.

## Inventory drag and move

`/inventory` drags go through interact.js; `app/features/inventory/ui/grid/useGridDrag.ts`
owns the shared state, and the pure geometry lives in `app/features/inventory/model`
(`gridUnder`, `grabPoint`, `ghostForGrid`, `scrollVelocity`). A press that travels past 6 px
starts the drag; a body-teleported preview (`DragPreview.vue`) follows the pointer at the
item's real footprint, while the ghost (`GridGhost.vue`) marks the snapped cells and
whether they are free. The per-move state is provided to the components that draw it
(`drag-context.ts`), so a pointer move repaints the preview and the ghost, not the page.

A drop is refused locally when the ghost is invalid (out of bounds or colliding); while a
container's display filter hides items, a same-container drop is also refused so an item
cannot disappear among cells the owner cannot see, while a move to another container stays
available. Only a valid landing becomes a write. The move is applied optimistically from
`app/features/inventory/model/pending.ts`: the item shows at its target at once, the
payload refresh runs in the background and then replaces the optimistic state. Loadout
stats and storage weights are the server's values and update with that refresh. Dragging
near the viewport edge scrolls the page while the drag continues.

## Auto-sync scheduler

`server/plugins/sync-scheduler.ts` arms one pair of timers per process (10 s after boot,
then every 60 s) and stores them on `globalThis`, so a dev hot reload replaces the previous
timers instead of duplicating them. Each tick calls `runDueBundles` in core:

- reads `sync_schedule`; a disabled schedule performs no work;
- derives each bundle's last try from `max(source.last_try_at)` and
  `next = last + interval` (now when the bundle never ran);
- checks runtime readiness — `profile` needs credentials, a character and a non-global
  region; otherwise it is skipped without touching source rows;
- runs only due bundles, in `catalog → prices → profile` order, through the same adapters
  as a manual sync.

Three in-process callers — the scheduler, `POST /api/v1/admin/sync` and the local MCP
`sync_source` tool — share one single-flight lock (`modules/sync/service/lock.ts`). A manual
call while a sync runs answers `409 SYNC_IN_PROGRESS`; a tick skips while busy; a source
failure becomes `stale`; a tick failure is caught and logged, never fatal.

The lock is process-local: an external `npm run sync`/cron is a separate process. Use the
in-process scheduler **or** cron, not both. The scheduler is single-instance by design; the
app runs as one container.

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
- Inventory writes share one placement validator (`write/placement.ts`) and one intake
  helper (`write/overflow.ts`): a new instance, a deleted stash's items and any child
  displaced by a container fill or module change are packed into the intake stash; intake
  only releases items, so a `grid` target inside it and a swap that would push an occupant
  there are rejected. The app passes `silent: true` for moves and auto-arrange, so frequent
  rearranging does not raise a toast; errors still surface.
- Rollback restores the entity from the snapshot in `event_log` and writes a new `rollback`
  event; rolling back the rollback itself is not offered.
- Errors use one envelope `{ error: { code, message, details? } }` with English messages;
  the UI maps known codes through `useApiError`.

## Authorization

- Password: a scrypt hash (`NUXT_PASSWORD_HASH`) or plain (`NUXT_PASSWORD`) for dev.
- Cookie `profile_session`: HMAC-SHA256, HttpOnly, SameSite=Lax, Secure over HTTPS.
- Middleware guards everything except `/login`, `/api/auth/login`, `/api/v1/healthz`, `/mcp`.
- `/mcp` checks `Authorization: Bearer NUXT_MCP_TOKEN` itself; without a token — 404.
- Mutations require a matching `Origin` (or Bearer for non-browser clients).
- Sign-in is rate-limited (`NUXT_LOGIN_RATE_MAX`, 60 s window).

## MCP

One tool registry (`packages/mcp/src/registry.ts`) serves both transports:

- **stdio** — `packages/mcp/src/stdio.ts`: with `PROFILE_API_URL` it works as an HTTP
  client, otherwise it opens `DB_PATH` and works locally.
- **HTTP** — `POST /mcp`: stateless `StreamableHTTPServerTransport`, a new server per
  request, one rate limiter per process.

Writes: `dry_run` by default, `confirm: true` is mandatory, no more than 30 changes per
minute. The `profile://schema` resource describes the tools and the write rules.

## Diagnostic logging

```
logger.info(msg, context, cause?)            packages/core/src/platform/logging
      │  filter by enabled + effective level for the category
      ▼
sanitize: redact secrets/URLs → truncate → fingerprint
      │
      ▼
in-memory queue (drops debug, then info; at the hard cap even warn/error)
      │  flush outside a transaction, batched; in a transaction it defers
      ▼
log_entry                                  retention: hourly, age + row cap
```

The writer is synchronous, never throws and never joins a business transaction: inside one
it schedules a retry, and if SQLite is unavailable it falls back to stderr. `warn`/`error`
flush immediately, everything else within a second or at 200 queued entries; process hooks
flush on exit. A timer is never postponed by a later entry, so sustained info traffic cannot
starve an error flush.

Ownership is per process, because SQLite has one writer and one file:

| Process | Writes | Source |
|---|---|---|
| Nitro server | HTTP requests, the built-in assistant's turn lifecycle and tool-call rows, sync runs, DB boot, retention summaries | `server` |
| Nitro server, `/mcp` | every tool call through the instrumented client | `mcp` |
| stdio MCP, local DB | tool calls through the instrumented client (`channel: stdio`) | `mcp` |
| CLI scripts | migration lines and the commands they run | `cli` |
| Browser | error/unhandled-rejection/console batches via `POST /api/v1/logs/client` | `client` |
| stdio MCP over HTTP | nothing locally; the server logs the HTTP request | — |

Request ids tie a request together: Nitro sets `x-request-id` and `event.context.requestId`,
`/mcp` reuses that response id for its tool calls and audit rows (`origin: mcp`), the
built-in assistant reuses the turn's request id and logs its tool calls with
`channel: chat`, and the browser batch keeps the client's `requestId` when it has one. Every
composition root — `/mcp`, the assistant, stdio, a scheduler tick, a CLI path — must pass a
logger and an `EventContext`; a tool call with no log row or a write with NULL `origin` is
an observability defect. The `/logs` page, the REST routes, the five MCP log tools and
`npm run logs` all read the same `queryLogs`/`logStats` services, so their filters and
counts cannot drift.

## Sources and freshness

| id | Source | What it updates |
|---|---|---|
| `exbo_base` | GitHub EXBO-Studio/stalzone-database | item identity (name, kind, category, rank, slot, weight), stat definitions and base stats |
| `wiki` | stalzone.wiki calculator APIs | per-level weapon damage, armor and artifact numbers, effect labels, container capacity/effectiveness/protection |
| `motifs` | stalzone.wiki `category=other` | skins' `item.base_item_id` |
| `scpmodel` | scpmodel.ru/api/predictions | `price_quote` (TTL 15 min) |
| `icons` | EXBO repository (same commit snapshot) | `icon` rows and `.png` files in `ICONS_DIR` |
| `profile` | official STALZONE API (OAuth client credentials) | `character_stat` with origin `api`, clan/alliance, `profile_fetched_at` |

`exbo_base` owns item identity; `wiki` never rewrites it and only binds its numeric layers
and effect labels. See [Data model](DATA-MODEL.md#source-authority) for the full matrix.

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
`app/plugins/i18n-locale.ts` persists the choice in the `profile_lang` cookie.
Game data (item names, stat labels, categories from the sources) is not translated.
Server and MCP messages are English; the UI localizes error codes. Details: `docs/I18N.md`.

## Deployment

One image: the Nuxt + CLI build, a runtime with `.output`, `node_modules`, `dist`,
`db/migrations` and an empty database created on first run. The `/data` volume holds
`profile.db` and backups. Caddy is an optional profile for TLS. See `docs/RUNBOOK.md`.
