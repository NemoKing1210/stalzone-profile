# Data model

SQLite in WAL mode is the single source of truth. Changes go only through new migrations
in `db/migrations/`.

## Tables

| Table | Purpose |
|---|---|
| `source` | source status and freshness (`exbo_base`, `wiki`, `motifs`, `profile`, `scpmodel`, `local`) |
| `character` | character and a stats snapshot (`stats JSON`) |
| `item` | the normalized catalog; `raw JSON` keeps the original object whole |
| `item_stat` | key-value stats with refinement level 0…15, ranges and `is_additional` |
| `owned` | the character's gear: `qty` copies, quality, skin, note, `extra` for display |
| `container_fill` | artifacts in a container's slots as of `as_of` |
| `build` / `build_slot` | builds and their rows |
| `price_snapshot` | price history; view `price_latest` — the latest by name+quality+bonus |
| `content_block` | recommendations, earnings, build and catalog meta |
| `icon` | key → icon file (`/icons/<sha1>.webp`, files in `ICONS_DIR`) |
| `app_meta` | service JSON blocks (meta, career, profile, catalog order) |
| `event_log` | write journal: `before`/`after` snapshots for rollback |
| `catalog_entry` | the weapon/armor catalog in exact legacy order, with duplicate positions |
| `details_card` | 601 legacy cards by key `w:`, `a:`, `art:`, `c:` |

Migrations: `0001_init.sql` (base schema), `0002_owned_qty_catalog_details.sql`
(`owned.qty` copies, `display_name`, `catalog_entry`, `details_card`),
`0003_remove_notes_content.sql` (deletes `content_block` rows with `kind = 'notes'`; the
`notes` kind is no longer accepted by the API or MCP, and the deletion is one-way).

## Key invariants

- `item` is unique by `(realm, exbo_id)`; `name_norm` is lower/ё→е/without quotes.
- `owned` is unique by `(character_id, item_id, level, quality, skin_item_id)`; identical
  copies collapse into one row with `qty`.
- `item_stat` — `(item_id, key, level, is_additional)`; new EXBO stats do not require a
  migration.
- `catalog_entry` is unique by `(kind, position)`, so the two pairs of legacy armor
  duplicates are kept as separate positions.
- `price_latest` is computed, not stored: `ROW_NUMBER()` over
  `(name_norm, quality_norm, bonus)`, newest by `fetched_at, id`.
- `event_log.before/after` are part of the rollback contract; the format may change only
  in a backward-compatible way.

## Display formulas

One formula for the whole project (`packages/core/src/calc/weapons.ts`):

```
displayedDmg = round(rawDamage, 1)
dps          = Math.round(displayedDmg * rof / 60)
ttk          = round((ceil(600 / displayedDmg) - 1) * 60 / rof, 2)
```

- `rawDamage` is damage at the required refinement level; `rof` is rounds per minute.
- Damage is rounded first; DPS and TTK are then computed from it.
- Stored legacy values are never used for output. `npm run golden` proves there are no
  differences from the original dossier.

## Item rules

- A skin is not an item: `kind = motif`, its base is found by `name.key`
  (`item.motif.wpn.ks1_ssop` → token `ks1_ssop`) and written to `base_item_id`.
- The rank belongs to the weapon/armor itself, not to the skin.
- "(А)" is a separate item.
- Armor bullet protection comes from the wiki's `numericVariants`, not from
  `bullet_dmg_factor`.
- No lot means `null` ("no lot"), no stat means `null` ("no data"). Zero and a missing
  value never substitute for each other.

## Snapshots and fallbacks

- Every successful sync writes new rows/stats and updates `source.last_ok_at`.
- A sync failure does not delete old data: status `stale`, the error in `last_error`.
- Prices: a 15-minute TTL; on 5xx the previous `price_snapshot` keeps being served through
  `price_latest`, and the UI shows its age.
- The legacy import is idempotent: copies are aggregated before upsert and `qty` is absolute.
