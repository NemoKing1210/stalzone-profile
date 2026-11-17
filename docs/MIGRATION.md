# Migration from the legacy project

Source: a static page backed by a single JSON payload. The data lived in
`data/my-gear.json` (~795 KB); the page loaded the whole payload (~1.2 MB of JS) and there
was no change history.

The repository seeds (`db/seeds/`) contain the dossier, icons, the wiki slice, prices and
the profile. The raw EXBO database (~25 MB, 9,996 items) is not committed: `sync exbo_base`
restores it from the official repository.

## What was migrated

| Artifact | Count |
|---|---|
| items (`item`) | **903** |
| gear rows / copies (`owned`) | **69 / 72** |
| builds (`build`) | **5** |
| detail cards (`details_card`) | **601** |
| catalog positions (`catalog_entry`) | **495** (356 weapons + 139 armor) |
| icons (`icon`) | **99** |
| content blocks (`content_block`) | **7** |
| price rows (`price_snapshot`) | **1,589** (snapshot of 2026-11-14) |

## Number parity

- Every displayed DPS/TTK is recomputed with one formula from damage and rate of fire;
  stored legacy numbers are never substituted.
- `npm run golden` compares 35 weapons, 12 armor pieces, 3 containers, 22 artifacts,
  5 builds, 601 cards and 495 catalog positions.
- Result: **0 mismatches, 0 legacy deltas** — no differences from the original dossier.
  The early "anomalous QBU-191 DPS" turned out to be a row-matching bug by name without
  level; after switching to a `name+level` key and display rounding the delta disappeared.

## Preserved legacy quirks

1. **Duplicate armor entries in the catalog.** The original catalog has two pairs of
   identical names: `Куртка с бронежилетом` and `Бандитский кожак`. Both positions are kept
   in `catalog_entry` with different `position` — order and count match the old page.
   Deduplicating them would change the displayed data.
2. **Three local items.** The gear contains items absent from the sources; they were
   created with `source_id = local` and exact legacy values:
   - `Обрез Chiappa Triple` (weapon)
   - `КИМ-Х «Аппа… Шлено…»` (armor)
   - `Экзоскелет «Морга»` (armor)
3. **Cards and catalog are separate tables.** `item.raw` could not hold exact legacy keys
   (`w:`, `a:`, `art:`, `c:`), duplicates and catalog positions. That is why
   `details_card` and `catalog_entry` exist; the payload reads them first, and the old
   item-derived cards remain a fallback.
4. **Gear copies.** The legacy array expanded every unit; in `owned` identical rows
   collapse into `qty` (35 weapons and 22 artifacts in the dossier produce fewer rows but
   the same copy count).

## Commands

```bash
npm ci
npm run db:migrate
npm run import:legacy
npm run golden
```

The import is idempotent: a repeated run does not create rows (aggregation before upsert,
absolute `qty`, prices skipped by `fetched_at`).

## Rollback and verification

- Export in the old format: `npm run export:json > dossier.json` (or
  `GET /api/v1/admin/export`).
- Every change through the API/MCP writes `event_log` and can be rolled back from the UI
  (`/settings`) or with `rollback_event`.
- Full reset: `npm run db:reset && npm run db:migrate && npm run import:legacy`.
