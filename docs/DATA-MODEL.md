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
| `character` | identity: nick, region, faction, alliance, clan, money, stash |
| `character_stat` | raw counters per character and stat, with origin `api` or `manual` |
| `owned_item` | gear: unique by item/level/quality/skin, copies collapse into `qty` |
| `owned_container` | per-container override of type, shield, bonus, protection, slots, efficiency |
| `container_slot` | artifact fill of a container as of `as_of` |
| `event_log` | write journal: `before`/`after` snapshots for rollback |

Migrations: `0001_init.sql` is the typed baseline (replaced once on 2026-11-17 as an
owner-approved reset; that exception is closed). Every later change is a new
`NNNN_*.sql` file. `0002_character_faction.sql` turns `faction` into an enum
(`rise`, `frontier`, `mercenaries`, `covenant`), keeps it nullable, normalizes legacy
free-text values to `NULL` and drops `playstyle`. `0003_drop_builds.sql` drops the
`build`, `build_metric` and `build_slot` tables: the profile now stores only item-centred
entities. Historical `event_log` rows that mention builds remain readable but can no
longer be restored.

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
- `owned_item` is unique by `(character_id, item_id, level, quality, skin_item_id)`; identical
  copies collapse into one row with `qty > 0`.
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
  row with its origin, and every owned row with container overrides and fill. The
  character is recreated with its original id and timestamps on rollback.
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
- Container display precedence: `owned_container` override > `container.*` item stats >
  `null`. Fill comes from `container_slot`.
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
