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

- app: the client data layer uses Pinia + Pinia Colada — one payload query, one write mutation, one query-key map, request-fetch SSR and profile invalidation after writes; proven by `tests/unit/app/stores/query-keys.test.ts`, the query/typecheck suites and a manual pass over the authenticated screens. — `feat: complete the queued UI, inventory and data-layer redesign`
- ui: a real light theme ships beside dark with a persisted pre-hydration switch, and Appearance gains theme, font, density and notification controls — proven by `tests/unit/theme.test.ts`, `tests/unit/appearance.test.ts`, the shell pass in both themes and `npm run build`. — `feat: complete the queued UI, inventory and data-layer redesign`
- ui: the shell is a collapsible side menu with drawer navigation, owned-count badges, account actions and no footer; modal widths fit their content and segmented toggles use the accent; tutorial micro-copy is gone and the rule is in `DESIGN.md`/`AGENTS.md` — proven by the manual RU/EN pass at 600/1400 px, `tests/unit/i18n-catalogs.test.ts` and `npm run check`. — `feat: complete the queued UI, inventory and data-layer redesign`
- inventory: carried and stash grids are fixed at 8 wide, stashes are 8×200 without resize fields, cells fill the pane, stash tabs and a weight block replace the selector, weapon classes and compatible-slot drag highlights use one table — proven by the new layout, stash-tab, slot-highlight, stash-form and equipment integration tests plus a manual pass. — `feat: complete the queued UI, inventory and data-layer redesign`
- inventory: per-container kind/rank/quality filters keep hidden cells and refuse same-container drops, while an explicit audited tidy-up packs a storage by kind/name/rank/footprint and reports overflow — proven by the filter, drop-guard, packing and rollback tests and the `/inventory` manual pass. — `feat: complete the queued UI, inventory and data-layer redesign`
- weapons + armor: owned rows read current-level and +15 damage/DPS/TTK or bullet protection from the payload, catalog rows state the level-15 figure, and DPS/TTK/protection cells carry visible-set comparison bars — proven by row-builder, bars and detail tests plus `/weapons` and `/armor` in both locales. — `feat: complete the queued UI, inventory and data-layer redesign`
- character: faction emblems are local static assets with a fallback, and Edit profile sits in the page header with a rebuilt typed, localized and no-change-aware modal — proven by faction/form tests, the manual edit pass and `npm run typecheck`. — `feat: complete the queued UI, inventory and data-layer redesign`
- events: the journal stores request id, origin and a display-only summary, and the page gains filters, expandable rows and a readable diff without changing the rollback contract — proven by the journal context/rollback tests and the settings pass. — `feat: complete the queued UI, inventory and data-layer redesign`
- settings: Sources names each record metric, buckets freshness, sorts cards, shows relative update ages and links to the data — proven by the sources model tests, diagnostics integration tests and the settings pass. — `feat: complete the queued UI, inventory and data-layer redesign`
- guide: `/guide` is tabbed into site, flows, API, MCP, CLI, sources and guarantees with current contract-tested copy — proven by `tests/unit/app/guide/guide.test.ts` and `tests/unit/i18n-catalogs.test.ts`. — `feat: complete the queued UI, inventory and data-layer redesign`
