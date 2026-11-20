# TODO

The single task list. The rules for adding, ordering, closing and pruning tasks live in
[AGENTS.md § Task list](AGENTS.md#task-list-todomd); this file only holds the tasks.

Entry format:

```text
- [ ] <area>: <result> — <how it is proven>
```

## Now

_Nothing queued._

## Next

_Nothing queued._

## Later

_Nothing agreed._

## Done

_Newest first; keep at most ten entries._

- inventory: a grabbed card keeps the cursor on the exact cell it was picked from and moves with the pointer instead of re-centering — proven by `grabPoint`/`previewBox` unit tests for grid, equipment, container and intake sources, plus a manual drag pass in the browser. — `feat(inventory): rework pickup, equipment panes and item details`
- inventory: a right-button press never starts an item drag, only the primary button picks a card up — proven by a unit test on the pointer-down guard that starts the drag and a manual right-drag pass in the browser. — `feat(inventory): rework pickup, equipment panes and item details`
- inventory: the item info panel opens only on a double-click, a single click selects the card without opening it — proven by a unit test on the tile click/double-click handlers and a manual pass over grid, equipment, container and intake sources in the browser. — `feat(inventory): rework pickup, equipment panes and item details`
- inventory: nothing is rendered above the inventory header while an item is dragged (no "Arrows move, R rotates, Enter drops, Esc cancels" line) — proven by a manual drag pass in the browser and by dropping the now-unused `inventory.dragHint` key from both locale catalogs with `tests/unit/i18n-catalogs.test.ts` green. — `feat(inventory): rework pickup, equipment panes and item details`
- inventory: the inventory pane header shows only the storage name, without the "Grid"/"Сетка" hint — proven by a manual pass in both locales and by dropping the now-unused `inventory.grid` key with `tests/unit/i18n-catalogs.test.ts` green. — `feat(inventory): rework pickup, equipment panes and item details`
- inventory: an equipment slot accepts only the item it is meant for — one category-level compatibility table (primary/secondary: ranged weapon, melee: melee weapon, armor: armor, backpack: backpack container, container: artifact container, quick1–4: ammo/consumables) gates the drag targets and the write service, which answers `422 INVALID_PLACEMENT` for every mismatch; proven by unit tests on the table, integration tests per slot/kind pair, and a manual drag pass. — `feat(inventory): rework pickup, equipment panes and item details`
- catalog: the view toggle that currently reads "Grid"/"Сетка" reads "Inventory"/"Инвентарь" on the item catalog pages (weapons, armor, artifacts, containers) — proven by both locale catalogs with `tests/unit/i18n-catalogs.test.ts` green and a manual pass over the four pages. — `feat(inventory): rework pickup, equipment panes and item details`
- inventory: a header toggle swaps the left column between the equipment blocks ("Equipment") and the stash ("Stash"); the stash sits left of the inventory grid with the same cell width, both panes are at least one viewport tall and scroll inside themselves — proven by a manual pass at narrow and wide widths plus unit tests for the pane toggle model, with `npm run typecheck` and `npx eslint app` green. — `feat(inventory): rework pickup, equipment panes and item details`
- inventory: the equipment block is fully redrawn so each slot has the footprint of the item it holds (weapon 5–6×2, armor and containers 3×3, quick 1×1) and a held item fills its slot without cropping — proven by unit tests on the slot-size model and a manual pass with a rifle, armor, backpack, artifact container and quick items in both locales. — `feat(inventory): rework pickup, equipment panes and item details`
- ui: one shared item-details modal renders a detailed, per-kind view (weapon with attachment install/remove, container with artifact-slot tooling, armor/artifact/attachment with their own stats) on every page that shows an item, replacing the separate `WeaponPanel`/`ContainerPanel` blocks on `/inventory` — proven by unit tests for the per-kind section model, `npm run typecheck` + `npx eslint app`, and a manual pass over `/inventory` and the four catalog pages in both locales. — `feat(inventory): rework pickup, equipment panes and item details`
