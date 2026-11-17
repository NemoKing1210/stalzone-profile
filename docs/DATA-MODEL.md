# Data model

SQLite in WAL mode is the single source of truth. Working tables are typed columns; JSON
is allowed only inside `event_log.before/after` (the rollback snapshot). Schema changes go
only through new migrations in `db/migrations/`.

## Tables

### Reference data (public sources)

| Table | Purpose |
|---|---|
| `source` | source status and freshness (`exbo_base`, `wiki`, `motifs`, `scpmodel`, `icons`, `profile`, `local`) |
| `sync_schedule` | exactly one row: auto-sync master switch and intervals for `catalog`, `prices`, `profile` (`0` = off, otherwise `15..10080` minutes) |
| `stat_definition` | stat ids with category, value type and labels |
| `item` | normalized catalog: one row per external item, `kind` in weapon/armor/container/artifact/attachment/ammo/motif/other |
| `item_stat` | numeric/text stats by `stat_id` and refinement level 0…15, with optional ranges |
| `item_effect` | ordered effect labels of artifacts and other items |
| `icon` | one icon per item: `path` is `/icons/<sha1>.<ext>` (`png` downloaded from EXBO, `webp` from an admin import), files in `ICONS_DIR`; `item` has no icon column |
| `price_quote` | auction price history; view `price_latest` — newest by name+quality+bonus |

### Profile data (the owner)

| Table | Purpose |
|---|---|
| `character` | identity: nick, region, faction, alliance, clan, money |
| `character_stat` | raw counters per character and stat, with origin `api` or `manual` |
| `storage` | the character's own grid: exactly one 8×8 `inventory` plus any number of `stash` storages (default 8×12), each with a unique normalized name |
| `inventory_item` | one row per gear instance (weapon, armor, container, artifact, attachment, ammo, other) with level, quality, rarity, skin, note and display name; `qty > 1` only for `ammo`/`other` |
| `item_placement` | where an instance is: `grid` (storage, x, y, rotated), `equipment` (slot), `container` (container instance, slot), `weapon_module` (weapon instance, module slot) or `loose`; one row per instance |
| `container_data` | per-container override of type, shield, bonus, protection, slots, efficiency |
| `attachment_compat` | EXBO/manual attachment ↔ weapon compatibility pairs |
| `item_layout` | optional catalog-wide grid override: width, height, weight for an `item` |
| `event_log` | write journal: `before`/`after` snapshots for rollback |

Migrations: `0001_init.sql` is the typed baseline. On 2026-11-17 the owner approved a second
reset for the inventory redesign: because the project is not deployed, the baseline and
migrations may be rewritten in place until the first deployment. After that, every change is
a new `NNNN_*.sql` file. `0002_character_faction.sql` turns `faction` into an enum
(`rise`, `frontier`, `mercenaries`, `covenant`), keeps it nullable, normalizes legacy
free-text values to `NULL` and drops `playstyle`. `0003_drop_builds.sql` drops the
`build`, `build_metric` and `build_slot` tables: the profile now stores only item-centred
entities. Historical `event_log` rows that mention builds remain readable but can no
longer be restored. `0004_sync_schedule.sql` adds the single-row auto-sync schedule.
`0005_inventory_schema.sql` adds the instance model additively; `0006_inventory_data.sql`
copies the old `owned_*` rows into it and drops the old tables together with
`character.stash` (the stash becomes a `storage` row). An event written before `0006`
references tables that no longer exist, so `rollbackEvent` answers
`EVENT_NOT_ROLLBACKABLE` for the legacy actions (`owned.*`, `container.fill`,
`profile.clear`, `dossier.clear`) instead of failing halfway.

## Source authority

