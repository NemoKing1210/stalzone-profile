# TODO

The single task list. The rules for adding, ordering, closing and pruning tasks live in
[AGENTS.md § Task list](AGENTS.md#task-list-todomd); this file only holds the tasks.

Entry format:

```text
- [ ] <area>: <result> — <how it is proven>
```

## Now

_Nothing open: the catalog query, comparison, compatibility, instance, freshness, tidy and price work shipped._

## Next

_Nothing open._

## Later

- [ ] mcp(loadout): plan a weapon/armor/container/artifact loadout under a budget and an effect priority — blocked on the modification formula: the catalog stores `weapon.stat_factor.*` deltas (for example recoil −10.5) on weapons and modifications, but no code defines whether a delta is a percentage of the base, an additive points change or something else, and the working DB has no `modification_compat` edges. Decide the formula and the budget/priority input with the owner first; until then the tools expose raw deltas and never a combined "weapon with mods" DPS/recoil. Once decided, reuse `metricRow`, `planArtifactBuild` and `get_prices`, add `plan_loadout` as a read tool, and prove it with a pure plan test plus an MCP result-schema test. — design `docs/superpowers/specs/2026-11-21-mcp-catalog-tools-design.md` Open questions 1–2

- [ ] api(catalog): reuse `queryCatalog` in `GET /api/v1/items` and the site catalog — optional parity follow-up: expose `sort`/`filters`/`include` on the HTTP route through the same core service, so the browser table and the agent cannot drift, and update `docs/API.md` plus the route tests. Not required for the assistant fix; do it only if the owner wants the filtering on the site too. — design Open question 3

## Done

_Newest first; keep at most ten entries._

- mcp(catalog): the assistant ranks, filters and describes the catalog in one call — `find_items` carries kind metrics (`damage`, `dps`, `ttk`, `rof`, `recoil`, `spread`, `mag`, `armor`, `protectionBullet`, `slots`, `effectiveness`, `slotEquivalent`, `weight`, `caliber`) at a chosen `level`/`hp`, sorts by a metric or `stat_id` with `direction`, filters by `{key,min,max}` (null never matches), reports `total`/`truncated`, and keeps `include: summary` as the no-stats fast path; `describe_catalog` lists the metric/stat dictionary, kind counts and freshness. `queryCatalog` reads candidates once and stats once; a missing stat stays `null`, an unknown key is `422 UNKNOWN_FILTER`, the candidate cap is 5 000, and every number comes from the existing formula. — `feat(mcp): rank and describe catalog items`
- mcp(compare): compare 2–10 items of any kind and expose modification compatibility — `compare_items` accepts `items` or legacy `a`/`b` plus `kind`/`level`/`hp` and returns `best` per metric; `get_item` filters `stats` by `levels`, returns `metrics`, and `with_modifications` returns `verified: true` with the compatible modifications or `verified: false` + `NO_COMPAT_DATA` (never an inferred fit list). — `feat(mcp): compare any number of catalog items`
- mcp(inventory): one-instance read, catalog freshness, stash tidy and price filters — `get_inventory_item` returns placement, children, card and metrics with `INSTANCE_NOT_FOUND`; `get_meta` returns catalog counts/freshness; `tidy_storage` uses the existing write service and `dry_run`/`confirm` gate; `get_prices` sorts and filters lots. — `feat(mcp): instance detail, freshness and stash tidy`
- modifications(ui): weapon modules are renamed to modifications across the UI, contracts, API, MCP, DB values and the journal (`0025`, non-destructive), and `/modifications` is an inventory page with Owned/Catalog tabs, slot filters/grouping, cards and the install panel; the payload carries `catalog.modifications` and the slot mapping lives in `@profile/shared/modifications`. — `feat(inventory): rename weapon modules to modifications and add the page`
- chat(ui): the assistant chat is redesigned around streamed answers — an SSE turn (`meta`/`delta`/`tool`/`pending`/`done`), Stop without a saved partial reply, safe markdown with code and tables, per-message time and copy, provider reasoning in a collapsed block, `model · tokens` meta (migration 0024), grouped collapsible tool calls, a searchable day-grouped thread pane with a mobile slideover, a real empty state and a character budget; both locales and the scoped DESIGN §4.5 motion set. — `feat(chat): redesign the assistant around streamed answers`
- chat(agent): every assistant tool call and finished turn is in `log_entry` with the turn request id and `channel: chat`, `/mcp` tool calls reuse the HTTP request id and its writes carry `origin: mcp`, stdio logs `channel: stdio`, and unauthorized/malformed/failed MCP requests are logged; provider failures are `warn` without prompt text. — `fix(chat): log assistant tool calls and MCP requests`
- chat(agent): DeepSeek's native tool-call markup returned as text is parsed back into calls and executed; the block is stripped from stored prose, the next transcript and already-stored UI messages, so a provider that leaks DSML never shows raw tags. — `fix(chat): recover leaked DSML tool calls`
- chat(agent): audit follow-ups — `get_item` renders the item card (payload `{ item }`), a confirmed write does not return `AI_EMPTY`, and `useApiError` uses the global composer so stores created outside setup stop throwing. — `fix(chat): finish the assistant audit follow-ups`
- chat(ui): the `/chat` header shows the provider's live availability — provider label plus a tone dot and Online/Unavailable/Not configured/Checking, a tooltip with the model count or the provider message, and a manual refresh — fed by the same `POST /api/v1/chat/models` probe as the picker and re-run every 60 s while the page is visible; a missing key names its env variable and a failed settings read stays Unknown. — `feat(chat): show provider status in the chat header`
- chat(agent): each tool exposes its real argument schema to the model (so `find_items` gets `q`/`kind`/`rank`/`slot`/`limit`, not `{}`), the last tool round runs without tools so the model must answer from the results, and an empty provider reply returns `AI_EMPTY`; a “top 5 автоматов” turn no longer ends silently after four `find_items` rounds. — `fix(chat): give the model real tool schemas and a final answer`
