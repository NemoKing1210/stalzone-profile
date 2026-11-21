# HTTP API

Base: `/api/v1`, except `/api/auth/*` and `/mcp`. All responses are JSON except the export
(a downloadable file).

## Authentication

An anonymous request to a protected route receives:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

- `POST /api/auth/login` `{ "password": "..." }` — sets the HttpOnly `profile_session`
  cookie; a wrong password returns 401 `INVALID_PASSWORD`.
- `POST /api/auth/logout` — clears the cookie.
- `GET /api/auth/me` — `{ authenticated, expiresAt? }`.

Mutations (`POST/PATCH/PUT/DELETE`) require this host's `Origin` or
`Authorization: Bearer <NUXT_MCP_TOKEN>`. Without an Origin — 403 `ORIGIN_REQUIRED`.

## Errors

```json
{ "error": { "code": "VALIDATION", "message": "Invalid data", "details": [] } }
```

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION` | the body/parameters failed zod |
| 401 | `UNAUTHORIZED` / `INVALID_PASSWORD` | no session / wrong password |
| 403 | `ORIGIN_REQUIRED`, `ORIGIN_MISMATCH` | a mutation from a foreign origin |
| 404 | `NOT_FOUND`, `ITEM_NOT_FOUND`, `STORAGE_NOT_FOUND`, `DETAIL_NOT_FOUND` | the entity or derived card does not exist |
| 413 | `PAYLOAD_TOO_LARGE` | a write body is over 2 MiB, including a chunked body without `Content-Length` |
| 413 | `CLIENT_LOG_BATCH_TOO_LARGE` / `PAYLOAD_TOO_LARGE` | a browser log batch is over 32 KiB |
| 413 | `JOURNAL_TOO_LARGE` | `journal.clear`/`reset.all` would snapshot over 20,000 events or 32 MiB |
| 409 | `NO_CHARACTER`, `NOTHING_TO_CLEAR`, `EVENT_NOT_ROLLBACKABLE`, `ROLLBACK_CONFLICT` and domain conflicts | no character / the cleanup scope is empty / the event predates the inventory redesign / the storage gained items on a snapshot cell since the event / `SLOT_OCCUPIED`, `OUT_OF_BOUNDS`, `CONTAINER_FULL`, `CONTAINER_SLOTS_IN_USE`, `INCOMPATIBLE_ATTACHMENT`, `STORAGE_TOO_SMALL`, `STORAGE_NAME_TAKEN`, `LAYOUT_CONFLICT` |
| 422 | domain write errors | e.g. `INVALID_PLACEMENT`, `NOT_A_CONTAINER`, `NOT_AN_ARTIFACT`, `NOT_A_WEAPON`, `INVALID_LOGGING_SETTINGS`, `INVALID_LOG_PURGE`, `LOG_FILTER_REQUIRED` |
| 429 | `RATE_LIMITED`, `CLIENT_LOG_RATE_LIMITED` | too many sign-in attempts / more than 120 browser log entries per minute from one address |

Messages are English. The web UI localizes known codes with `useApiError`; clients that
need user-facing text should do the same or show the message as-is.

## Reads

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/healthz` | `{ ok: true, db: "ok" }`, public |
| GET | `/api/v1/setup` | `{ needsSetup, catalogItems, defaultRegion, profileApiConfigured, sources }` |
| GET | `/api/v1/payload` | the whole profile: character, gear, catalog, derived cards, icons, freshness and the new `inventory` section. `catalog.meta.items` counts every catalog row (weapons, armor, motifs, artifacts, containers), not only weapons and armor; `catalog.devices` carries the device-category rows that are excluded from `catalog.weapons`/`catalog.armor` |
| GET | `/api/v1/meta` | `{ meta, catalogMeta, freshness }` — described by `MetaRead` in `@profile/shared/contracts` and pinned by `tests/integration/contracts/payload-contract.test.ts` |
| GET | `/api/v1/character` | character with derived fields (`kd`, `accuracy`, `headshot`, `hours`, `arrived`) |
| GET | `/api/v1/items?q=&kind=&rank=&slot=&limit=` | item search; `q` splits into words that must each match a Russian/English name or the category path (`12 ак`, `assault rifle`), ordered exact → prefix → substring; `rank` accepts the normalized key (`master`) or the stored label (`RANK_MASTER`) |
| GET | `/api/v1/items/:id` | item, stats, effects, card, icon |
| GET | `/api/v1/details/:key` | derived card by key `w:`, `a:`, `art:`, `c:` |
| GET | `/api/v1/catalog` | weapon, armor or device catalog (`kind=weapon\|armor\|device`) |
| GET | `/api/v1/inventory` | `InventoryRead`: storages (including the intake stash), the equipment map and the computed loadout (`InventoryReadSchema`) |
| GET | `/api/v1/inventory/items/:id` | one inventory instance with its container artifacts or weapon modules |
| GET | `/api/v1/containers` | container instances with their fill (`ContainerRead` list) for the table page |
| GET | `/api/v1/prices?names=A,B` | `price_latest` by name |
| GET | `/api/v1/sources` | source statuses and age |
| GET | `/api/v1/events?limit=` | change journal; each row carries `requestId`, `origin` (`http`, `api`, or null for MCP/CLI/tests) and a display-only `summary` derived from `before`/`after` |
| GET | `/api/v1/admin/export` | the typed profile JSON (attachment) |
| GET | `/api/v1/admin/cleanup` | counts for every reset scope: `inventory` (`items`, `storages`, `placements`), `manualStats`, `character`, `journal` |
| GET | `/api/v1/logs?levels=&categories=&sources=&since=&until=&text=&requestId=&fingerprint=&minDurationMs=&before=&limit=` | `LogQueryResult`: newest-first entries, repeat groups, `nextBefore` cursor; lists are comma-separated |
| GET | `/api/v1/logs/stats?windowHours=` | `LogStats`: counts by level/category/source, oldest/newest, approximate bytes, queue and settings (`windowHours` 1..720, default 24) |
| GET | `/api/v1/logs/config` | `ClientLogConfig`: `{ enabled, captureClient, clientConsole, levels }` for the browser plugin |
| GET | `/api/v1/admin/logging` | `LoggingSettings`: stored scalars, effective levels and overrides |

