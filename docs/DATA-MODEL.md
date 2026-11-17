# Data model

SQLite in WAL mode is the single source of truth. Working tables are typed columns; JSON
is allowed only inside `event_log.before/after` (the rollback snapshot). Schema changes go
only through new migrations in `db/migrations/`.

## Tables

### Reference data (public sources)

| Table | Purpose |
|---|---|
| `source` | source status and freshness (`exbo_base`, `wiki`, `motifs`, `scpmodel`, `local`) |
| `stat_definition` | stat ids with category, value type and labels |
| `item` | normalized catalog: one row per external item, `kind` in weapon/armor/container/artifact/attachment/ammo/motif/other |
| `item_stat` | numeric/text stats by `stat_id` and refinement level 0…15, with optional ranges |
| `item_effect` | ordered effect labels of artifacts and other items |
| `icon` | one icon per item (`/icons/<sha1>.webp`, files in `ICONS_DIR`) |
| `price_quote` | auction price history; view `price_latest` — newest by name+quality+bonus |

### Dossier data (the owner)

| Table | Purpose |
|---|---|
| `character` | identity: nick, region, faction, alliance, clan, money, stash, playstyle |
| `character_stat` | raw counters per character and stat, with origin `api` or `manual` |
| `owned_item` | gear: unique by item/level/quality/skin, copies collapse into `qty` |
| `owned_container` | per-container override of type, shield, bonus, protection, slots, efficiency |
| `container_slot` | artifact fill of a container as of `as_of` |
| `build` | build header and totals |
| `build_metric` | ordered metric rows (`label`, `value`, `sub`) |
| `build_slot` | ordered build rows, either an item reference or a free label |
| `event_log` | write journal: `before`/`after` snapshots for rollback |

Migrations: `0001_init.sql` is the typed baseline (replaced once on 2026-11-17 as an
owner-approved reset; that exception is closed). Every later change is a new
`NNNN_*.sql` file.

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
- `price_latest` is computed, not stored: `ROW_NUMBER()` over
  `(name_norm, quality_norm, bonus)`, newest by `(fetched_at, id)`.
- `event_log.before/after` are the rollback contract; the format may change only in a
  backward-compatible way, with a rollback test.

## Derived reads

Pages and MCP never read stored display values. `packages/core/src/services/payload.ts`
assembles the typed rows, and `catalog-view.ts` derives item cards and detail cards at read
time (`details[key]`, weapon/armor/artifact/container cards).

- Derived character fields come from stat ids: `reg-tim` (in the Zone since), `pla-tim`
  (hours), `kil`/`dea` (K/D), `sho-hit`/`sho-fir` (accuracy), `sho-hea`/`sho-hit` (headshot
  share), `ach-gai` (achievement points).
- Container display precedence: `owned_container` override > `container.*` item stats >
  `null`. Fill comes from `container_slot`.
- No lot means `null` ("no lot"), no stat means `null` ("no data"). Zero, a missing value
  and an estimate never substitute for each other.

## Display formulas

One formula for the whole project (`packages/core/src/calc/weapons.ts`):

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
- On first run the database is empty apart from migrations and sources: the catalog comes
  from `npm run sync`, gear through the API, MCP or the site.