| Layer | Authority |
|---|---|
| Item existence, realm, external id, ru/en name, kind, category, rank, slot, weight | `exbo_base` |
| Weapon damage per level, armor factor curve, artifact ranges, effect labels | `wiki` |
| Container slots, effectiveness, protection (`container.*` stats) | `wiki` top-level `capacity`, `effectiveness`, `protection` |
| Cosmetics and skin → base item | `motifs` |
| Market prices and lots | `scpmodel` |
| Icon files | `icons` |
| Character statistics | `profile` |
| Manual values | `local` |

A wiki sync binds only `source_id = 'wiki'` stats and the item's effect labels; it never
rewrites an item's name, kind, category, rank, slot, weight or `source_id`. A record that
exists only in wiki is created with `source_id = 'wiki'` when it carries stats, effects or
container fields; a record that carries none is skipped. Rows created by older versions
from the identity-only wiki lists are left in place — a normal `exbo_base → wiki` re-sync
restores EXBO identity for every overlapping row. Wiki numbers are Russian-only; they bind
to the realm passed to the sync (`ru` by default).

The same precedence applies to writes. `item_stat` is keyed without `source_id`, so
`replaceItemStats` refuses to replace a stat slot already owned by a higher-priority source
(`wiki` → `exbo_base` → `scpmodel` → `local`, lower wins). A displayed value therefore no
longer depends on which source synced last, and a source can still replace every slot it
owns itself.

## Key invariants

- Every table is `STRICT`; SQL uses prepared statements only.
- `item` is unique by `(realm, external_id)`; `name_norm` is lower/ё→е/without quotes.
- `item_stat` is keyed `(item_id, stat_id, level, is_additional)`; a new EXBO stat needs a
  `stat_definition` row, not a migration.
- `inventory_item` holds one row per owned thing; only `ammo` and `other` may carry `qty > 1`.
  A weapon, armor, container, artifact or attachment is never collapsed into another row,
  because each carries its own modules, fill, level, quality or placement.
- `storage` has exactly one `inventory` row per character (partial unique index) and unique
  `(character_id, kind, name_norm)` names for stashes. The default inventory is 8×8, the
  default stash 8×12; both are recreated by onboarding and by an inventory clear.
- `item_placement`: exactly one row per instance. Partial unique indices make two instances
  unable to share a grid cell origin, an equipment slot, a container slot or a weapon module
  slot; a trigger rejects a placement whose `character_id` differs from its instance's.
  A `grid` item also needs a free rectangle of its resolved size, checked by the write
  service, not by a database constraint.
- `container_data` exists only for `kind = 'container'` instances; the fill is the set of
  `item_placement` rows whose `container_item_id` points at it and whose slot is below the
  container's effective capacity. A fill row is its own `inventory_item`, not a reference to
  a catalog item.
- `character_stat` is keyed `(character_id, stat_id, origin)`. A manual value wins in
  display; clearing the manual row reveals the API value again. Raw counters are the only
  editable stats — K/D, accuracy, headshot share and hours are derived at read time.
  The `profile` sync owns only `origin='api'` rows: it deletes and rewrites them on every
  success, while manual rows are never touched. Playtime arrives as seconds or an
  ISO-8601 duration and is stored as hours.
- `price_latest` is computed, not stored: `ROW_NUMBER()` over
  `(name_norm, quality_norm, bonus)`, newest by `(fetched_at, id)`.
- `event_log.before/after` are the rollback contract; the format may change only in a
  backward-compatible way, with a rollback test.

## Profile resets

Cleanup exposes five scopes: `inventory`, `manualStats`, `character`, `journal` and `all`.
Each writes one `event_log` row and stores what it removed in `before`:

- `character.delete` and `reset.all` snapshot the character row, every `character_stat`
  row with its origin, and the whole instance inventory (storages, instances, placements,
  container data and item layouts). The character is recreated with its original id and
  timestamps on rollback, and the inventory rows come back under their original ids.
- `inventory.clear` deletes every storage, instance and placement and recreates the default
  8×8 inventory storage; its `before` snapshot holds the raw rows, so rollback restores the
  exact previous state, including the old storage ids.