## Writes

Every write returns:

```json
{
  "dryRun": false,
  "diff": { "before": {}, "after": {}, "human": "..." },
  "eventId": 42
}
```

`dryRun: true` (or `dry_run` in MCP) returns the diff and changes nothing. The `human`
text is English.

| Method | Path | Body |
|---|---|---|
| POST | `/api/v1/character` | `CharacterCreateSchema`: `nick`, `region` (`ru \| eu \| na \| sea`), optional `faction` (`rise \| frontier \| mercenaries \| covenant` or `null`), `alliance`, `clanName`, `clanRank`, `dryRun`. Creates the character with its default 8×20 carried grid, 8×80 intake and 8×200 stash in one transaction. The profile holds one character: a second create answers `409 CHARACTER_EXISTS` |
| POST | `/api/v1/inventory/items` | `InventoryItemCreateSchema` (strict): resolves the catalog item by optional `catalogItemId` (id and `kind` must match, otherwise `422 UNKNOWN_ITEM`) or by exact name, takes `slot` from it, and accepts `level` for weapons/armor, `qty` for `ammo`/`other`, `rarityPct` for artifacts, and `skin` only when the motif's base is this item; optional `target` (`grid`, `equipment`, `container`, `weapon_module`) and `virtual` (default `false`, an instance not owned in game); without a target the instance lands in intake and a stackable merges with an intake stack |
| PATCH | `/api/v1/inventory/items/:id` | `InventoryItemPatchSchema` (strict): level, rarityPct (artifacts), quantity (stacks), a matching skin, display name, the `virtual` mark, container override; `quality`/`rarityTier` remain accepted only for legacy callers and are derived server-side; `note`, `role` and `slot` are rejected |
| DELETE | `/api/v1/inventory/items/:id` | `DeleteInventoryItemSchema`: `{ qty?, dryRun? }`; a container or weapon returns its children to intake first |
| POST | `/api/v1/inventory/items/:id/move` | `MoveItemSchema`: `target`, optional `swap`, `allowUnverified`, `dryRun`. A `grid` target inside intake answers `422 INVALID_PLACEMENT`; so does a swap whose displaced occupant would land there. `swap: true` with a `grid` target is rejected: grid collisions are resolved by the client, not swapped by the server |
| POST | `/api/v1/inventory/storages` | `StorageCreateSchema`: stash name, optional `maxWeight`; the grid is always 8×200 (the carried grid is 8×20), width/height are not part of the contract, the public contract cannot create an intake row, and a second inventory answers `409 VALIDATION` |
| PATCH | `/api/v1/inventory/storages/:id` | `StoragePatchSchema`: rename, weight limit, order; the size is fixed and width/height are rejected by the schema; the inventory and intake answer `422 VALIDATION` |
| DELETE | `/api/v1/inventory/storages/:id` | `DeleteStorageSchema`: deletes a stash and packs its items into intake; the inventory and intake answer `422 VALIDATION` |
| POST | `/api/v1/inventory/storages/:id/auto-arrange` | `AutoArrangeSchema`: packs intake items into a regular stash by first fit; any other storage answers `422 VALIDATION` |
| POST | `/api/v1/inventory/storages/:id/tidy` | `TidyStorageSchema`: `{ order: kind \| name \| rank \| footprint, dryRun? }`; repacks the items already in that carried grid or stash as one audited write, leaves an item that cannot fit at its cells and reports it in `unplaced`; intake answers `422 VALIDATION` |
| PUT | `/api/v1/inventory/containers/:id/fill` | `ContainerFillWriteSchema`: `{ slots: (id \| null)[], dryRun? }`, the full positional fill |
| PUT | `/api/v1/inventory/weapons/:id/modules/:slot` | `WeaponModuleWriteSchema`: `{ attachmentItemId: id \| null, allowUnverified?, dryRun? }` |
| PATCH | `/api/v1/items/:id/layout` | `ItemLayoutWriteSchema`: `{ width, height, weight?, dryRun? }`; a change that breaks placed instances answers `409 LAYOUT_CONFLICT` |
| PATCH | `/api/v1/character` | `CharacterPatchSchema` |
| POST | `/api/v1/events/:id/rollback` | `{ dryRun? }` |
| POST | `/api/v1/admin/cleanup` | `{ scope?: inventory \| manualStats \| character \| journal \| all, dryRun? }` |
| DELETE | `/api/v1/logs` | `PurgeLogsSchema`: `{ scope: all \| filtered, filter?, dryRun? }`; the preview reports the affected count, the write records `log.clear` |
| PATCH | `/api/v1/admin/logging` | `LoggingSettingsUpdateSchema`: `enabled`, `minLevel`, `retentionDays` (1..365), `maxRows` (1000..2 000 000), `captureClient`, `clientConsole`, `mirrorStdout`, `levels` (`inherit` or a level), `dryRun` |
| GET | `/api/v1/chat/settings` | `ChatSettingsRead`: stored settings plus `apiKeyEnvResolved`, `apiKeyConfigured`, `apiKeySource` (`stored \| env \| none`) and `enabled`. `baseUrl: null` means the provider's documented default endpoint from `CHAT_PROVIDER_META`. The token itself is never returned; `apiKeyEnv` is the fallback variable name, or `null` |
| PATCH | `/api/v1/chat/settings` | `ChatSettingsUpdateSchema`: partial settings plus `dryRun`; the audited `chat.settings.update` event stores `baseUrl: null` as "use the provider default" and a non-null value as a custom endpoint. `apiKey` is the write-only token (`null` clears it): it is used before the environment, excluded from the returned diff and from `event_log`, and a settings rollback leaves the current token unchanged. `apiKeyEnv`, when used by a headless caller, must be an uppercase variable name matching `[A-Z][A-Z0-9_]*` |
| POST | `/api/v1/chat/models` | `ChatModelsRequestSchema`: optional `provider`, `baseUrl`, `apiKey` (an unsaved form token), `apiKeyEnv`, `timeoutMs`; returns `{ ok, status, message, models: [{ id, label }] }`. `baseUrl` omitted or `null` uses the provider default; OpenCode's catalog is read from its documented `/inference/v1/models`. Writes no DB row, no event and never returns the key |
| POST | `/api/v1/chat/turn` | `ChatSendSchema`: `threadId?`, `title?`, `message` (may be empty only with files), `files?` (base64 `ChatAttachmentInput`: `name`, `mimeType`, `data`; at most 4 files, 4 MiB each and 6 MiB decoded in total, images `png/jpeg/webp/gif` or text), `confirm?`, `decline?`. Files are verified from their bytes (images by magic bytes, text as UTF-8 without NUL), stored with a canonical type and SHA-256 in `chat_attachment` beside the user message, text is inlined in the prompt and images go to the provider as image parts; the response's `ChatMessage.attachments` carries metadata without bytes. This route alone accepts a 12 MiB body |
| GET | `/api/v1/chat/attachments/:id` | Bytes of one stored attachment, guarded by the session like every other route. Images use their sniffed media type and `content-disposition: inline`; every text file is served as `text/plain; charset=utf-8` with `attachment`, so an uploaded HTML/JS file cannot execute. `?download=1` forces `attachment`; `sha256` is the `ETag` (`304` on `If-None-Match`); `nosniff`, `default-src 'none'; sandbox` CSP, `same-origin` resource policy and a private immutable cache are always set. An unknown id answers `404 EVENT_NOT_FOUND` |

