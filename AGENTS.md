# AGENTS.md — how to change this repository safely

A personal STALZONE profile: **SQLite is the single source of truth**, Nuxt 4 serves the
site and the REST API, Nitro serves `/mcp`, and `packages/mcp` gives an agent the same data.
One process, one database, no separate worker.

Read on demand rather than everything up front. On the first task in the repository, skim
`README.md` (running it) and `docs/ARCHITECTURE.md` (read/write flows); after that, open only
the document for the area you touch:

| Touching                     | Document                       |
| ---------------------------- | ------------------------------ |
| DB schema and invariants     | `docs/DATA-MODEL.md`           |
| Routes, payloads, errors     | `docs/API.md`                  |
| MCP tools and clients        | `docs/MCP.md`                  |
| Interface text and locales   | `docs/I18N.md`                 |
| Deploy, env, troubleshooting | `README.md`, `docs/CONFIGURATION.md`, `docs/RUNBOOK.md` |
| Security policy              | `SECURITY.md`                  |

This file holds rules, not a copy of the documentation.

## Project status (2026-11-17)

The project is not deployed. Backward compatibility for the database, REST API and MCP
contracts is not required until the first deployment. The owner approved a full
inventory/equipment/stash redesign: the schema baseline and migrations may be rewritten in
place, and the old `owned_item` model may be replaced. After the first deployment this
freedom ends — schema changes only add new migrations, and public contracts change
compatibly.

Two kinds of rules live here. **Hard invariants** are owner-level boundaries: breaking one
is a bug even when the tests are green, and changing one needs an explicit owner decision.
**Engineering defaults** are the repository's normal way of working: follow them unless the
task gives a reason not to, and say what you chose. Commands, paths, module lists and tool
counts drift; when this file disagrees with `package.json`, the code or the tests, the code
is the truth until the file is fixed in the same change.

## Commands

| Task                              | Command                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Install                           | `npm ci`                                                                     |
| Develop                           | `npm run dev` → http://stalzone-profile.local                                 |
| Migrations                        | `npm run db:migrate`                                                         |
| Rebuild the local DB from scratch | `npm run db:reset && npm run db:migrate && npm run sync`                     |
| Unit + integration                | `npm test` (`npm run test:integration` — integration only)                   |
| Unit tests only                   | `npm run test:unit`                                                          |
| Focused tests                     | `npm test -- tests/integration/inventory-move.test.ts` (list one or more paths) |
| Tests related to changed files    | `npm run test:related -- <changed files>`                                    |
| Typecheck packages, scripts, tests | `npm run typecheck:node`                                                    |
| Full typecheck (server + app)     | `npm run typecheck` — `typecheck:node` plus the slow Nuxt typecheck          |
| Lint changed files                | `npx eslint <changed files>`                                                 |
| Architecture boundaries           | `npm run boundaries` — dependency-cruiser over packages, server, app         |
| Full check                        | `npm run check` — typecheck + lint + boundaries + tests                      |
| Formula regression (public fixture) | `npm run golden` — expect `0 mismatches`, `legacyDeltas: []`               |
| Site build                        | `npm run build` → `.output/`                                                 |
| CLI/MCP build                     | `npm run build:cli` → `dist/cli.js`, `dist/mcp-stdio.js`                     |
| MCP stdio                         | `npm run mcp` (local DB) or `PROFILE_API_URL=… MCP_TOKEN=… npm run mcp`      |
| MCP smoke                         | `npm run smoke:mcp`                                                          |
| Source sync                       | `npm run sync [exbo_base\|wiki\|motifs\|scpmodel\|icons\|profile] [-- --force]` |
| Backup                            | `npm run backup`                                                             |
| Diagnostic log                    | `npm run logs [-- --level=error --since=24h --category=sync --stats --json]`  |
| Password hash                     | `npm run hash-password -- 'password'`                                        |

`db:reset` deletes the file at `DB_PATH` (and `-wal`/`-shm`). Before running it, make sure
`DB_PATH` points at a local or test database, not the working one. A reset database has no
character, so an authenticated browser lands on `/setup` and the API answers `NO_CHARACTER`
until the wizard (or `POST /api/v1/character`) creates one.

## Verification tiers

