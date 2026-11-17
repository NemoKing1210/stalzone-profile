# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The project has no tagged releases yet, so entries are grouped by date, newest first.

## [Unreleased]

### Added

- `MetaRead` in `@dossier/shared/contracts` describes `GET /api/v1/meta` and is validated
  by the payload contract test; `OwnedKind` is exported as a type beside its schema.

### Changed

- `@dossier/core` publishes each module only by name (`./modules/<name>`); the deep
  `./modules/*` wildcard and the dead `src/calc` compatibility shims are gone.
- The write result, freshness, event and owned-kind shapes have one definition in
  `@dossier/shared/contracts`; core and the app reuse them instead of redeclaring.
- `server/utils/serialize.ts` keeps only the event adapter: the test-only `itemJson`
  wrapper and the unused `findAnyDetailsCard` export are removed.

## [2026-11-17] — Contract-first modular monolith: core modules and app slices

### Added

- Boundaries are enforced, not just documented: dependency-cruiser covers packages,
  server, app and tests, and ESLint (`boundaries/dependencies`) applies
  `shared → entities → features → pages`, forbids feature-to-feature imports, bans
  `@dossier/core` in the app and restricts `@dossier/shared` to `/contracts`, `/ranks`
  and `/format`. `npm run check` and the CI verify stage run `npm run boundaries`.

### Changed

- `packages/core` is now `platform` (config, DB, migrations, journal, security) plus
  bounded-context modules: `catalog`, `identity`, `inventory`, `builds`, `sync`, `setup`,
  `maintenance`, `read-model`. Each module exposes one `index.ts`; its `repo/` and
  `service/` files are private. The old `src/repo` and `src/services` shims and the
  `@dossier/core/services/*` subpath are gone.
- `packages/shared` publishes contracts under `src/contracts`; `src/schemas.ts` and the
  `@dossier/shared/schemas` subpath are removed. Use `@dossier/shared/contracts`.
- The app is split into slices — `app/shared` (ui, composables, lib, types),
  `app/entities`, `app/features`, `app/pages` — with the old `app/components`,
  `app/composables`, `app/utils` and `app/types` directories removed. Pages stay thin
  wrappers around feature screens.

_No API, MCP or database contract change; the calculator and the golden fixture are
untouched._

## [2026-11-17] — Seedless onboarding: setup wizard, gear entry, icons, optional profile API

### Added

- First run: sign in → `/setup` redirect → nickname/region → catalog download. The
  middleware never redirects API calls, `/_*`, `/icons/*` or non-HTML requests.
- `POST /api/v1/character` creates the single character, logs `character.create` and
  refuses its rollback once gear or builds exist (`CHARACTER_NOT_EMPTY`).
- Inventory pages add gear from the catalog through `AddOwnedModal`; an empty catalog
  shows a notice and a link back to `/setup`. A container opens its fill editor right
  after it is added.
- New `icons` source downloads `<sha1>.png` from the EXBO repository into `ICONS_DIR`;
  `/icons/:file` serves both `.png` and `.webp`. Per-file failures are counted, not fatal.
- New optional `profile` source fills public statistics from the official STALZONE API
  (OAuth client credentials). It rewrites only `origin='api'` rows, keeps manual
  overrides, stores playtime as hours and drops counters missing from the response.
- `sync_source` (MCP) and `npm run sync` accept `icons` and `profile`; `all` stays
  catalog-only. `GET /api/v1/setup` reports first-run state.

_No schema change; the calculator and the golden fixture are untouched._

## [2026-11-17] — Typed database baseline, seedless catalog and reset

### Added

- `GET /api/v1/details/:key` serves derived cards.
- `export_dossier_json` is added; `get_character` and `get_item` return the typed shapes
  (derived fields, stats, effects, card).

### Changed