`CharacterPatchSchema` accepts identity fields (`nick`, `region`, `faction` — one of the
four faction slugs or `null`, `alliance`, `clanName`, `clanRank`, `money`, `maxMoney`)
and `stats`, a map of raw
counter id → number/string/`null`. Writing a value sets the `manual` origin; `null` clears
it and reveals the API value. `reg-tim` must be an ISO date (`YYYY-MM-DD`) in `value_text`;
`pla-tim` accepts hours or `PT…H` and is stored as hours in `value_num`. Derived fields
(K/D, accuracy, headshot share, hours) are read-only and rejected in the patch.

Cleanup resets one scope and writes one `event_log` row whose `before` is the rollback
snapshot. The scope defaults to `inventory`:

| Scope | Action | `before` snapshot |
|---|---|---|
| `inventory` | `inventory.clear` | every storage, instance, placement, container override and item layout |
| `manualStats` | `character.stats.clear` | every `origin='manual'` stat row |
| `character` | `character.delete` | character row, every stat row, the whole instance inventory |
| `journal` | `journal.clear` | every event row, with ids and raw JSON |
| `all` | `reset.all` | the character snapshot plus every event row |

A scope with nothing to remove answers `409 NOTHING_TO_CLEAR`; `character` without a
character answers `409 NO_CHARACTER`. Every scope, including `all`, can be rolled back
from the journal: the `character.delete` and `reset.all` rollbacks refuse with
`409 CHARACTER_EXISTS` when a character was created afterwards, rather than overwriting
it. `character` and `all` leave the site without a character, so the next request lands
on `/setup`.