Testing is tiered by stage and risk. Running the full gate after every edit wastes time;
running one focused test alone proves nothing. Move up a tier only when the previous one is
green. The tiers are the default cadence, not a ritual: a throwaway spike, a read-only
investigation or a docs-only change may skip them — say what you skipped and why.
Correctness and the hard invariants are never optional.

| Tier                               | When                                    | What to run                                                     |
| ---------------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| 1 — inner loop                     | writing the RED test and the fix        | the one test you are changing: `npm test -- <file> -t '<name>'` |
| 2 — before a commit                | once per logical change, after batching | typecheck + lint + the affected suites from the table below     |
| 3 — before push/PR/merge to `main` | when leaving the branch                 | `npm run check` plus the extras listed below                    |

Unit and integration tests (`npm test`) are cheap: they use a temporary DB and no network.
The expensive gates are Nuxt typecheck, `npm run build`, and `npm run golden`.
Keep the cheap suites in the loop; defer the expensive ones to Tier 3.

Tier 2 in practice:

- `npm run typecheck:node` when `packages/`, `scripts/` or configs changed;
  `npm run typecheck` when `server/` or `app/` changed (this is the slow Nuxt typecheck).
- `npx eslint <changed files>`, or `npm run lint` when the scope is unclear.
- The affected suites from the table. `npm run test:related -- <changed files>` is a fast
  first pass that runs the test files importing the changed modules. It does not see Vue
  templates or behavioral dependencies; if it finds few or no tests, fall back to the table
  and widen the scope.
- `git status --short` and `git diff --check` to catch stray files and whitespace.

**Test selection by changed path — Tier 2 minimum.** When areas overlap, union the rows.
When unsure, widen: a missed test is a correctness bug; an extra suite only costs seconds.

