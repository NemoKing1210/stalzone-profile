# MCP server

One tool registry serves both stdio and HTTP — results never diverge. There are 35 tools:
18 read and 17 write/maintenance.

## Connecting

### stdio, local database

```bash
DB_PATH=./data/profile.db npm run mcp
# production:
node dist/mcp-stdio.js
```

### stdio over HTTP

```bash
PROFILE_API_URL=https://profile.example.com MCP_TOKEN=... npm run mcp
```

Without `PROFILE_API_URL` the shim opens SQLite directly; with it, it talks to `/mcp`.

### HTTP

`POST /mcp` — stateless Streamable HTTP, header
`Authorization: Bearer <NUXT_MCP_TOKEN>`.
Empty `NUXT_MCP_TOKEN` → 404 (the endpoint is disabled); a wrong token → 401.

Client config:

```json
{
  "mcpServers": {
    "stalzone-profile": {
      "command": "node",
      "args": ["/app/dist/mcp-stdio.js"],
      "env": { "PROFILE_API_URL": "https://profile.example.com", "MCP_TOKEN": "..." }
    }
  }
}
```

## Logging

Every tool call through `/mcp`, local stdio or the built-in assistant writes an `mcp` row
with the client method, duration, `channel` (`mcp`, `stdio` or `chat`) and the request id;
the arguments are `debug` only. A write performed through a tool lands in `event_log` with
`origin: 'mcp'` (or `http` for an assistant turn) and the same `request_id`, so the log line
and the audit event join. `/mcp` triggers and failures are logged at `warn`/`error`; the
built-in assistant's failed or empty turn is a `warn` that never contains the prompt or
message text.

## Write policy

- `dry_run` defaults to `true`: it returns `{ dryRun, diff, eventId? }` and does not change
  the database.
- A real write needs `dry_run: false` **and** `confirm: true`, otherwise `CONFIRM_REQUIRED`.
- No more than 30 applied writes per minute per process; otherwise `RATE_LIMITED`.
- `sync_source` also requires `confirm: true`.
- `rebuild_site` does not rebuild the site: it returns `NOT_SUPPORTED` with the deploy
  command.
- `rollback_event` restores an entity from the `event_log` snapshot. An event written
  before the inventory redesign (`owned.*`, `container.fill`, `profile.clear`,
  `dossier.clear`) answers `EVENT_NOT_ROLLBACKABLE`; so do `rollback` and `log.clear`
  themselves.
- `clear_logs` follows the same gate: it previews by default, and a real purge needs
  `dry_run: false` + `confirm: true`. The purge is audited as `log.clear` and cannot be
  rolled back.

Tool errors: `{ isError: true, content: [{ text: "{\"error\":{\"code\",\"message\"}}" }] }`.

The `profile://schema` resource provides tool descriptions and the write rules.

## Read tools

| Tool | Arguments | What it returns |
|---|---|---|
| `get_character` | — | `{ character, meta }`, derived fields included |
| `find_items` | `q?`, `kind?`, `rank?`, `slot?`, `limit?`, `offset?`, `level?`, `hp?`, `sort?`, `direction?`, `filters?`, `include?` | a ranked list with kind metrics; `summary` skips stats, `full` adds the card and typed stats |
| `describe_catalog` | `kind?` | metric/stat dictionary, kind counts and catalog freshness |
| `get_item` | `id` or `name` + `kind?`, `levels?`, `with_modifications?` | summary, `metrics`, stats filtered to `levels` (default 0 and 15), effects, icon, card; `with_modifications` adds verified compatibility or `NO_COMPAT_DATA` |
| `compare_items` | `items[]` (2–10) or `a` + `b`, `kind?`, `level?`, `hp?` | each item's metrics and `best` per metric |
| `get_inventory` | — | `InventoryRead`: storages (including the intake stash), equipment and the computed loadout |
| `get_inventory_item` | `item_id` | one instance with its placement, container fill or weapon modifications, card and metrics |
| `get_meta` | — | catalog counts and freshness, prices age and source status (`MetaRead`) |
| `list_storages` | — | storages with grid items, weight and effective height (intake reports its expanded height) |
| `list_inventory_items` | `kind?`, `location?`, `storage_id?`, `virtual?` | flat inventory instances with placement, size, container data and the virtual mark; `virtual` filters to only virtual or only real instances |
| `list_containers` | — | container instances and their fill from instance placements |
| `plan_artifact_build` | preset/effects, slots, budget, mode, quality, unique, requireLot | an artifact plan by price |
| `get_prices` | `names[]`, `quality?` | latest prices for each combination |
| `sources_status` | — | source status, `lastOkAt`, `lastError` |
| `export_profile_json` | — | the typed profile JSON (the same shape as `GET /api/v1/admin/export`) |
| `list_logs` | `levels?`, `categories?`, `sources?`, `since?`, `until?`, `text?`, `request_id?`, `fingerprint?`, `min_duration_ms?`, `before?`, `limit?` | `LogQueryResult`: entries, repeat groups and the next cursor |
| `log_stats` | `window_hours?` (default 24) | counts by level/category/source, storage size, queue and settings |
| `get_logging` | — | `LoggingSettings` with effective per-category levels |

