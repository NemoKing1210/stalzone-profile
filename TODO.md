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

- chat(agent): audit follow-ups — `get_item` renders the item card (payload `{ item }`), a confirmed write does not return `AI_EMPTY`, and `useApiError` uses the global composer so stores created outside setup stop throwing. — `fix(chat): finish the assistant audit follow-ups`
- chat(ui): the `/chat` header shows the provider's live availability — provider label plus a tone dot and Online/Unavailable/Not configured/Checking, a tooltip with the model count or the provider message, and a manual refresh — fed by the same `POST /api/v1/chat/models` probe as the picker and re-run every 60 s while the page is visible; a missing key names its env variable and a failed settings read stays Unknown. — `feat(chat): show provider status in the chat header`
- chat(agent): each tool exposes its real argument schema to the model (so `find_items` gets `q`/`kind`/`rank`/`slot`/`limit`, not `{}`), the last tool round runs without tools so the model must answer from the results, and an empty provider reply returns `AI_EMPTY`; a “top 5 автоматов” turn no longer ends silently after four `find_items` rounds. — `fix(chat): give the model real tool schemas and a final answer`
- chat(agent): a tool-using turn returns its result to the provider in the provider's own protocol — `tool` messages for OpenAI-compatible vendors, `tool_result` blocks for Anthropic and `functionResponse` parts for Google — so the second request no longer fails with `AI_HTTP_400`; saved temperature/max tokens/timeout/retries reach the request, stores use the global i18n composer, and a `404` thread is dropped from the list. — `fix(chat): keep tool results in the provider conversation`
- chat(ui): one thread can be deleted from the `/chat` list and the side panel with a confirmation; `DELETE /api/v1/chat/threads/:id` removes the thread, messages and attachment blobs in one audited `chat.thread.delete` transaction that stores only id/counts, resets the active conversation, and is listed as non-rollbackable. — `feat(chat): delete threads`
- weapons(ui): the weapons page has a third chart view — one damage-by-distance curve per filtered weapon with a stable color, a base/+15 switch, a toggleable legend with DPS/TTK, hover damage/TTK and an `sr-only` summary — plus a persistent Target HP field that recomputes every TTK through the shared `@profile/shared/calc` formula; catalog rows carry `p0`/`p15`, so the chart needs no extra request. — `feat(inventory): chart weapon damage falloff and target HP`
- chat(files): attachments are byte-verified (image magic bytes, UTF-8 text without NUL) with a canonical type and `sha256` (migrations `0022`–`0023`), ids never reuse, text is served as `text/plain` with sandbox/`nosniff` headers and revalidating cache, and the chat gains an image carousel (thumbnails, keyboard, zoom, download), a text preview with copy/download, drag-and-drop and paste input, a size meter and a copy-message action. — `feat(chat): harden attachment storage and add file viewers`
- chat(files): the composer attaches images (`png/jpeg/webp/gif`) and text files (4 files, 4 MiB each, 6 MiB total); files live in `chat_attachment` (migration `0021`), text is inlined in the prompt and images reach the provider as real image parts, and messages render thumbnails or download chips from `GET /api/v1/chat/attachments/:id` while the turn alone gets a 12 MiB body. — `feat(chat): attach files to assistant messages`
- inventory(ui): the add-item modal searches the catalog by every word in any order across RU/EN names and category paths, with a rank filter, 40 px icons, owned-instance counts and a rich preview card; motifs, styles and cosmetic variants stay catalog-only. — `feat(inventory): add a smart catalog picker to the add-item modal`
- chat(ui): the assistant side panel fits its controls — a two-row header clear of the close button, `min(94vw, 34rem)` width, the thread menu above the panel, a composer submit button, scrolling tool tables and a locale-independent focus return. — `fix(chat): fit the assistant side panel`
