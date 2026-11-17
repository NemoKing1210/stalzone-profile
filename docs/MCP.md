# MCP server

One tool registry serves both stdio and HTTP — results never diverge. There are 26 tools:
12 read and 14 write/maintenance.

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
  `dossier.clear`) answers `EVENT_NOT_ROLLBACKABLE`.

Tool errors: `{ isError: true, content: [{ text: "{\"error\":{\"code\",\"message\"}}" }] }`.

The `profile://schema` resource provides tool descriptions and the write rules.

## Read tools

| Tool | Arguments | What it returns |
|---|---|---|
| `get_character` | — | `{ character, meta }`, derived fields included |
| `find_items` | `q?`, `kind?`, `rank?`, `slot?`, `limit?` | a list of items |
| `get_item` | `id` or `name` + `kind?` | item summary, `stats`, `effects`, `icon`, derived `card` |
| `compare_items` | `a`, `b`, `level` | DPS/TTK and stats of two items |
| `get_inventory` | — | `InventoryRead`: storages, equipment, loose tray and the computed loadout |
| `list_storages` | — | storages with their grid items, size and weight |
| `list_inventory_items` | `kind?`, `location?`, `storage_id?` | flat inventory instances with placement, size and container data |
| `list_containers` | — | container instances and their fill from instance placements |
| `plan_artifact_build` | preset/effects, slots, budget, mode, quality, unique, requireLot | an artifact plan by price |
| `get_prices` | `names[]`, `quality?` | latest prices for each combination |
| `sources_status` | — | source status, `lastOkAt`, `lastError` |
| `export_profile_json` | — | the typed profile JSON (the same shape as `GET /api/v1/admin/export`) |

## Write and maintenance tools

| Tool | Arguments |
|---|---|
| `add_inventory_item` | `name`, `kind`, `level?`, `skin?`, `quality?`, `rarity_pct?`, `rarity_tier?`, `note?`, `role?`, `slot?`, `qty?`, `display_name?`, `container?`, `dry_run?` |
| `update_inventory_item` | `item_id` plus any of `level`, `skin`, `quality`, `rarity_pct`, `rarity_tier`, `note`, `role`, `slot`, `qty`, `display_name`, `container` (or `null` to clear) |
| `remove_inventory_item` | `item_id`, `qty?`, `dry_run?` |
| `move_inventory_item` | `item_id`, `target`, `swap?`, `allow_unverified?`, `dry_run?` |
| `create_storage` | `name`, `kind?` (`stash`), `width?`, `height?`, `max_weight?`, `sort_order?`, `dry_run?` |
| `update_storage` | `storage_id` plus any of `name`, `width`, `height`, `max_weight`, `sort_order` |
| `delete_storage` | `storage_id`, `move_to_storage_id?`, `dry_run?` |
| `auto_arrange_storage` | `storage_id`, `dry_run?` |
| `set_container_artifacts` | `container_item_id`, `slots[]` (instance ids or `null`), `dry_run?` |
| `set_weapon_module` | `weapon_item_id`, `slot`, `attachment_item_id?` (`null` removes), `allow_unverified?`, `dry_run?` |
| `set_item_layout` | `item_id` (catalog), `width`, `height`, `weight?`, `dry_run?` |
| `sync_source` | `source`: `exbo \| exbo_base \| wiki \| motifs \| scpmodel \| icons \| profile`, `force?`, `confirm`. Resolves `ICONS_DIR` and the STALZONE credentials the same way the CLI does. The realm is not a tool argument: like the CLI and the admin route, a sync binds the default `ru` realm |
| `rollback_event` | `event_id`, `dry_run?` |
| `rebuild_site` | — |

`target` is a discriminated union on `location`: `grid` (`storage_id`, `x`, `y`,
`rotated?`), `equipment` (`slot`), `container` (`container_item_id`, `slot`), `weapon_module`
(`weapon_item_id`, `slot`, `allow_unverified?`) or `loose`.

An item id that a write takes is an **inventory instance id**, not a catalog item id; the
exception is `set_item_layout`, which changes the catalog layout shared by every instance.
`add_inventory_item` puts the new instance in the loose tray; use `move_inventory_item` to
place it. Quantity belongs to stackables only: gear instances always have `qty: 1`.

## Checks

```bash
npm run smoke:mcp
```

The script migrates a temporary database, seeds the public fixture catalog, calls every
read tool and validates responses with zod schemas; it exits with code 1 on the first
mismatch. Set `SMOKE_DB_PATH` to run against a specific database instead.