- `0001_init.sql` is replaced by a typed baseline: reference tables (`source`,
  `stat_definition`, `item`, `item_stat`, `item_effect`, `icon`, `price_quote`,
  `price_latest`) and dossier tables (`character`, `character_stat`, `owned_item`,
  `owned_container`, `container_slot`, `build`, `build_metric`, `build_slot`, `event_log`).
  Working tables keep no JSON; only `event_log.before/after` does. An existing database
  must be rebuilt — see `docs/MIGRATION.md`. There is no automatic data migration.
- `character_stat` stores raw counters with `api`/`manual` origins. The character editor
  edits raw counters only; K/D, accuracy, headshot share and hours are derived, read-only.
- Container display follows override (`owned_container`) > item stats > `null`; containers
  are edited in the item modal instead of free-form `extra`.
- `PATCH /api/v1/character` accepts `stats`; the export is the typed dossier JSON.
- The MCP registry has 20 tools: 12 read, 8 write.
- `npm run golden` no longer reads a personal dossier: it recomputes a public synthetic
  fixture and must print `mismatches: 0` and `legacyDeltas: []`.
- `.env.example`, compose, README, runbook and docs drop `PROFILE_FILE` and the seed
  workflow.

### Removed

- The personal seeds, legacy import, `content_block` features (career, recommendations,
  earnings, build/catalog meta), `catalog_entry` and `details_card` are removed. The
  catalog and detail cards are derived at read time from synced public sources; the first
  run is an empty database plus `npm run sync`.
- The content route is gone.
- `upsert_content_block` and `export_legacy_json` are gone.
- `npm run import:legacy` is removed.

## [2026-11-17] — Inventory toolbar and grouping

### Added

- Weapons and Armor gained a type/class filter and grouping by type/class; all four
  inventory pages now share one toolbar component with grid/list views, search, rank, sort
  direction and reset.
- The toolbar persists its state per section in `localStorage`.

### Changed

- Containers and Artifacts are single full-width panes: grid/list views, search, type and
  rank filters, sorting and grouping. Container details and fill, and artifact cards, open
  in modals; the container side pane and slide-over are gone.

_No API, DB or MCP changes._

## [2026-11-17] — Dev server address comes from the environment

### Added

- `nuxt.config.ts` reads `DEV_HOST` and `DEV_PORT` (from `.env` or the shell) instead of
  hard-coding `127.0.0.1:80`. `npm run dev` prints the address it binds to, so
  `DEV_HOST=stalzone-profile.local` makes the console banner show the domain; a non-IP
  `DEV_HOST` is appended to `devServer.allowedHosts` automatically. Defaults are unchanged.
- `.env.example`, the README variable table and the quick start describe the two variables.

## [2026-11-17] — Character editor gets grouped fields, a faction select and a date input

### Added

- Faction becomes a searchable select of the current STALZONE factions («Сталкеры»,
  «Бандиты», «Заря», «Рубеж», «Завет», «Наёмники», «Шёпот»); any other value can still be
  typed and saved, and a stored legacy value stays selectable.
- New `forms.section*`, `forms.chooseFaction`, `forms.createFaction` and
  `forms.arrivedStored` keys in both catalogs.

### Changed

- The character editor groups its fields into Profile, Progress, Combat, Money and Notes
  instead of one flat grid, and moves the actions into the modal footer with a new Reset
  next to Cancel and Check/Save.
- "In the Zone since" is a native date input. A stored non-ISO string (for example
  `6 декабря 2024`) is not discarded: it is kept and shown as a hint until a date replaces
  it, so opening the editor and saving cannot rewrite game data.
- Numeric fields get real bounds and steps: percentages are 0–100, K/D steps by 0.01,
  money by 1000.

_No API, schema, MCP or number changes._

## [2026-11-16] — Overview reads as an inventory dashboard

### Added

- The Character pane leads with a **Key stats** strip (hours, K/D, accuracy, headshots).
  Percentages carry a 0–100 accent bar; no other value has a bar because none has a real
  maximum. Achievements with points, money and maximum money (brass) and the in-zone date
  follow as rows, then the stash as the stored string, never a bar.
- New keys `overview.keyStats` and `overview.sectionAria` in both catalogs.