## Write and maintenance tools

| Tool | Arguments |
|---|---|
| `add_inventory_item` | `name`, `kind`, `catalog_item_id?`, `level?`, `skin?`, `quality?`, `rarity_pct?`, `rarity_tier?`, `qty?`, `display_name?`, `container?`, `dry_run?`; the slot comes from the catalog item, `catalog_item_id` must name a row of that `kind`, and a skin must match it |
| `update_inventory_item` | `item_id` plus any of `level`, `skin`, `quality`, `rarity_pct`, `rarity_tier`, `qty`, `virtual`, `display_name`, `container` (or `null` to clear); `note`, `role` and `slot` are gone |
| `remove_inventory_item` | `item_id`, `qty?`, `dry_run?` |
| `move_inventory_item` | `item_id`, `target`, `swap?`, `allow_unverified?`, `dry_run?` |
| `create_storage` | `name`, `kind?` (`stash`), `max_weight?`, `sort_order?`, `dry_run?`; the grid is always 8×200 for a stash and 8×20 for the carried grid |
| `update_storage` | `storage_id` plus any of `name`, `max_weight`, `sort_order`; the size is fixed |
| `delete_storage` | `storage_id`, `dry_run?`; the stash is deleted and its items move to intake |
| `auto_arrange_storage` | `storage_id`, `dry_run?` |
| `tidy_storage` | `storage_id`, `order` (`kind \| name \| rank \| footprint`), `dry_run?` |
| `set_container_artifacts` | `container_item_id`, `slots[]` (instance ids or `null`), `dry_run?` |
| `update_logging` | `enabled`, `min_level`, `retention_days`, `max_rows`, `capture_client`, `client_console`, `mirror_stdout`, `levels`, `dry_run?` |
| `clear_logs` | `scope` (`all` or `filtered`), `filter?`, `dry_run?` |
| `set_weapon_modification` | `weapon_item_id`, `slot`, `modification_item_id?` (`null` removes), `allow_unverified?`, `dry_run?` |
| `set_item_layout` | `item_id` (catalog), `width`, `height`, `weight?`, `dry_run?` |
| `sync_source` | `source`: `exbo \| exbo_base \| wiki \| motifs \| scpmodel \| icons \| profile`, `force?`, `confirm`. Resolves `ICONS_DIR` and the STALZONE credentials the same way the CLI does. The realm is not a tool argument: like the CLI and the admin route, a sync binds the default `ru` realm |
| `rollback_event` | `event_id`, `dry_run?` |
| `rebuild_site` | — |

`target` is a discriminated union on `location`: `grid` (`storage_id`, `x`, `y`),
`equipment` (`slot`), `container` (`container_item_id`, `slot`) or
`weapon_modification` (`weapon_item_id`, `slot`, `allow_unverified?`). There is no `loose` target.

A virtual instance is not owned in game but remains a full instance: reads, the payload and
loadout previews include it, and `virtual: true`/`false` filters `list_inventory_items`.

The intake stash (`kind: 'overflow'`) is structural. `add_inventory_item` puts new
instances there; `set_container_artifacts`, `set_weapon_modification` and `remove_inventory_item`
return displaced children there; `delete_storage` packs a deleted stash into it;
`auto_arrange_storage` is the only move in the other direction, packing intake items into a
regular stash. A `grid` target inside intake answers `422 INVALID_PLACEMENT`, as does a
swap whose displaced occupant would land there. `update_storage` and `delete_storage` reject
the inventory and the intake row with `422 VALIDATION`.

An item id that a write takes is an **inventory instance id**, not a catalog item id; the
exception is `set_item_layout`, which changes the catalog layout shared by every instance.
Quantity belongs to stackables only: gear instances always have `qty: 1`.

## Checks

```bash
npm run smoke:mcp
```

The script migrates a temporary database, seeds the public fixture catalog, calls every
read tool and validates responses with zod schemas; it exits with code 1 on the first
mismatch. Set `SMOKE_DB_PATH` to run against a specific database instead.
