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

- chat(files): attachments are byte-verified (image magic bytes, UTF-8 text without NUL) with a canonical type and `sha256` (migrations `0022`–`0023`), ids never reuse, text is served as `text/plain` with sandbox/`nosniff` headers and revalidating cache, and the chat gains an image carousel (thumbnails, keyboard, zoom, download), a text preview with copy/download, drag-and-drop and paste input, a size meter and a copy-message action. — `feat(chat): harden attachment storage and add file viewers`
- chat(files): the composer attaches images (`png/jpeg/webp/gif`) and text files (4 files, 4 MiB each, 6 MiB total); files live in `chat_attachment` (migration `0021`), text is inlined in the prompt and images reach the provider as real image parts, and messages render thumbnails or download chips from `GET /api/v1/chat/attachments/:id` while the turn alone gets a 12 MiB body. — `feat(chat): attach files to assistant messages`
- inventory(ui): the add-item modal searches the catalog by every word in any order across RU/EN names and category paths, with a rank filter, 40 px icons, owned-instance counts and a rich preview card; motifs, styles and cosmetic variants stay catalog-only. — `feat(inventory): add a smart catalog picker to the add-item modal`
- chat(ui): the assistant side panel fits its controls — a two-row header clear of the close button, `min(94vw, 34rem)` width, the thread menu above the panel, a composer submit button, scrolling tool tables and a locale-independent focus return. — `fix(chat): fit the assistant side panel`
- chat(ui): assistant turns survive leaving `/chat` — one Pinia `stores/chat.ts` keeps threads, messages, per-thread pending confirmations and the in-flight turn; a completion elsewhere toasts the reply, pending write or error through a pure `turnOutcome`, and returning reuses the stored conversation. — `feat(chat): keep assistant turns running across pages`
- chat(ui): the assistant opens as a right-side `USlideover` panel on every page except `/chat`, from the top-bar sparkles button and the `open-assistant` palette command, sharing `ChatConversation` and the store with the page. — `feat(chat): open the assistant as a side panel`
- chat(ui): the model can be switched from the `/chat` header and a searchable Settings picker fed by `POST /api/v1/chat/models`, both PATCHing the same audited `chat_settings.model`. — `feat(chat): switch the assistant model from the header`
- settings(assistant): the tab is five collapsible blocks behind a persisted Basic/Advanced switch; Basic shows only Connection and Save stays outside the blocks. — `feat(settings): group the assistant settings into blocks`
- inventory: any instance can be marked virtual (`0018`), keeps its layout/weight/loadout contribution, carries a dashed `VIRT` badge everywhere, is filterable in `list_inventory_items` and restores exactly on rollback. — `feat(inventory): mark virtual instances`
- inventory: rotation is gone end to end (`0017`) — no `R`, rotated preview or rotated landing; packed rows are upright and a legacy rotated rollback lands in intake unrotated. — `feat(inventory): drop item rotation`
- inventory(ui): Shift + primary click on a tile or filled equipment slot performs one quick move through `quickMove` and one warning toast when blocked. — `feat(inventory): quick-move on Shift click`
- catalog(ui): weapon modals chart the card's `p0`/`p15` damage falloff in inline SVG with axes, legend, an `sr-only` point list and a no-data line. — `feat(catalog): chart weapon damage falloff`
