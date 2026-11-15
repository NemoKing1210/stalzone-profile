# AGENTS.md — how to change this repository safely

A personal STALZONE dossier: **SQLite is the single source of truth**, Nuxt 4 serves the
site and the REST API, Nitro serves `/mcp`, and `packages/mcp` gives an agent the same data.
One process, one database, no separate worker.

Before the first change read: `README.md` (running it), `docs/ARCHITECTURE.md` (read/write
flows), `docs/DATA-MODEL.md` (invariants), `docs/API.md`, `docs/MCP.md`, and `docs/I18N.md`
(interface languages). This file holds rules, not a copy of the documentation.

## Commands

| Task                              | Command                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Install                           | `npm ci`                                                                     |
| Develop                           | `npm run dev` → http://stalzone-profile.local                                 |
| Migrations                        | `npm run db:migrate`                                                         |
| Rebuild the local DB from seeds   | `npm run db:reset && npm run import:legacy`                                  |
| Import seeds (idempotent)         | `npm run import:legacy`                                                      |
| Unit + integration                | `npm test` (`npm run test:integration` — integration only)                   |
| Full check                        | `npm run check` — typecheck + lint + tests                                   |
| E2E                               | `npm run e2e` — builds and starts the server on `:3100` itself               |
| Number parity with legacy         | `npm run golden` — expect `0 mismatches`, `legacyDeltas: []`                 |
| Site build                        | `npm run build` → `.output/`                                                 |
| CLI/MCP build                     | `npm run build:cli` → `dist/cli.js`, `dist/mcp-stdio.js`                     |
| MCP stdio                         | `npm run mcp` (local DB) or `DOSSIER_API_URL=… MCP_TOKEN=… npm run mcp`      |
| MCP smoke                         | `npm run smoke:mcp`                                                          |
| Source sync                       | `npm run sync [exbo_base\|wiki\|motifs\|profile\|scpmodel] [-- --force]`     |
| Backup                            | `npm run backup`                                                             |
| Password hash                     | `npm run hash-password -- 'password'`                                        |

`db:reset` deletes the file at `DB_PATH` (and `-wal`/`-shm`). Before running it, make sure
`DB_PATH` points at a local or test database, not the working one.

## Code map

| Path                         | Responsibility                                                           |
| ---------------------------- | ------------------------------------------------------------------------ |
| `packages/shared`            | zod schemas for API/MCP, `norm`, formatting, ranks, hashes               |
| `packages/core/src/db`       | opening SQLite, migrations                                               |
| `packages/core/src/repo`     | SQL repositories; services reach tables through them                     |
| `packages/core/src/calc`     | DPS/TTK and artifact formulas — the only source of numbers               |
| `packages/core/src/services` | import, export, writes, rollback, sync, payload                          |
| `packages/sources`           | pure source adapters: fetch + parse, **no DB writes**                    |
| `packages/mcp`               | tool registry, local client, stdio and HTTP                              |
| `server/api/v1`              | thin Nitro routes: auth → zod → service → JSON                           |
| `server/utils`               | shared `Db`, session, errors, serialization                              |
| `app`                        | Nuxt UI: pages, tables, modal forms, composables                         |
| `db/migrations`              | new `NNNN_name.sql` files only                                           |
| `db/seeds`                   | dossier, icons, wiki slice, prices (no raw EXBO database)                |
| `tests`                      | `unit` — pure functions, `integration` — temporary DB, `e2e` — Playwright |

Dependencies point one way: `app/server → mcp → core → sources/shared`.
Lower layers do not import upper layers.

## Hard invariants

Breaking any item is a bug, even when the tests are green.

1. **Data changes only through services.** Do not edit `dossier.db`, `payload.json` or the
   export by hand. Writes go only through the API, MCP or CLI, and always through
   `packages/core/src/services/writes.ts` with an `event_log` entry in the same transaction.
