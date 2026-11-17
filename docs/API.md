# HTTP API

Base: `/api/v1`, except `/api/auth/*` and `/mcp`. All responses are JSON except the export
(a downloadable file).

## Authentication

An anonymous request to a protected route receives:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

- `POST /api/auth/login` `{ "password": "..." }` — sets the HttpOnly `dossier_session`
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
| 404 | `NOT_FOUND` | the entity does not exist |
| 409 | `NO_CHARACTER` and domain conflicts | no character |
| 422 | `ITEM_NOT_FOUND` and domain write errors | the item was not found (with `details.suggestions`) |
| 429 | `RATE_LIMITED` | too many sign-in attempts |

Messages are English. The web UI localizes known codes with `useApiError`; clients that
need user-facing text should do the same or show the message as-is.

## Reads

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/healthz` | `{ ok: true, db: "ok" }`, public |
| GET | `/api/v1/payload` | the whole dossier: character, gear, catalog, cards, builds, freshness |
| GET | `/api/v1/meta` | `{ meta, catalogMeta, freshness }` |
| GET | `/api/v1/character` | character and career |
| GET | `/api/v1/items?q=&kind=&rank=&slot=&limit=` | item search |
| GET | `/api/v1/items/:id` | item, stats, card |
| GET | `/api/v1/details/:key` | legacy card by key `w:`, `a:`, `art:`, `c:` |
| GET | `/api/v1/catalog` | weapon and armor catalog in legacy order |
| GET | `/api/v1/owned?kind=` | the character's gear |
| GET | `/api/v1/containers` | containers with their fill |
| GET | `/api/v1/builds` | builds, meta, avoid, current |
| GET | `/api/v1/builds/:slug` | one build |
| GET | `/api/v1/prices?names=A,B` | `price_latest` by name |
| GET | `/api/v1/sources` | source statuses and age |
| GET | `/api/v1/events?limit=` | change journal |
| GET | `/api/v1/admin/export` | JSON in the old dossier format (attachment) |

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
| POST | `/api/v1/owned` | `OwnedCreateSchema` |
| PATCH | `/api/v1/owned/:id` | `OwnedPatchSchema` |
| DELETE | `/api/v1/owned/:id?qty=` | — (removes one copy or `qty`) |
| PUT | `/api/v1/containers/:id/fill` | `{ artifacts: [{ name, level, quality? }], asOf?, dryRun? }` |
| POST | `/api/v1/builds` | `BuildInputSchema` |
| DELETE | `/api/v1/builds/:slug?dryRun=` | — |
| PUT | `/api/v1/content/:kind` | `ContentBlockInputSchema` (`kind`: `recs`, `earnings`, `builds_meta`, `catalog_meta`) |
| PATCH | `/api/v1/character` | `CharacterPatchSchema` |
| POST | `/api/v1/events/:id/rollback` | `{ dryRun? }` |

## Sync

`POST /api/v1/admin/sync` (session + Origin):

```json
{ "source": "all", "force": false }
```

`source`: `exbo_base | wiki | motifs | profile | scpmodel | all`. Response:

```json
{
  "results": [
    { "source": "wiki", "status": "ok", "items": 947, "fetchedAt": "2026-11-15T04:00:00.000Z" }
  ]
}
```

A source failure does not fail the request: `status: "stale"`, an `error` with the text,
and the previous data stays. Inside the 15-minute TTL `scpmodel` does not go to the network
(`items: 0`, `ageMin`).

## MCP

`POST /mcp` — stateless Streamable HTTP, `Authorization: Bearer <NUXT_MCP_TOKEN>`.
Without a configured token — 404; with a missing or wrong token — 401. The protocol and
tool list are in `docs/MCP.md`.