Character creation writes one `character.create` event with `before: null`. Its rollback
deletes the character only while it has no inventory items; otherwise it answers
`409 CHARACTER_NOT_EMPTY`, because deleting the row would cascade the profile away. The
default storages created with the character do not block the rollback.

An event written before the inventory redesign references dropped tables; rolling it back
answers `409 EVENT_NOT_ROLLBACKABLE` and writes nothing.

## Logs

`POST /api/v1/logs/client` accepts `ClientLogBatchSchema` — an envelope of up to 50 browser
entries and at most 32 KiB of JSON per request, rate-limited to 120 entries per minute per
address. The server forces `source: "client"` and `category: "client"`, validates each entry
alone, drops invalid ones and answers `202` with `{ accepted, rejected }` when anything was
stored, `204` when nothing was accepted, `413 CLIENT_LOG_BATCH_TOO_LARGE` when the payload is
over budget, and `429 CLIENT_LOG_RATE_LIMITED` when the budget is exhausted. Logging
`enabled`/`captureClient` and the `client` level all gate the write.

`GET /api/v1/logs` returns `entries` (newest first, `limit` 1..200, default 50), `groups`
(repeats grouped by fingerprint over the whole filtered set, sample message included),
`nextBefore` and `hasMore` for the cursor. `levels`, `categories` and `sources` accept a
comma-separated list; `since`/`until` are ISO datetimes (`since` inclusive, `until`
exclusive).

