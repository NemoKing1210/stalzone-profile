# Migrating a database from the legacy schema

The 2026-11-17 refactor replaced the baseline (`db/migrations/0001_init.sql`) with typed
tables. There is **no automatic data migration**: the old JSON-bearing schema
(`owned`, `container_fill`, `content_block`, `catalog_entry`, `details_card`, `app_meta`)
no longer exists, and reusing the same file name means the runner skips `0001` on an
existing database.

The old database has to be rebuilt. Export first if the data still matters to you.

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

3. Only if you accept an empty dossier until phase 2 (step 5): check where `DB_PATH`
   points, then delete the database and its WAL files:

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
   npm run export:json        # optional: inspect the empty typed dossier
   ```

5. Phase 1 has no character creation: `PATCH /api/v1/character` requires an existing row
   and answers `409 NO_CHARACTER` on an empty database, and MCP has no character-write
   tool. Onboarding arrives in phase 2. Until then a reset database holds only the catalog,
   prices and sources; postpone the destructive reset if you still need the old dossier.

## Verification

```bash
npm run golden   # mismatches: 0, legacyDeltas: []
npm run check
```

`npm run golden` no longer reads a personal dossier: it migrates a temporary database,
seeds the public fixture from `tests/fixtures/`, and recomputes every number with the
single formula in `packages/core/src/modules/catalog/calc/weapons.ts`.

## Rollback

- Every API/MCP write stores its `before`/`after` in `event_log` and can be rolled back
  from `/settings` or with the `rollback_event` tool.
- Full reset: `npm run db:reset && npm run db:migrate && npm run sync` (sync all sources).
