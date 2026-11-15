# MCP server

One tool registry serves both stdio and HTTP — results never diverge.

## Connecting

### stdio, local database

```bash
DB_PATH=./data/dossier.db npm run mcp
# production:
node dist/mcp-stdio.js
```

### stdio over HTTP

```bash
DOSSIER_API_URL=https://dossier.example.com MCP_TOKEN=... npm run mcp
```

Without `DOSSIER_API_URL` the shim opens SQLite directly; with it, it talks to `/mcp`.

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
      "env": { "DOSSIER_API_URL": "https://dossier.example.com", "MCP_TOKEN": "..." }
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
- `rollback_event` restores an entity from the `event_log` snapshot.

Tool errors: `{ isError: true, content: [{ text: "{\"error\":{\"code\",\"message\"}}" }] }`.

The `dossier://schema` resource provides tool descriptions and the write rules.

## Read tools

| Tool | Arguments | What it returns |
|---|---|---|
| `get_character` | — | character and meta |
| `find_items` | `q?`, `kind?`, `rank?`, `slot?`, `limit?` | a list of items |
| `get_item` | `id` or `name` + `kind?` | item, stats, card, icon |
| `compare_items` | `a`, `b`, `level` | DPS/TTK and stats of two items |
| `list_owned` | `kind?` | gear with `ownedId`, `qty`, qualities |
| `list_containers` | — | containers and their fill |
| `list_builds` | — | builds and meta |
| `get_build` | `slug` | one build |
| `plan_artifact_build` | preset/effects, slots, budget, mode, quality, unique, requireLot | an artifact plan by price |
| `get_prices` | `names[]`, `quality?` | latest prices for each combination |
| `sources_status` | — | source status, `lastOkAt`, `lastError` |
| `export_legacy_json` | — | JSON in the old format |

## Write and maintenance tools

| Tool | Arguments |
|---|---|
| `upsert_owned_item` | `name`, `kind`, `level`, `skin?`, `quality?`, `note?`, `role?`, `dry_run?` |
| `remove_owned_item` | `name`, `kind`, `level?`, `dry_run?` |
| `set_container_artifacts` | `container`, `artifacts[]`, `as_of?`, `dry_run?` |
| `save_build` | `slug`, `title`, `rows[]`, the remaining build fields, `dry_run?` |
| `delete_build` | `slug`, `dry_run?` |
| `upsert_content_block` | `kind`, `slug?`, `title?`, `lead?`, `payload`, `position?`, `dry_run?` |
| `sync_source` | `source`: `exbo \| wiki \| motifs \| profile \| scpmodel`, `force?`, `confirm` |
| `rollback_event` | `event_id`, `dry_run?` |
| `rebuild_site` | — |

`upsert_owned_item` adds one copy, `remove_owned_item` removes one: MCP does not manage
quantity; the site/API with `qty` does.

## Checks

```bash
DB_PATH=./data/dossier.db npm run smoke:mcp
```

The script calls every read tool and validates responses with zod schemas; it exits with
code 1 on the first mismatch.
