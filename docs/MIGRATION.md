# Migrating a database from the legacy schema

Two different histories lead here.

## From the old JSON-bearing schema

The 2026-11-17 refactor replaced the baseline (`db/migrations/0001_init.sql`) with typed
tables. There is **no automatic data migration** from the old JSON-bearing schema
(`owned`, `container_fill`, `content_block`, `catalog_entry`, `details_card`, `app_meta`):
those tables no longer exist, and reusing the same file name means the runner skips `0001`
on an existing database.

The old database has to be rebuilt. Export first if the data still matters to you.

## From the collapsed owned model (0001–0004)

An existing typed database migrates automatically: `npm run db:migrate` applies
`0005_inventory_schema.sql` and `0006_inventory_data.sql`.

- `0005` adds `storage`, `inventory_item`, `item_placement`, `container_data`,
  `attachment_compat` (renamed to `modification_compat` by `0025`) and `item_layout` additively.
- `0006` copies every `owned_item` row into one instance per copy (`qty` expands for
  gear, stackables stay single rows), turns `character.stash` into a `stash` storage,
  copies `owned_container` into `container_data` and turns every `container_slot` into a
  new artifact instance. All migrated gear starts `loose` so it can be arranged in the
  grid; the old tables and `character.stash` are dropped.
- `event_log` rows are kept, but an event that refers to the dropped tables
  (`owned.*`, `container.fill`, `profile.clear`, `dossier.clear`) cannot be rolled back:
  `rollbackEvent` answers `409 EVENT_NOT_ROLLBACKABLE` and writes nothing.

The migration is covered by `tests/integration/migration.test.ts`, which runs `0001`–`0006`
on a temporary database and checks the storages, expanded instances, container fill and
dropped columns. Applying it to a copy of the working database (never the live file) is a
read-only sanity check; `db:reset` is not needed and deletes the profile.

## From modules to modifications (0025)

`0025_rename_modules_to_modifications.sql` renames the weapon gear concept in the schema
and in stored values: item and instance kinds `attachment` → `modification`, the placement
`weapon_module`/`module_slot` → `weapon_modification`/`modification_slot`, the
`attachment_compat` table → `modification_compat`, and the journal action
`inventory.item.module` → `inventory.item.modification`. It is additive and forward-only:
the working database keeps every row and no reset is needed. The migration also rewrites
the exact JSON tokens in `event_log.before`/`after` so earlier events still roll back, and
updates the seeded inventory prompt only while it is untouched. Rolling the code back
after this migration needs a reverse migration.

## Reset procedure

1. Stop the server so nothing writes to the database.

2. Back up and export:

   ```bash
   npm run backup            # snapshot into snapshots/
   npm run export:json       # typed JSON export of the current database
   ```

   On a legacy database the export command may fail because the old schema does not have
   the typed tables. In that case keep the SQLite backup and the previous
   `db/seeds/legacy.json` / `data/my-gear.json`, if you still have them, as the source for
   manual re-entry.

3. Check where `DB_PATH` points, then delete the database and its WAL files:

   ```bash
   npm run db:reset
   ```

   `db:reset` deletes the file at `DB_PATH` plus `-wal`/`-shm`. Never run it without
   checking `DB_PATH` first.

4. Create the schema and load the public catalog:

   ```bash
   npm run db:migrate
   npm run sync exbo_base
   npm run sync wiki
   npm run sync motifs
   npm run export:json        # optional: inspect the empty typed profile
   ```

5. A reset database has no character: the first authenticated browser visit lands on
   `/setup`, and the API answers `409 NO_CHARACTER` until the wizard (or
   `POST /api/v1/character`) creates one. Creation also creates the default 8×8 inventory
   and 8×12 stash storages, so gear can be added immediately.

## Verification

```bash
npm run golden   # mismatches: 0, legacyDeltas: []
npm run check
```

`npm run golden` no longer reads a personal profile: it migrates a temporary database,
seeds the public fixture from `tests/fixtures/`, and recomputes every number with the
single formula in `packages/shared/src/calc/weapons.ts` (re-exported by the core calc module).

## Rollback

- Every API/MCP write stores its `before`/`after` in `event_log` and can be rolled back
  from `/settings` or with the `rollback_event` tool. Events from before the inventory
  redesign are the exception described above.
- Full reset: `npm run db:reset && npm run db:migrate && npm run sync` (sync all sources).
