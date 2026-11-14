# STALCRAFT Dossier (Nuxt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отдельный репозиторий досье STALZONE: SQLite как источник правды, полноценный сайт и API на Nuxt/Nitro, MCP для агента, один Docker-деплой.

**Architecture:** Один Nuxt-проект в корне. `packages/core` владеет БД, репозиториями, расчётами и сервисами; `packages/sources` — адаптеры источников; `packages/mcp` — общий реестр MCP-инструментов и два клиента (локальный и HTTP). Nitro-роуты и CLI — тонкие оболочки над сервисами. UI собран на Nuxt UI; собственные компоненты только для предметных карточек.

**Tech Stack:** TypeScript, Node 24, Nuxt 4, Nuxt UI 4 (Tailwind CSS 4), better-sqlite3, zod 4, @modelcontextprotocol/sdk, vitest, Playwright, tsup, Docker Compose + Caddy.

**Spec:** `docs/superpowers/specs/2026-11-15-stalcraft-dossier-design.md` и `docs/PLAN.md`.

## Global Constraints

- Node `>=22` (целевая — 24), ESM, `"type": "module"`.
- Русский UI, английские идентификаторы в коде.
- Один деплой: `node .output/server/index.mjs`. Каталога `apps/` нет.
- UI — Nuxt UI: не писать свои таблицы, модалки, формы и тосты, если есть готовый компонент.
- Ни одна цифра не меняется без записи в `docs/MIGRATION.md`; golden-допуск: DPS 0,5, TTK 0,01.
- Показ чисел: `dmg = round(raw,1)`, `dps = round(dmg*rof/60)`, `ttk = round((ceil(600/dmg)-1)*60/rof, 2)`.
- SQL только в `packages/core/src/{db,repo}`. Запись — только через сервисы; каждая пишет `event_log` в той же транзакции.
- Секреты только в env; `.env` в `.gitignore`.
- Пути только через `node:path`; тесты проходят на Windows.
- Старые ссылки `?tab=<id>` редиректятся на новые маршруты; `localStorage` хранит фильтры и сортировки.
- Нет `file://`, `payload.js` и статической сборки сайта.
- Персональные ответы: `Cache-Control: private, no-store`.

## Review Focus

- Неавторизованный запрос: страница редиректит на `/login`, API отдаёт 401, персональные данные не попадают в SSR-HTML.
- Пустая/новая БД: страницы показывают пустые состояния через `UAlert`, а не падают.
- Одинаковые копии предметов (`qty`): редактирование одной меняет все, удаление уменьшает количество, payload разворачивает копии.
- `dry_run` не меняет БД и не пишет `event_log`; откат события восстанавливает прежнее состояние.
- Нет стата или лота: «нет данных» / «нет лота», не 0 и не выдуманное число.
- Источник недоступен: `sync` возвращает `stale`, старые цены остаются, страница показывает возраст данных.
- Заточка 0 и 15, манекен 600 HP, броня без кривой → `null`.

---

## File Structure

```
nuxt.config.ts               modules, runtimeConfig, nitro, routeRules
app/
  app.vue                    UApp + NuxtLayout
  app.config.ts              палитра Nuxt UI, тёмная тема
  assets/css/main.css        tailwind + nuxt ui + ранги
  layouts/default.vue        шапка, навигация, freshness
  middleware/auth.global.ts  защита маршрутов
  pages/                     index, weapons, armor, containers, artifacts,
                             builds, recommendations, earnings, notes,
                             settings, login
  components/                ItemCard, StatBar, RankBadge, PriceCell,
                             FreshnessBadge, DataTableShell, EditOwnedModal
  composables/               useDossier, useFilters, useWrite, useFormat
server/
  api/auth/{login,logout,me}.ts
  api/v1/                   payload, character, items, owned, containers,
                             builds, prices, sources, meta, events, admin
  routes/mcp.ts              Streamable HTTP MCP
  middleware/auth.ts
  plugins/db.ts
  utils/{db,auth,errors}.ts
packages/shared/src/         norm, ranks, format, hash, schemas
packages/core/src/
  config.ts  db/  repo/  calc/  services/{payload,import,export,writes,events,sync}
packages/sources/src/        exbo, wiki, motifs, profile, scpmodel
packages/mcp/src/            registry, client, stdio
db/migrations/               0001_init.sql, 0002_owned_qty_catalog_details.sql
db/seeds/                    legacy.json, icons.json, wiki/*, auction-ru.json,
                             profile.json, labels.json, extra-items.json
scripts/cli.ts               migrate, reset, import, export, golden, sync, backup,
                             hash-password
tests/                       unit, integration, e2e, fixtures
deploy/                      Dockerfile, docker-compose.yml, Caddyfile, backup
docs/                        ARCHITECTURE, API, MCP, DATA-MODEL, MIGRATION,
                             RUNBOOK, CHANGELOG
```