2. **`before`/`after` in `event_log` are the rollback contract.** Change the format only in
   a backward-compatible way and cover rollback with a test.
3. **No invented numbers.** No lot means `null` → "no lot"; no stat means `null` → "no data".
   Zero, a missing value and an estimate never substitute for each other.
4. **All DPS/TTK come from one formula** in `packages/core/src/calc/weapons.ts`. Do not
   substitute stored legacy values and do not duplicate the formula. When changing numbers,
   run `npm run golden` and explain any difference. Changing displayed numbers is a separate
   owner decision, not a side effect of refactoring.
5. **Schema changes only through new migrations.** Do not edit applied
   `db/migrations/0001`, `0002`. After a schema change update `docs/DATA-MODEL.md` and tests.
6. **Copies collapse into `qty`.** Do not expand identical copies into separate DB rows;
   the payload expands them for display only.
7. **Authorization is never weakened.** Public paths are only `/login`, `/api/auth/login`,
   `/api/v1/healthz`, `/mcp`, `/_*`, `/icons/*`, `/favicon.ico`. Mutations require their own
   `Origin` or a bearer token. Secrets live only in env.
8. **Privacy and boundaries.** No game credentials, no Steam/EXBO sign-in and no reading
   game files. Public HTTP sources only. The auction is read-only: no purchases or listings.
9. **Do not commit personal data:** `.env`, `data/`, `snapshots/`, `public/icons/`, `*.db*`.
   Do not send the contents of these files to external services.

## How to change code

**Bug or feature.** First a test that fails for the expected reason, then the minimal fix,
then a green run. A test written after the code is not a check — it does not prove it would
have caught the defect.

**New route.** Request/response schema in `packages/shared/src/schemas.ts`; the route in
`server/api/v1/**` only calls `requireSession`/`requireOrigin`, `zod.parse`, the service and
`apiError` on failure. Business logic belongs in core.

**New write.** Add a service function in `writes.ts`, return
`WriteResult { dryRun, diff: { before, after, human }, eventId? }`, and throw
`WriteError(status, code, message, details?)`. `dryRun` must not change the DB or write
events. The real write and `logEvent` happen in one transaction.

**New source.** An adapter in `packages/sources` knows nothing about the DB: it accepts
`fetchImpl` and returns normalized data. Binding and writing happen in
`packages/core/src/services/sync.ts`. On failure the source is marked `stale`; old data is
not deleted.

**UI.** Nuxt UI plus the existing composables (`useDossier`, `useWrite`, `useFilters`,
`useFormat`, `useApiError`). SSR safety is mandatory: do not touch `window`/`localStorage`
during setup, and format dates deterministically to avoid hydration mismatches. All visible
strings come from `t(...)`; see `docs/I18N.md`.

**Client code** imports `@dossier/shared/ranks` and `/format` through subpaths, not the
`@dossier/shared` barrel: the barrel pulls `node:crypto` into the browser bundle.

## What to update along with code

| Changing          | Do not forget                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB schema         | new `NNNN_name.sql` migration, `docs/DATA-MODEL.md`, repo, import tests                                                                                                |
| API field/route   | `packages/shared/src/schemas.ts`, `docs/API.md`, `tests/e2e/api.spec.ts`                                                                                               |
| MCP tool          | `packages/mcp/src/registry.ts`, `docs/MCP.md`, the `ALL_TOOLS` list in `tests/integration/mcp.test.ts`; for a read tool also `READ_OUTPUT_SCHEMAS` and `npm run smoke:mcp` |
| Data source       | `docs/ARCHITECTURE.md` (source table), `core/services/sync.ts`, `tests/integration/sync.test.ts`                                                                       |
| Formula/numbers   | only `core/src/calc`, then `npm run golden`, and `docs/DATA-MODEL.md` when needed                                                                                      |
| UI text           | `i18n/locales/en.json` and `i18n/locales/ru.json` (both), `docs/I18N.md`                                                                                               |
| env/deploy        | `README.md`, `.env.example`, `deploy/docker-compose.yml`, `docs/RUNBOOK.md`, `docs/CHANGELOG.md`                                                                       |