- `journal.clear` snapshots every event row with its id and raw `before`/`after` strings;
  rollback replaces the journal with that snapshot.
- `reset.all` stores both snapshots, so even a full reset can be undone.
- Reference data (`item`, `price_quote`, `icon`, `source`, `sync_schedule`) is never part
  of a reset. A `character` or `all` reset leaves the database without a character, the
  same state as a fresh install, and the wizard returns.

## Derived reads

Pages and MCP never read stored display values. `packages/core/src/modules/read-model/payload.ts`
assembles the typed rows, and `catalog-view.ts` derives item cards and detail cards at read
time (`details[key]`, weapon/armor/artifact/container cards).

- Derived character fields come from stat ids: `reg-tim` (in the Zone since), `pla-tim`
  (hours), `kil`/`dea` (K/D), `sho-hit`/`sho-fir` (accuracy), `sho-hea`/`sho-hit` (headshot
  share), `ach-gai` (achievements count). Achievement points have no stat id in phase 1 and
  are `null`.
- Container display precedence: `container_data` override > `container.*` item stats >
  `null`. Fill comes from `item_placement` rows of the container instance; the payload has no
  per-fill timestamp, so `artifactsAsOf` is `null`.
- The flat `weapons`/`armor`/`containers`/`artifacts` lists in the payload are a list view
  built from the same instances. Each row keeps `ownedId` (now the instance id) for the
  table UI and adds `instanceId`, `storageId` and `placement`.
- Grid size and weight resolve per item: an `item_layout` override wins over the catalog
  weight/kind defaults, and the app's category model (`app/features/inventory/model/kinds`)
  supplies the per-kind fallback. A pile of `qty` stackables occupies one rectangle.
- No lot means `null` ("no lot"), no stat means `null` ("no data"). Zero, a missing value
  and an estimate never substitute for each other.

## Display formulas

One formula for the whole project (`packages/core/src/modules/catalog/calc/weapons.ts`):

```
displayedDmg = round(rawDamage, 1)
dps          = Math.round(displayedDmg * rof / 60)
ttk          = round((ceil(600 / displayedDmg) - 1) * 60 / rof, 2)
```

- `rawDamage` is damage at the required refinement level; `rof` is rounds per minute.
- Damage is rounded first; DPS and TTK are then computed from it.
- No stored display value is substituted. `npm run golden` recomputes a public synthetic
  fixture and must print `mismatches: 0` and `legacyDeltas: []`.

## Item rules

- A skin is not an item: `kind = motif`, its base is found by `name.key`
  (`item.motif.wpn.ks1_ssop` → token `ks1_ssop`) and written to `base_item_id`.
- The rank belongs to the weapon/armor itself, not to the skin.
- "(А)" is a separate item.
- Armor bullet protection comes from the item's `bullet_dmg_factor` curve (levels 0…15);
  other protection types come from their own `item_stat` rows.
- Effects (artifact bonuses) live in `item_effect` as ordered labels.

## Snapshots and freshness

- Every successful sync writes new rows/stats and updates `source.last_ok_at`.
- A sync failure does not delete old data: status `stale`, the error in `last_error`.
- Prices: a 15-minute TTL; on 5xx the previous `price_quote` keeps being served through
  `price_latest`, and the UI shows its age.
- `sync_schedule` changes only through `setSyncSchedule`: one `sync.schedule.update` event
  carries the four values in `before`/`after`, and rollback restores `before` (including a
  disabled state). A no-op writes nothing.
- Boot backfills `source.url` with each source's public origin (`COALESCE` keeps an existing
  value); `local` has no URL.
- The portable JSON export describes profile content and does not include settings; the
  SQLite backup includes `sync_schedule` like every other table.
- On first run the database is empty apart from migrations and sources: the catalog comes
  from `npm run sync`, gear through the API, MCP or the site.