---

### Task 1: Nuxt skeleton and workspace cleanup

**Files:** `package.json`, `nuxt.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `tsup.config.ts`, `eslint.config.js`, `.env.example`, `app/app.vue`, `app/assets/css/main.css`, `app/app.config.ts`; удалить `apps/**`.

**Interfaces:**
- Produces: `npm run dev`, `build`, `start`, `preview`, `typecheck`, `test`, `e2e`, `check`, `golden`, `db:*`, `import:legacy`, `export:json`, `sync`, `mcp`, `backup`.
- `nuxt.config.ts`: `modules: ['@nuxt/ui']`, `css: ['~/assets/css/main.css']`, `nitro.externals.external: ['better-sqlite3']`, `runtimeConfig` (`dbPath`, `realm`, `sessionSecret`, `passwordHash`, `password`, `mcpToken`), `routeRules` с `private, no-store`.
- `app.config.ts`: `ui.colors.primary = 'emerald'`, `neutral = 'slate'`.

- [ ] Remove `apps/` and their workspace entries; add `@nuxt/ui`, `nuxt`, `vue`, `vue-router`, `@iconify-json/lucide`.
- [ ] `npm install` and `npx nuxt prepare` succeed.
- [ ] Empty app renders a dark `UApp` shell.
- [ ] Commit `chore: switch to single nuxt app`.

### Task 2: Shared utilities and schemas

**Files:** `packages/shared/src/{ranks,format,hash,schemas,index}.ts`, `tests/unit/shared.test.ts`.

**Interfaces:**
- `norm`, `rankKey`, `RANK_RU`, `RANK_COLOR`, `fmtMoney`, `g1`, `g2`, `slugify`, `sha1`.
- `OwnedCreateSchema`, `OwnedPatchSchema`, `CharacterPatchSchema`, `ContainerFillSchema`, `BuildInputSchema`, `ContentBlockInputSchema`, `LoginSchema` (zod).
- `round(v, digits)`.

- [ ] Tests for `norm`, `rankKey`, `fmtMoney`, `slugify` and schema rejection cases.
- [ ] Implement and pass.
- [ ] Commit `feat(shared): utilities and api schemas`.

### Task 3: SQLite schema, migration 0002, repositories

**Files:** `db/migrations/0002_owned_qty_catalog_details.sql`, `packages/core/src/db/*`, `packages/core/src/repo/{items,owned,catalog,details,builds,prices,content,events,sources,meta,icons}.ts`, `tests/integration/db.test.ts`.

**Interfaces:**
- `openDb(path)`, `migrate(db, dir): { applied: string[] }`.
- `owned`: `qty INTEGER NOT NULL DEFAULT 1`, `display_name TEXT`; unique `(character_id, item_id, level, COALESCE(quality,''), COALESCE(skin_item_id,0))`.
- `catalog_entry(id, kind, position, name, data)`; `details_card(key TEXT PRIMARY KEY, item_id, kind, name, data)`.
- `upsertOwned(db, input)` keyed by item+level+quality+skin; `listOwned`, `updateOwnedById`, `deleteOwned`, `setContainerFill`.
- `insertCatalogEntries`, `listCatalogEntries(kind)`; `upsertDetailsCard`, `listDetailsCards`.
- `logEvent`, `getEvent`, `listEvents`, `rollbackEvent`.

- [ ] Migration on a temp DB adds tables/columns and rebuilds the unique index.
- [ ] Two identical artifacts insert as one row with `qty=2`; different quality → two rows.
- [ ] `catalog_entry` preserves duplicate names and `position`.
- [ ] `details_card` round-trips `art:Болотный Глинец`-style keys exactly.
- [ ] Commit `feat(core): schema for copies, catalog and detail cards`.

### Task 4: Calculations, display rules and golden parity

**Files:** `packages/core/src/calc/{weapons,armor,artifacts,index}.ts`, `scripts/golden.ts`, `tests/fixtures/golden.json`, `tests/unit/calc.test.ts`.

**Interfaces:**
- `dps(damage, rof)`, `ttk(damage, rof, hp=600)`, `displayDmg`, `displayDps`, `displayTtk`.
- `armorAtLevel(curve, level)`, `protKeyFor`, `statAtLevel`, `headMultiplier`.
- `scripts/golden.ts --write` builds fixture from legacy inputs; default compares `buildPayload` to fixture and prints a `legacyDeltas` report.

- [ ] Fixture: 35 weapons (dmg, rof, dmg15, dps, ttk), 12 armor, 5 builds, 3 containers.
- [ ] `npm run golden` — 0 mismatches; `legacyDeltas` is empty, any delta fails the check.
- [ ] Boundary tests: level 0/15, 600 HP, missing damage → `null`.
- [ ] Commit `feat(core): display rounding and golden parity`.

### Task 5: Legacy import and export

**Files:** `packages/core/src/services/{import,export}.ts`, `scripts/cli.ts`, `tests/integration/import.test.ts`.

**Interfaces:**
- `importLegacy(db, cfg): ImportReport` — `items, ownedRows, ownedCopies, builds, prices, icons, blocks, catalog, details, skipped, local`.
- Import: owned `qty` for exact duplicates, `display_name` from legacy, quality in the key; catalog entries 356/139 with positions; 601 details keyed by legacy key; `owned.extra.legacy` always stored.
- `exportLegacyJson(db, characterId)` expands `qty`, preserves catalog duplicates and detail keys.

- [ ] Empty DB → import is idempotent (second run changes nothing).
- [ ] Payload counts after import: 35 weapons, 12 armor, 3 containers, 22 artifacts, 356/139 catalog, 601 details, 5 builds, 4 recommendations, 12 earnings rows, 8 notes.
- [ ] `exportLegacyJson` matches the seed semantically (names, counts, build totals).
- [ ] 3 local-only items documented; no `skipped`.
- [ ] Commit `feat(core): legacy import/export with copies and exact catalog`.

### Task 6: Payload service

**Files:** `packages/core/src/services/payload.ts`, `tests/integration/payload.test.ts`.

**Interfaces:**
- `buildPayload(db, characterId?): Payload` — contract `meta, character, career, weapons, armor, containers, artifacts, notes, catalog{weapons,armor,meta}, recommendations, details, earnings, builds, icons, freshness`.
- Owned rows expand `qty`; display name from `owned.display_name`; legacy fallback from `owned.extra.legacy`.
- `dmg/dps/ttk` use display rules; missing values are `null`.
- `freshness`: `dataUpdated`, `pricesUpdatedAt`, `pricesAgeMin`, `sources[]`.

- [ ] Counts from Task 5 hold; `qty` copies have stable names and levels.
- [ ] «Огниво» → dmg 10, rof 600, dps 100, ttk 5.9; Chiappa dmg15/dps15/ttk15 = null.
- [ ] Empty DB returns an empty payload, not an exception.
- [ ] Commit `feat(core): payload with copies, fallbacks and freshness`.

### Task 7: Nuxt server foundation and auth

**Files:** `server/plugins/db.ts`, `server/utils/{db,auth,errors}.ts`, `server/middleware/auth.ts`, `server/api/auth/{login,logout,me}.ts`, `server/api/v1/healthz.ts`, `app/pages/login.vue`, `.env.example`.

**Interfaces:**
- `useDb(): Database` — singleton, WAL, migrations on first use.
- `verifyPassword(plain, env): boolean` — scrypt hash or plain dev password, constant-time.
- `createSession(event)`, `requireSession(event)`, `clearSession(event)` — HMAC cookie `owner.<exp>.<sig>`.
- `requireOrigin(event)` for mutations; login rate limit 5/min/IP.
- `apiError(event, status, code, message, details?)`.

- [ ] `POST /api/auth/login` sets HttpOnly cookie; wrong password → 401 and no cookie.
- [ ] `/login` is public; all other pages redirect when unauthenticated; `/api/v1/*` → 401.
- [ ] `/api/v1/healthz` public; DB migration runs once on boot.
- [ ] Commit `feat(server): nuxt foundation and session auth`.

### Task 8: Nitro read API

**Files:** `server/api/v1/{payload,character,items,items/[id],owned,containers,builds,builds/[slug],prices,sources,meta,details,catalog,events}.ts`, `tests/e2e/api.spec.ts`.

**Interfaces:**
- `GET /api/v1/payload`, `/character`, `/items?q&kind&rank&slot&limit`, `/items/:id`, `/owned`, `/containers`, `/builds`, `/builds/:slug`, `/prices?names=`, `/sources`, `/meta`, `/details/:key`, `/catalog?kind=`, `/events`.
- Errors `{ error: { code, message, details } }`; `Cache-Control: private, no-store`.
- Auth: session cookie for the site; same endpoints usable by MCP HTTP only with Bearer.

- [ ] Playwright: every read route responds 200 with a valid session and 401 without.
- [ ] Unknown item → 404 `ITEM_NOT_FOUND`; bad query → 400 `VALIDATION`.
- [ ] `/api/v1/payload` matches the service output.
- [ ] Commit `feat(api): read routes over core services`.

### Task 9: Nitro write API

**Files:** `server/api/v1/{character,owned,owned/[id],containers/[id]/fill,builds,builds/[slug],content/[kind]/[slug],admin/sync,admin/export,events/[id]/rollback}.ts`, `packages/core/src/services/{writes,events}.ts`, `tests/integration/writes.test.ts`, `tests/e2e/writes.spec.ts`.

**Interfaces:**
- `createOwned`, `updateOwned`, `deleteOwned`, `setContainerFill`, `saveBuild`, `deleteBuild`, `putContentBlock`, `patchCharacter` → `WriteResult { dryRun, diff:{before,after,human}, eventId? }`.
- All accept `dry_run`; origin check; zod validation; event log in the same transaction.
- `POST /api/v1/events/:id/rollback`.

- [ ] `dry_run=true` leaves DB and `event_log` unchanged.
- [ ] Confirmed write logs an event; rollback restores `before`.
- [ ] Delete with copies decrements `qty`, not the whole row.
- [ ] Unknown item name → 422 with fuzzy suggestions, no insert.
- [ ] Commit `feat(api): editable dossier with audit and rollback`.

### Task 10: Nuxt UI shell and navigation

**Files:** `app/app.vue`, `app/layouts/default.vue`, `app/app.config.ts`, `app/assets/css/main.css`, `app/components/{RankBadge,StatBar,FreshnessBadge,PriceCell,ItemCard,EditOwnedModal,DataTableShell}.vue`, `app/composables/{useFormat,useFilters,useDossier}.ts`, `app/middleware/auth.global.ts`.

**Interfaces:**
- `UTabs`/`UNavigationMenu` for 9 sections; `UModal`/`USlideover` for details; `UTable` for lists; `UBadge` for ranks; `useToast()` for results.
- `useColorMode().preference = 'dark'`; rank colors from `RANK_COLOR`.
- `?tab=<id>` → `/weapons` etc. via route middleware; unknown tab → `/`.

- [ ] Layout renders all 9 links, active state, freshness badge, logout.
- [ ] `?tab=builds` lands on `/builds`; `localStorage` restores sort/filter.
- [ ] No custom table/modal/form markup where Nuxt UI has a component.
- [ ] Commit `feat(web): nuxt ui shell and navigation`.

### Task 11: Read pages

**Files:** `app/pages/{index,weapons,armor,containers,artifacts,builds,recommendations,earnings,notes,settings}.vue`, `app/components/ItemCard.vue`, `tests/e2e/pages.spec.ts`.

**Interfaces:**
- Pages use `useFetch` to `/api/v1/*`; SSR renders data for an authenticated request.
- Weapons/armor: `UTable` with sortable columns (dmg, dps, ttk, armor), mode «моё/каталог», filters; row click → `UModal` with `ItemCard`.
- Containers: cards with slots/eff/prot and artifact list.
- Builds: cards with rows, totals, verdict, container.
- Recommendations/earnings/notes: `UCard` blocks; earnings table.
- `/settings`: source statuses, sync buttons, export, backup info.

- [ ] Every page renders non-empty state with seed data and an empty state with an empty DB.
- [ ] Sorting and filtering survive reload; no console errors.
- [ ] Clicking an item opens details with the exact legacy card.
- [ ] Commit `feat(web): read pages on nuxt ui`.

### Task 12: Edit forms

**Files:** `app/components/{EditOwnedModal,EditBuildModal,EditCharacterModal,EditContentBlock,ContainerFillEditor}.vue`, `app/composables/useWrite.ts`, `app/pages/{index,builds,containers,notes,recommendations,earnings,settings}.vue`, `tests/e2e/edit.spec.ts`.

**Interfaces:**
- `useWrite()` wraps `$fetch`, surfaces `{ dryRun, diff, eventId }`, toasts success/error, refreshes the page.
- Forms use `UForm` + zod schemas from `@dossier/shared`; `UInputNumber` for levels, `USelectMenu` for items/skins, `USwitch` for `dry_run`.
- Owned edit: level, quality, skin, note, role, slot. Container fill: artifact per slot. Builds: title, goal, slots, rows, verdict. Content: JSON/Markdown blocks.
- Destructive actions use `UModal` confirmation.

- [ ] Edit level → payload and table update after reload; `event_log` has the entry.
- [ ] `dry_run` shows the diff and does not change the page data.
- [ ] Rollback from `/settings` restores the previous value.
- [ ] Commit `feat(web): editable dossier forms`.

### Task 13: MCP registry, stdio and HTTP

**Files:** `packages/mcp/src/{registry,client,stdio}.ts`, `server/routes/mcp.ts`, `scripts/smoke-mcp.ts`, `tests/integration/mcp.test.ts`.

**Interfaces:**
- `interface DossierClient` with read/write methods; `localClient(db)`, `httpClient(baseUrl, token)`.
- `createDossierServer(client): McpServer`; tools: `get_character`, `find_items`, `get_item`, `compare_items`, `list_owned`, `list_containers`, `list_builds`, `get_build`, `plan_artifact_build`, `get_prices`, `sources_status`, `upsert_owned_item`, `remove_owned_item`, `set_container_artifacts`, `save_build`, `delete_build`, `upsert_content_block`, `sync_source`, `rebuild_site`, `export_legacy_json`, `rollback_event`.
- Resource `dossier://schema`; write tools default `dry_run=true`; rate limit 30 writes/min.
- `/mcp`: stateless `StreamableHTTPServerTransport`, Bearer `MCP_TOKEN`, 404 when token is unset.

- [ ] stdio smoke calls every read tool and validates output with zod.
- [ ] `get_item('KS-1')` returns stats/icon; `compare_items('АК-12','HK416')` returns DPS/TTK.
- [ ] `/mcp` and stdio return the same result for the same tool.
- [ ] Commit `feat(mcp): shared tools, stdio and http transport`.

### Task 14: Source adapters and sync

**Files:** `packages/sources/src/{exbo,wiki,motifs,profile,scpmodel,index}.ts`, `packages/core/src/services/sync.ts`, `server/api/v1/admin/sync.ts`, `scripts/cli.ts`, `tests/integration/{sync, prices}.test.ts`.

**Interfaces:**
- `exboAdapter.fetch({force, cacheDir})`; `parseExboItem(json)` mirrors the legacy parser.
- `wikiAdapter.fetch()`, `motifsAdapter.fetch()`, `profileAdapter.fetch()`, `scpmodelAdapter.fetch({region})`.
- `runSync(source, {force}): SyncResult { source, status, items, commit?, fetchedAt, error? }`; on failure `stale`, previous snapshot preserved.
- Prices: TTL 15 min; `price_latest` picks newest per name+quality+bonus.

- [ ] Fixture parse matches legacy fields; second EXBO run skips when commit is unchanged.
- [ ] Wiki keeps ranges and `additionalStats`; TTK covers levels 0…15.
- [ ] Motifs set `base_item_id` for 219 rows.
- [ ] 500 from price source → `stale` + previous price + age.
- [ ] Commit `feat(sources): adapters, sync and freshness`.

### Task 15: Deployment, docs and acceptance

**Files:** `deploy/{Dockerfile,docker-compose.yml,Caddyfile,backup.sh,.dockerignore}`, `.gitlab-ci.yml`, `README.md`, `docs/{ARCHITECTURE,API,MCP,DATA-MODEL,MIGRATION,RUNBOOK,CHANGELOG}.md`.

**Interfaces:**
- Dockerfile: `node:24-bookworm-slim`, build deps for better-sqlite3, `npm ci && npm run build`, final image with `.output`, prod `node_modules`, `dist/cli.mjs`, `dist/mcp-stdio.mjs`, `db/migrations`, `db/seeds`; entrypoint migrates then starts.
- Compose: `app` + optional `caddy`, volume `dossier-data:/data`, `DB_PATH=/data/dossier.db`; healthcheck `/api/v1/healthz`.
- `npm run backup` → `db.backup()`, retention 14 days.
- CI: lint, typecheck, unit/integration, golden, build, Playwright, docker build.

- [ ] `docker compose config` valid; `docker compose up -d` serves the site and healthz.
- [ ] Restart keeps data; backup restores on a copy.
- [ ] `npm run check && npm run golden && npm run build` green.
- [ ] README: clone → install → migrate → import → dev → build → Docker; MCP connection.
- [ ] `docs/MIGRATION.md`: no legacy formula deltas, 2 duplicate catalog armor, 3 local items, catalog/detail tables.
- [ ] Commit `docs: runbook and acceptance`.

---

## Execution

План исполняется нативно в этой сессии (executing-plans): задачи по порядку, после каждой — тесты и коммит. Отклонения фиксируются в `docs/CHANGELOG.md`.