## Style

- TypeScript strict, ESM. Inside packages, relative imports end with `.js`; between
  packages use `@dossier/*`.
- English is the project language: interface defaults, error messages, comments, docs and
  commits. Russian exists only as a translation catalog (`i18n/locales/ru.json`) and as
  game data (item names, stat labels, category names coming from the seeds/legacy dossier).
- API and site use `camelCase`; MCP tools and their arguments use `snake_case`.
- Site: `dryRun` defaults to `false`. MCP: `dry_run` defaults to `true`, and a real write
  requires `confirm: true`.
- API errors use one envelope `{ error: { code, message, details? } }`; messages are English.
  The UI localizes known codes through `useApiError`.
- Prettier: single quotes, width 120, semicolons, trailing commas.
- SQL uses prepared statements only; no interpolation of user strings.
- Do not reformat files unrelated to the change.

## Tests

- **TDD is mandatory** for features, bugs and behavior changes. RED first, then GREEN.
- `tests/unit` — pure functions without a DB or network. `tests/integration` — a temporary
  DB in `mkdtemp` plus migrations and seeds; close and delete it in `afterEach`.
- Tests **never touch the network**: pass a fake `fetchImpl` to adapters or use `db/seeds`.
  No live EXBO/wiki/scpmodel in tests.
- E2E goes only through the real server and UI/API; `workers: 1`, port `3100`, a separate
  `data/e2e.db`, and a raised sign-in limit in tests. Never point e2e at the working database.
  E2E assertions use the default English interface.
- Test every rollback: state before/after, restoration of `extra` and container fill, and
  rejection when the entity is missing.
- Before saying "done", run `npm run check`. If `app/` or `server/` changed, also run
  `npm run e2e`; for numbers/parity run `npm run golden`; for Docker/deploy at least
  `npm run build`.

## Gotchas

- **Node ≥ 22 (24 in CI/Docker), native `better-sqlite3`.** After changing the Node version,
  reinstall dependencies.
- **`"type": "module"`:** the CLI bundles are named `dist/cli.js` and `dist/mcp-stdio.js`.
  Do not rename them to `.mjs` — the Dockerfile and runbook rely on these names.
- **Paths and secrets come from env, not constants.** `NUXT_*` overrides runtimeConfig at
  runtime; `DB_PATH` and `ICONS_DIR` are read directly from `process.env`
  (`server/utils/db.ts`, `server/routes/icons/[file].get.ts`) because compose sets exactly
  those. Do not hardcode paths in code.
- **Icons:** import writes `.webp` into `ICONS_DIR` and sets
  `item.icon_path = /icons/<sha1>.webp`; `server/routes/icons/[file].get.ts` serves it.
  `public/icons/` is not committed.
- **SQLite WAL and one process.** Do not open the working database with third-party editors;
  copy the file for inspection.
- **Ports:** dev `80` (`stalzone-profile.local`), e2e `3100`, empty-dossier e2e `3111`.
- **Sign-in rate limit** counts by socket address; `X-Forwarded-For` is honored only with
  `NUXT_TRUST_PROXY=1` (behind Caddy).
- **Golden** after number/calculator changes: differences are allowed only when documented,
  and they must be explained, not "fixed" by editing the expectation.

## Definition of Done

1. There is a test that failed before the change and passes after it.
2. `npm run check` is green; for UI/API also `npm run e2e`; for numbers also `npm run golden`.
3. New migrations, fields, routes and tools are described in `docs/`.
4. Secrets and personal data did not enter the diff.
5. The commit follows Conventional Commits (`feat(scope): …`, `fix: …`, `docs: …`), one
   logical step per commit. Merge/push/deploy only with the repository owner's explicit
   consent.