A purge is audited once as `log.clear` and is not rollbackable. A filtered purge with no
predicate answers `422 LOG_FILTER_REQUIRED`; `scope: "all"` is the explicit way to clear
everything.

## Sync

`POST /api/v1/admin/sync` (session + Origin):

```json
{ "source": "all", "force": false }
```

`source`: `exbo_base | wiki | motifs | scpmodel | icons | profile | all`. `all` runs the
catalog sources only (`exbo_base`, `wiki`, `motifs`, `scpmodel`, `icons`); `profile` is
opt-in. Response:

```json
{
  "results": [
    { "source": "wiki", "status": "ok", "items": 947, "fetchedAt": "2026-11-15T04:00:00.000Z" }
  ]
}
```

The `icons` result adds `icons` (files written) and `failed` (per-file failures). A single
failed file does not fail the source; when every download fails the result is
`status: "stale"` with `error: "every icon download failed"`. An item whose icon row exists
but whose file is missing from `ICONS_DIR` is downloaded again. The `profile` source requires
the STALZONE client credentials; without them it answers `status: "stale"` with
`error: "STALZONE_API_NOT_CONFIGURED"`. A 2xx profile response without a `stats` array is
treated as stale, so the stored API statistics are not wiped by a degraded answer.

A source failure does not fail the request: `status: "stale"`, an `error` with the text,
and the previous data stays. Inside the 15-minute TTL `scpmodel` does not go to the network
(`items: 0`, `ageMin`).

The route shares a process-wide single-flight lock with the auto-sync scheduler and the
in-process MCP `sync_source` tool: while a sync is running it answers
`409 SYNC_IN_PROGRESS`.

### Auto-sync schedule

`GET /api/v1/admin/sync` (session) returns source diagnostics and the schedule:

```json
{
  "schedule": {
    "enabled": false, "catalogEveryMin": 360, "pricesEveryMin": 60,
    "profileEveryMin": 0, "updatedAt": "2026-11-17T12:00:00.000Z"
  },
  "bundles": [
    { "id": "catalog", "intervalMin": 360, "lastRunAt": null,
      "nextRunAt": "2026-11-17T12:00:00.000Z", "ready": true, "reason": null }
  ],
  "sources": [
    { "id": "exbo_base", "kind": "reference", "url": "https://github.com/EXBO-Studio/stalzone-database",
      "status": "ok", "lastOkAt": "…", "lastTryAt": "…", "lastError": null,
      "commit": "…", "commitDate": "…",
      "records": 1234, "recordMetric": "catalog_items" }
  ],
  "catalogItems": 1234,
  "profileApiConfigured": false
}
```

`records` counts the rows that source owns and `recordMetric` names the unit
(`catalog_items`, `stat_rows`, `motif_items`, `price_quotes`, `icons`,
`character_stats`, `inventory_items`), so the UI never presents a count as bytes. A
source whose metric cannot be measured sends `null`.

Bundles are `catalog` (`exbo_base`, `wiki`, `motifs`, `icons`), `prices` (`scpmodel`) and
`profile`. `nextRunAt` is `max(last_try_at) + interval` across the bundle, or now when no
source has ever been tried. It is `null` when the bundle is not ready, and `reason` explains
why: `disabled`, `off`, `profile_credentials`, `profile_character` or `profile_region`.
`0` is a real empty count; `null` means that source has no data yet or the metric cannot
be measured (for example `profile` before a character exists).

`PUT /api/v1/admin/sync` (session + Origin):

```json
{ "enabled": true, "catalogEveryMin": 360, "pricesEveryMin": 60, "profileEveryMin": 0, "dryRun": false }
```

`0` turns a bundle off; any other interval is `15..10080` minutes. The response is a
`WriteResult`. A real change writes one `sync.schedule.update` event with `before`/`after`
and is rollbackable; a no-op writes no event and returns no `eventId`.

## MCP

`POST /mcp` — stateless Streamable HTTP, `Authorization: Bearer <NUXT_MCP_TOKEN>`.
Without a configured token — 404; with a missing or wrong token — 401. The protocol and
tool list are in `docs/MCP.md`.