### Changed

- Career splits into two balanced columns from 1280px. Sections became a 2×2 inventory-slot
  grid whose links name their count; the prices age in Data state uses the freshness tones.

### Removed

- The paper-doll placeholder is gone from the Character pane: the nick, playstyle and edit
  action now start the pane, so the first thing under the page title is data, not a stand-in.

_No API, schema, MCP or number changes._

## [2026-11-16] — Weapons and Armor drop the side columns

### Changed

- The Weapons and Armor pages are a single full-width list or grid: the character summary,
  the section list and the in-flow item card are gone. The top bar remains the only section
  navigation, and selecting an item opens its card in a modal at every width.

### Removed

- The unused `InventorySidebar` component and the `weapons`/`armor` `detailTitle` and
  `noSelection` translation keys are removed.

## [2026-11-16] — Builds, Recommendations, Earnings and Notes removed from the site

### Changed

- Old `/?tab=builds|recs|recommendations|earnings|notes` links stay on the overview instead
  of redirecting to a removed route.

### Removed

- The shell now has five sections: overview, weapons, armor, containers and artifacts. The
  Builds, Recommendations, Earnings and Notes pages, their navigation entries, overview
  counts and edit modals are gone.
- Notes are removed end to end: the `notes` content kind is rejected by the API and MCP,
  payload and export no longer carry `notes`, the seed has no notes, and migration `0003`
  deletes existing `content_block` rows of that kind. The cleanup is one-way.

_`/api/v1/builds`, the remaining content blocks (recommendations, earnings, build and
catalog meta), export and MCP tools are unchanged._

## [2026-11-15] — First reproducible version

### Added

- Repository skeleton: npm workspaces, Nuxt 4 + Nuxt UI, TypeScript strict, ESLint,
  Vitest, tsup.
- Shared zod schemas for the API and MCP, name normalization, ranks, formatting.
- SQLite schema: sources, items and stats, gear with `qty`, containers, builds, price
  history, content, icons, event log.
- Legacy dossier import, number parity on one DPS/TTK formula.
- Icons: 99 `.webp` files from `icons.json` are written to `ICONS_DIR` and served at
  `/icons/<sha1>.webp`; weapons, armor, containers and artifacts reference the file
  instead of a data URL.
- Lower layers: repositories, artifact calculation, old JSON export.
- Session auth, sign-in rate limit by socket address (`X-Forwarded-For` only with
  `NUXT_TRUST_PROXY=1`), origin check for mutations.
- REST API `/api/v1`: reads for every section, writes with `dryRun`, journal and rollback.
  Rolling back a container deletion restores `extra` and the fill; rolling back a fill
  without a container returns `409 OWNED_NOT_FOUND`.
- Nuxt UI: nine sections, search, sorting, cards, empty states.
- Editing: gear, character, containers, builds, notes, recommendations, earnings; the
  event log in `/settings`.
- MCP: 21 tools, stdio and stateless HTTP `/mcp`, bearer token, `dry_run`/`confirm`,
  a limit of 30 writes per minute, `dossier://schema`.
- Sources: EXBO adapters (cache by commit), stalzone.wiki (ranges, `additionalStats`,
  TTK 0…15), motifs (219 skins), profile (manual snapshot), scpmodel (15-minute TTL,
  `stale` on failure); sync from `/settings`, the CLI and MCP.
- Deploy: Dockerfile, compose with a `/data` volume, healthcheck, Caddy profile, backups
  kept for 14 days, GitLab CI.
- Documentation: README, architecture, API, MCP, data model, migration, runbook;
  `.env.example`. English documentation; the UI is English with a Russian translation.

### Known limitations

- The profile is updated manually: the official API does not expose it to third-party
  applications, and the inventory is not published either.
- 32 of 219 skins have no known base in the source — `base_item_id` stays empty instead of
  being guessed.
- `rebuild_site` in MCP does not rebuild the site: the deploy does.

[Unreleased]: https://github.com/NemoKing1210/stalzone-profile/commits/main