| Changed paths                                            | Run                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/modules/catalog/calc/**`, DPS/TTK or artifact numbers | `npm test -- tests/unit/calc.test.ts`, then `npm run golden`                                                              |
| `packages/shared/src/contracts/**`                       | `npm test -- tests/unit/shared.test.ts tests/integration`                                                                               |
| `packages/shared/src/{ranks,format,norm}*`               | `npm test -- tests/unit`                                                                                                                |
| `packages/core/src/modules/*/repo/**`                    | `npm test -- tests/integration`                                                                                                         |
| `packages/core/src/modules/inventory/**`                  | `npm test -- tests/integration/inventory-storage.test.ts tests/integration/inventory-move.test.ts tests/integration/inventory-read.test.ts tests/integration/cleanup-inventory.test.ts tests/integration/payload.test.ts` |
| `packages/core/src/modules/read-model/**`                | `npm test -- tests/integration/import.test.ts tests/integration/db.test.ts tests/integration/payload.test.ts tests/integration/read-model.test.ts` |
| `packages/core/src/modules/sync/**`                      | `npm test -- tests/integration/sync.test.ts tests/integration/prices.test.ts`                                                           |
| `packages/core/src/modules/logging/**`, `platform/logging/**` | `npm test -- tests/integration/logging.test.ts tests/integration/logging-writer.test.ts tests/unit/logging-*.test.ts`                |
| `server/plugins/logging.ts`, `server/api/v1/logs*`, `server/utils/{http-log,client-log,log,log-limit}.ts` | `npm test -- tests/unit/http-log.test.ts tests/unit/client-log.test.ts tests/unit/log-limit.test.ts`                          |
| `app/plugins/log.client.ts`, `app/features/logs/**`      | `npm test -- tests/unit/app/logs`; `npm run typecheck`                                                                                  |
| `packages/core/src/modules/{maintenance,setup}/**`        | `npm test -- tests/integration/cleanup.test.ts tests/integration/maintenance-atomicity.test.ts tests/integration/setup.test.ts`         |
| `packages/sources/**`                                    | `npm test -- tests/integration/sync.test.ts tests/integration/prices.test.ts` (fake `fetchImpl` only)                                   |
| `packages/mcp/**`                                        | `npm test -- tests/integration/mcp.test.ts`; `npm run smoke:mcp` before Tier 3 if read tools changed                                    |
| `server/api/**`, `server/utils/**`                       | matching `tests/unit/*.test.ts` (`session`, `login-limit`)                                                                               |
| `app/**`                                                 | `npm run typecheck`, `npx eslint app`; `tests/unit/app/**` and `tests/unit/use-api-error.test.ts` for the touched slice                   |
| `i18n/locales/*.json`                                    | `npm test -- tests/unit/i18n-catalogs.test.ts`                                                                                          |
| `app/features/guide/**`                                  | `npm test -- tests/unit/app/guide/guide.test.ts tests/unit/i18n-catalogs.test.ts`                                                      |
| `db/migrations/**`                                      | `npm test -- tests/integration`                                                                                                         |
| `tests/fixtures/**`                                      | `npm test -- tests/integration`; `npm run golden` if numbers move                                                                       |
| `docs/**`, comments only                                 | no runtime tests; `git diff --check`                                                                                                    |
| `package.json`, lockfile, build config                   | full `npm run check`                                                                                                                    |

Tier 3 extras, according to what changed:

- `npm run golden` — anything that can move displayed numbers, prices or parity.
- `npm run build` — Docker, deploy, env or build configuration.
- `npm run smoke:mcp` — a read MCP tool was added or its output shape changed.

Rules that keep the tiers honest:

- Run a focused test with `-t` while iterating, then the whole file once it passes.
- Batch the edits for one logical change and run Tier 2 once. Do not run suites after every
  file save.
- A previous green result counts for the rest of the session while its inputs are unchanged.
  Re-run after a pull/rebase, a dependency or config change, or any edit in the suite's
  dependency closure.
- A red test stops the line: fix it before widening the scope. Do not claim more than you
  ran — name the tier, the command and what it covered. A skipped tier is a stated
  exception, never a silent one.
- UI changes are checked by typecheck, lint and a manual pass over the affected pages;
  there is no browser test layer. That pass must not take over the owner's desktop: open
  the site in a separate, non-maximized window and never in fullscreen or with
  `--start-maximized`; do not minimize, close or cover the owner's active application
  windows, and when you are done close only the windows and tabs you opened.

## Task list (TODO.md)

`TODO.md` in the repository root is the queue of planned work. `docs/superpowers/` holds
designs and implementation plans; the queue holds only the actionable lines that come out
of them. The owner sets the priorities; the rules below define what counts as real work.

- **Simplest first.** Work the list from the top: unblockers, one-line fixes and cheap
  checks before large or risky changes. A task may leave the top only when it is blocked,
  and then it moves down with the blocker named; the owner may reprioritize explicitly.
- **Only real work.** A task comes from the owner, a reproduced defect, a failing check or
  a documented gap. Do not invent work and do not copy an audit or a plan wholesale — link
  it and distil it into the concrete outcomes the entries below describe.
- **"Add a task" means this file.** When the owner says "add a task", "add these tasks" or
  an equivalent phrase in any language, write the entries into `TODO.md` in the format
  below. It is a request to record work, not to start it: implement a task only when the
  owner asks to execute it or to work the list.
- **One entry per outcome.** `- [ ] <area>: <result> — <how it is proven>`: one line
  (long is fine, several sentences are fine), imperative, an observable result and the
  test or command that proves it. No dates, estimates or owner names; there is one owner.
- **Write the entry as a plan, not a headline.** Adding a task and describing it are the
  same act: the entry goes into `TODO.md` with the detail needed to execute it without
  guessing — what exactly changes, which files, modules, contracts, migrations, routes,
  tools or components are touched, the data/API/MCP/UI shape, the edge cases, what must
  not move, the rollback, and the exact tests, commands or manual pass that will prove it.
  Ground every claim in the code: name the file and symbol (or the table row, payload
  field, component) that shows the problem, instead of adjectives like "broken" or
  "unpolished". A one-sentence entry is only acceptable when the change really is one
  sentence; otherwise a thin entry is a defect, because the owner cannot check the work
  against a scope they never saw.
- **Settle the unknowns while the entry is fresh.** When the result can be read two ways —
  where a control goes, what a count counts, whether a field is deleted or merely hidden,
  which page owns a feature, how many items a new page lists — resolve it before the entry
  is finished: read the code first, then ask the owner the one question that changes the
  design, and record the answer in the entry. Never leave "and so on", "make it beautiful"
  or "fix it properly" as the specification: turn it into observable requirements or ask.
  A guess written as a requirement becomes work the owner rejects at review.
- **The entry is the plan while no separate plan exists.** `docs/superpowers/` holds a
  longer design only when the task is large enough to need one; otherwise the `TODO.md`
  entry carries the plan and is what the diff is reviewed against. If execution discovers
  that the entry is wrong, update the entry — and tell the owner — before changing code in
  a direction they did not agree to.
- **Work it as a normal change.** TDD, the verification tier that fits, and the updates
  listed under **What to update along with code**. A task line never overrides a hard
  invariant.
- **Plan the large ones.** A small fix follows the normal TDD loop. A large task, or one
  that adds functionality, changes a contract or migration or spans several modules,
  starts with a plan: what it touches, the data/API/MCP shape, the edge cases and rollback,
  the tests that will prove it, and which existing behavior must not move. The plan may be
  the `TODO.md` entry itself; when the design needs diagrams, alternatives or a phase list,
  put it in `docs/superpowers/` and link it from the entry. Get the owner's agreement before
  the first code edit, as **How to change code** requires.
- **Quality and reliability are the bar.** Prefer the boring, complete implementation:
  every caller migrated, no dead code, stubs or `TODO`s, errors handled where they belong,
  no swallowed failures. A task is not done because the happy path works.
- **Guard against regressions.** Before calling a task done, prove the old behavior still
  holds: run the affected suites from the Tier 2 table, not just the new test, and add a
  regression test for the defect or edge the task introduces. Any deliberate behavior
  change is named in the reply and in `CHANGELOG.md`, never passed off as a side effect.
- **Review the result.** Read your own diff against the plan — the `TODO.md` entry or the
  linked design — covering contracts, invariants, error paths, rollback, tests and docs
  before reporting completion. Interface work (screens, components, layout, i18n)
  additionally gets a manual pass in a browser over the affected pages and states, both
  locales and narrow widths; typecheck and lint are not a review.
  When a review skill or subagent is available, use it — review is evidence, not a rubber
  stamp.
- **Close it in the same change.** Tick the box, add the `CHANGELOG.md` entry and append
  the line to `Done` with the commit subject. A task is done when the tier ran green and
  the documentation moved, not when the code exists.
- **Prune on the way.** `Done` keeps the ten most recent entries; delete the older ones —
  git history is the archive. Rewrite or delete an entry whose work has become wrong or
  obsolete. Never delete an open task without an owner decision.

## Code map

| Path                         | Responsibility                                                           |
| ---------------------------- | ------------------------------------------------------------------------ |
| `packages/shared`            | contracts (zod), `norm`, formatting, ranks, hashes                       |
| `packages/core/src/platform` | config, opening SQLite, migrations, journal, security                    |
| `packages/core/src/modules`  | bounded contexts: catalog, identity, inventory, logging, maintenance,    |
|                              | read-model, setup, sync — each with its own `index.ts` public API        |
| `packages/core/src/platform/logging` | writer, levels, redaction, fingerprints, settings cache, boot lines |
| `packages/core/src/modules/inventory` | storages, gear instances, placements, container data, weapon modules, loadout |
| `packages/core/src/modules/catalog/calc` | DPS/TTK and artifact formulas — the only source of numbers  |
| `packages/sources`           | pure source adapters: fetch + parse, **no DB writes**                    |
| `packages/mcp`               | tool registry, local client, stdio and HTTP                              |
| `server/api/v1`              | thin Nitro routes: auth → zod → module service → JSON                    |
| `server/utils`               | shared `Db`, session, errors, serialization                              |
| `app/shared`                 | cross-slice UI, composables and pure helpers                             |
| `app/stores`                 | Pinia stores, Pinia Colada query keys and the one write mutation         |
| `app/entities`               | domain presentation: item and source cards, rank badges                  |
| `app/features`               | screens and their models: auth, character, inventory (grid, equipment, containers), settings, … |
| `app/pages`                  | thin route wrappers that mount a feature screen                          |
| `db/migrations`              | new `NNNN_name.sql` files only                                           |
| `tests/fixtures`             | public/synthetic catalog for tests and the golden                        |
| `tests`                      | `unit` — pure functions, `integration` — temporary DB                    |

Dependencies point one way: `app/server → mcp → core → sources/shared`.
Lower layers do not import upper layers.

## Hard invariants

These are owner-level boundaries. Breaking one is a bug even when the tests are green;
changing one requires an explicit owner decision recorded in the change — a plan, a
migration note or a `docs/` update — not a silent reinterpretation. The rest of this file
is engineering default, not law.

1. **Data changes only through services.** Do not edit `profile.db`, `payload.json` or the
   export by hand. Writes go only through the API, MCP or CLI, and always through the owning
   domain module's `write.ts` (`modules/<name>/write.ts`) with an `event_log` entry in the
   same transaction. HTTP routes and MCP never write SQL themselves. The diagnostic log is
   the one exception, by owner decision: `log_entry` rows are telemetry written by the
   logging writer, never profile state and never a substitute for an audit event; the
   audited actions remain `logging.settings.update` and `log.clear`.
2. **`before`/`after` in `event_log` are the rollback contract.** Change the format only in
   a backward-compatible way and cover rollback with a test.
3. **No invented numbers.** No lot means `null` → "no lot"; no stat means `null` → "no data".
   Zero, a missing value and an estimate never substitute for each other.
4. **All DPS/TTK come from one formula** in
   `packages/shared/src/calc/weapons.ts`, re-exported by
   `packages/core/src/modules/catalog/calc/weapons.ts` so the server and the page run the
   same functions. Do not substitute stored legacy
   values and do not duplicate the formula. When changing numbers, run `npm run golden` and
   explain any difference. Changing displayed numbers is a separate owner decision, not a
   side effect of refactoring.
5. **Schema changes only through migrations.** After a schema change update
   `docs/DATA-MODEL.md` and tests. On 2026-11-17 the owner approved a second reset for the
   inventory redesign: because the project is not deployed and backward compatibility is not
   required, the baseline and existing migrations may be rewritten in place until the first
   deployment. After the first deployment, schema changes only add new `NNNN_*.sql`
   migrations; never edit an applied one.
6. **Gear is stored as instances; `qty` is for stackables.** Weapons, armor, containers,
   artifacts and attachments are individual rows even when they look identical, because each
   carries its own modules, fill, level, quality or placement. Stackable consumables and ammo
   may collapse into `qty`; the payload expands them for display only. (Owner decision,
   2026-11-17: the old collapse-everything rule blocked per-instance modules and placement.)
7. **Authorization is never weakened.** Public paths are only `/login`, `/api/auth/login`,
   `/api/v1/healthz`, `/mcp`, `/_*`, `/icons/*`, `/favicon.ico`. Mutations require their own
   `Origin` or a bearer token. Secrets live only in env.
8. **Privacy and boundaries.** No game credentials, no Steam/EXBO sign-in and no reading
   game files. Public HTTP sources only. The auction is read-only: no purchases or listings.
9. **Do not commit personal data:** `.env`, `data/`, `snapshots/`, `public/icons/`, `*.db*`.
   Do not send the contents of these files to external services.

## How to change code

**Bug or feature.** Default: first a test that fails for the expected reason, then the
minimal fix, then a green run. A test written after the code is not a check — it does not
prove it would have caught the defect. A throwaway spike or an exploratory prototype may
skip the test; if it becomes production code, add the regression test before calling it done.

**Multi-file, behavior, schema or contract change.** Write a short plan first and get the
owner's agreement before the first code edit. The plan names the migration, the contracts and
the suites that will prove it. Small fixes, docs and spikes do not need a plan.

**Owner decisions.** Changing displayed numbers, resetting the schema baseline, weakening a
hard invariant or deleting data needs an explicit owner decision. Record it in the change
(commit message, migration comment or `docs/`), not as an unstated assumption.

**Commit every finished task.** A task is finished when its Tier 2 checks are green and its
docs, `CHANGELOG.md` and `TODO.md` entries have moved; at that point make the commit — do not
leave finished work uncommitted, and do not batch several finished tasks into one commit.
One task is one Conventional Commit (`feat(scope): …`, `fix: …`, `docs: …`) containing only
that task's files: with other uncommitted work in the tree, stage the task's lines, not
everything in the file.

**New route.** Request/response schema in `packages/shared/src/contracts/**`; the route in
`server/api/v1/**` only calls `requireSession`/`requireOrigin`, `zod.parse`, the module's
public read/write service and `apiError` on failure. Business logic belongs in core.

**New write.** Add a service function to the owning module's `write.ts`, return
`WriteResult { dryRun, diff: { before, after, human }, eventId? }`, and throw
`WriteError(status, code, message, details?)`. `dryRun` must not change the DB or write
events. The real write and `logEvent` happen in one transaction. Export the function from
the module's `index.ts`; the façade re-exports it for the server and MCP.

**Every composition root is instrumented.** A path that calls a module outside an HTTP
route — the built-in assistant (`runChatTurn`), `/mcp`, stdio, a scheduler tick, a CLI
command — must pass a `Logger` and run inside `runWithEventContext({ origin, requestId })`.
An agent or assistant surface is not done until every tool call is an `mcp` log entry with
its `channel` (`chat`, `mcp`, `stdio`), tool and duration under the turn's request id,
every write is an `event_log` row with `origin` and `request_id` (never NULL), and failures
are `warn`/`error` without prompt text, message text, file bytes or secrets. The tests in
`tests/integration/chat-agent.test.ts` and `tests/integration/mcp.test.ts` assert the
entries; a new surface without them fails the Definition of Done.

**New source.** An adapter in `packages/sources` knows nothing about the DB: it accepts
`fetchImpl` and returns normalized data. Binding and writing happen in
`packages/core/src/modules/sync`. On failure the source is marked `stale`; old data is
not deleted.

**UI.** Nuxt UI plus the existing composables (`useProfile`, `useWrite`, `useFilters`,
`useFormat`, `useApiError`, all auto-imported from `app/shared/composables`). New screens
live in `app/features/<feature>/ui` with their pure model in `.../model`, and the route file
in `app/pages` stays a thin wrapper. SSR safety is mandatory: do not touch
`window`/`localStorage` during setup, and format dates deterministically to avoid hydration
mismatches. All visible strings come from `t(...)`; see `docs/I18N.md`. Do not add
instructional copy for a self-evident interaction: `DESIGN.md` §9 defines when a hint is
allowed to stay.

**Complex interactions use a library.** Drag and drop, sorting, resizing and similar
pointer-driven behaviour go through a maintained library instead of hand-rolled pointer
tracking. The inventory screen uses `interactjs`: a preview of the item follows the cursor
at its real footprint while the ghost marks the snapped landing cells, and the shared drop
state lives in `app/features/inventory/ui/grid/useGridDrag.ts`. Keep geometry and drop
resolution pure in `app/features/inventory/model` so they stay unit-tested; do not add
manual `pointermove`/`pointerup` listeners for a new interaction.

**Client code** imports `@profile/shared/contracts`, `/ranks`, `/format`, `/calc` and
`/inventory-order` through subpaths,
never the `@profile/shared` barrel: the barrel pulls `node:crypto` into the browser bundle.
The app imports no `@profile/core`; ESLint enforces both rules together with the
`shared → entities → features → pages` direction.

**The `/guide` page is part of the contract.** A new or removed screen, REST route, MCP tool,
CLI script or sync source is not done until the guide lists it. Update
`app/features/guide/model/guide.ts` and both locale catalogs, then run
`npm test -- tests/unit/app/guide/guide.test.ts`. That test compares the page with
`app/pages`, `server/api`, the MCP registry, `package.json` and the sync module, so drift
turns into a red test instead of a stale page. Keep its descriptions short and factual: they
are a reference, not marketing copy.

## What to update along with code

| Changing          | Do not forget                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB schema         | new `NNNN_name.sql` migration (`0005`/`0006` were the inventory cutover), `docs/DATA-MODEL.md`, repo, migration tests                                                |
| API field/route   | `packages/shared/src/contracts/**`, `docs/API.md`, the affected `tests/integration` suite                                                                              |
| MCP tool          | `packages/mcp/src/registry.ts`, `docs/MCP.md`, the expected read/write lists in `tests/integration/mcp.test.ts`; for a read tool also `READ_OUTPUT_SCHEMAS` and `npm run smoke:mcp` |
| New composition root or agent surface | `instrumentClient`/logger wiring, `runWithEventContext`, an integration test asserting `log_entry` (`category=mcp`, `requestId`, `channel`) and `event_log` (`origin`, `request_id`), and the `docs/ARCHITECTURE.md` logging table |
| Data source       | `docs/ARCHITECTURE.md` (source table), `core/src/modules/sync`, `tests/integration/sync.test.ts`                                                                       |
| Formula/numbers   | only `core/src/modules/catalog/calc`, then `npm run golden`, and `docs/DATA-MODEL.md` when needed                                                                      |
| UI text           | `i18n/locales/en.json` and `i18n/locales/ru.json` (both), `docs/I18N.md`                                                                                               |
| New page, route, tool or source | `app/features/guide/model/guide.ts` and both locale catalogs; `npm test -- tests/unit/app/guide/guide.test.ts`                                                    |
| env/deploy        | `README.md`, `.env.example`, `docs/CONFIGURATION.md`, `deploy/docker-compose.yml`, `docs/RUNBOOK.md`, `CHANGELOG.md`                                                   |
| Commands, scripts, module or tool counts | this file (`Commands`, `Code map`), the matching `docs/*`; link to `package.json` or the registry instead of copying a count |
| Hard invariant or boundary | an explicit owner decision recorded in the change; never a silent reinterpretation                                                                          |

## Style

- TypeScript strict, ESM. Inside packages, relative imports end with `.js`; between
  packages use `@profile/*`.
- English is the project language: interface defaults, error messages, comments, docs and
  commits. Russian exists only as a translation catalog (`i18n/locales/ru.json`) and as
  game data (item names, stat labels, category names coming from the sources).
- API and site use `camelCase`; MCP tools and their arguments use `snake_case`.
- Site: `dryRun` defaults to `false`. MCP: `dry_run` defaults to `true`, and a real write
  requires `confirm: true`.
- API errors use one envelope `{ error: { code, message, details? } }`; messages are English.
  The UI localizes known codes through `useApiError`.
- Prettier: single quotes, width 120, semicolons, trailing commas.
- SQL uses prepared statements only; no interpolation of user strings.
- Do not reformat files unrelated to the change.

## Tests

- **TDD is the default** for features, bugs and behavior changes: RED first, then GREEN.
  A spike may skip it; shipping behavior needs a regression test.
- Docs-only changes need no runtime test — run `git diff --check` and check that the
  commands, paths and links you touched still exist.
- `tests/unit` — pure functions without a DB or network. `tests/integration` — a temporary
  DB in `mkdtemp` plus migrations and `seedCatalog` from `tests/fixtures`; close and delete
  it in `afterEach`.
- Tests **never touch the network**: pass a fake `fetchImpl` to adapters or use the
  `tests/fixtures` catalog. No live EXBO/wiki/scpmodel in tests.
- Test every rollback: state before/after, restoration of container overrides and fill, and
  rejection when the entity is missing.
- Before saying "done" for a change, Tier 2 (the affected suites) must be green. Before
  push/PR/merge, run Tier 3 (the full gate) — see **Verification tiers**. Say which tier you
  ran; targeted tests are not a full check.

## Reading logs

The diagnostic log answers "what went wrong", the audit journal answers "what changed".
Use `log_entry` for defects and `event_log` for business writes; never put a defect into the
audit journal or a profile change into the log.

| Entry | Level |
|---|---|
| per-source parse steps, HTTP fetch details | `debug` |
| run start/finish, source ok, duration, slow request (> 1 s) | `info` |
| assistant tool call (tool, channel, duration); finished assistant turn | `info` |
| assistant turn failed, provider error, empty reply, assistant not configured | `warn` |
| source stale, lock skipped, 4xx other than 401/404 | `warn` |
| run crashed, unhandled error, 5xx | `error` |

How to read it:

- `npm run logs -- --level=error --since=24h` (also `--category=sync`, `--text=`,
  `--request-id=`, `--stats`, `--json`).
- MCP `list_logs` and `log_stats`; the `/logs` page for filters, repeat groups and a
  previewed purge.
- A request carries `x-request-id`; a sync run and each MCP call carry their own id in
  the context. `/mcp` keeps the HTTP request id, and the built-in assistant uses the
  `POST /api/v1/chat/turn` id, so its tool calls and confirmed writes join on one id;
  `channel` tells chat from an external agent.

Rules:

- Never log secrets, request bodies, headers, cookies, `.env` values, DB rows or file
  contents. The writer redacts secret-looking keys, bearer tokens and URL query strings,
  but the call site is still responsible for not passing them.
- Raise one category to `debug` through `update_logging` or Settings → Logging, reproduce,
  then set it back to `inherit`. Do not leave debug levels on.
- `log.clear` and `rollback` are not rollbackable. Purging is audited but final.
- Retention is automatic (hourly, age + row cap); a manual purge is a separate owner
  action. Never delete rows with SQL.

## Gotchas

- **Node 22.22.3+ or 24.15+ (24 in CI/Docker), native `better-sqlite3`.** The range follows
  Nuxt's own `engines`; after changing the Node version, reinstall dependencies.
- **`"type": "module"`:** the CLI bundles are named `dist/cli.js` and `dist/mcp-stdio.js`.
  Do not rename them to `.mjs` — the Dockerfile and runbook rely on these names.
- **Paths and secrets come from env, not constants.** `NUXT_*` overrides runtimeConfig at
  runtime; `DB_PATH` and `ICONS_DIR` are read directly from `process.env`
  (`server/utils/db.ts`, `server/routes/icons/[file].get.ts`) because compose sets exactly
  those. Do not hardcode paths in code.
- **Icons live in `ICONS_DIR` (default `public/icons`, ignored by git).** The `icons` sync
  downloads `.png` from EXBO; an admin import writes `.webp`. `icon.path` is
  `/icons/<sha1>.<ext>` and `server/routes/icons/[file].get.ts` serves it.
- **SQLite WAL and one process.** Do not open the working database with third-party editors;
  copy the file for inspection.
- **Port:** dev `80` (`stalzone-profile.local`); `DEV_HOST` and `DEV_PORT` override the bind.
- **Sign-in rate limit** counts by socket address; `X-Forwarded-For` is honored only with
  `NUXT_TRUST_PROXY=1` (behind Caddy).
- **Moves and contract changes need a typecheck.** After renaming/deleting files or changing
  shared signatures, run `npm run typecheck:node` for `packages/`/`scripts/`/tests and
  `npm run typecheck` for `server/`/`app/`; focused tests can pass while stale imports remain.
- **Golden** after number/calculator changes: differences are allowed only when documented,
  and they must be explained, not "fixed" by editing the expectation.

## Keeping this document true

- This file is an index, not a second source of truth. When it disagrees with
  `package.json`, the code, the migrations or the tests, the code wins; fix the file in the
  same change.
- Prefer links and commands over copied counts and lists: `package.json` for scripts,
  `packages/mcp/src/registry.ts` for tools, `db/migrations/` for schema history.
- A change that adds or removes a command, module, route, MCP tool or sync source updates
  the matching table here and in `docs/`.
- Historical notes stay historical: label them with a date and do not let them read as
  current rules.

## Definition of Done

1. For a behavior change, there is a test that failed before the change and passes after it.
   Docs-only changes are exempt.
2. Tier 2 is green before the commit, and Tier 3 before push/PR/merge: `npm run check`;
   `npm run golden` when numbers changed; `npm run build` for Docker/deploy/env. A skipped
   tier is stated, not silent.
3. New migrations, fields, routes, tools, scripts and sources are described in `docs/` and
   in the `/guide` page; `tests/unit/app/guide/guide.test.ts` is green.
4. Secrets and personal data did not enter the diff.
5. The finished task is committed in the same change, once Tier 2 is green and the docs,
   changelog and `TODO.md` moved: one Conventional Commit (`feat(scope): …`, `fix: …`,
   `docs: …`) per task, carrying only that task's files — no finished task is left
   uncommitted, and another task's in-flight edits are not swept in. Merge/push/deploy only
   with the repository owner's explicit consent.
6. A schema, API/MCP or displayed-number change has its plan and owner approval, and the
   matching `docs/` and `/guide` entries are updated.
7. `TODO.md` reflects reality: the finished task is ticked, moved to `Done` and has its
   changelog entry; no open task was silently dropped, and the shipped result matches what
   the entry described (or the entry was amended with the owner's agreement).
8. A new composition root or agent surface passes the logger and `EventContext`, and its
   integration test proves the `log_entry` (`category=mcp`, `requestId`, `channel`) and
   `event_log` (`origin`, `request_id`) rows; an assistant failure is a `warn` without
   user text.
