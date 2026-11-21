# TODO

The single task list. The rules for adding, ordering, closing and pruning tasks live in
[AGENTS.md § Task list](AGENTS.md#task-list-todomd); this file only holds the tasks.

Entry format:

```text
- [ ] <area>: <result> — <how it is proven>
```

## Now

## Next

## Later

_Nothing agreed._

## Done

_Newest first; keep at most ten entries._

- chat(ui): assistant turns survive leaving `/chat` — one Pinia `stores/chat.ts` keeps threads, messages, per-thread pending confirmations and the in-flight turn; a completion elsewhere toasts the reply, pending write or error through a pure `turnOutcome`, and returning reuses the stored conversation. — `feat(chat): keep assistant turns running across pages`
- chat(ui): the assistant opens as a right-side `USlideover` panel on every page except `/chat`, from the top-bar sparkles button and the `open-assistant` palette command, sharing `ChatConversation` and the store with the page. — `feat(chat): open the assistant as a side panel`
- chat(ui): the model can be switched from the `/chat` header and a searchable Settings picker fed by `POST /api/v1/chat/models`, both PATCHing the same audited `chat_settings.model`. — `feat(chat): switch the assistant model from the header`
- settings(assistant): the tab is five collapsible blocks behind a persisted Basic/Advanced switch; Basic shows only Connection and Save stays outside the blocks. — `feat(settings): group the assistant settings into blocks`
- inventory: any instance can be marked virtual (`0018`), keeps its layout/weight/loadout contribution, carries a dashed `VIRT` badge everywhere, is filterable in `list_inventory_items` and restores exactly on rollback. — `feat(inventory): mark virtual instances`
- inventory: rotation is gone end to end (`0017`) — no `R`, rotated preview or rotated landing; packed rows are upright and a legacy rotated rollback lands in intake unrotated. — `feat(inventory): drop item rotation`
- inventory(ui): Shift + primary click on a tile or filled equipment slot performs one quick move through `quickMove` and one warning toast when blocked. — `feat(inventory): quick-move on Shift click`
- catalog(ui): weapon modals chart the card's `p0`/`p15` damage falloff in inline SVG with axes, legend, an `sr-only` point list and a no-data line. — `feat(catalog): chart weapon damage falloff`
- catalog(ui): list icon wells carry the hatch and a translucent rank edge through one `itemEdgeColor`, cards pin their weight bottom-left, and every item surface shares one asset-free missing-icon mark. — `feat(catalog): polish item wells, weights and fallbacks`
- performance: the page payload drops the full `details` map; owned rows/inventory items carry their card, catalog modals fetch `/api/v1/details/:key`, and catalog stats are read per displayed column with the `item_stat_read` covering index (migration 0016) — `buildPayload` now 58 ms/184 KB versus 149 ms/902 KB. — `perf(read-model): load cards with the rows that need them`
