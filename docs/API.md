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
| 404 | `NOT_FOUND`, `ITEM_NOT_FOUND`, `DETAIL_NOT_FOUND` | the entity or derived card does not exist |
| 409 | `NO_CHARACTER`, `NOTHING_TO_CLEAR` and domain conflicts | no character / the cleanup scope is empty |
| 422 | domain write errors | e.g. `OWNED_NOT_FOUND`, `NOT_A_CONTAINER` |
| 429 | `RATE_LIMITED` | too many sign-in attempts |

Messages are English. The web UI localizes known codes with `useApiError`; clients that
need user-facing text should do the same or show the message as-is.

## Reads

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/healthz` | `{ ok: true, db: "ok" }`, public |
| GET | `/api/v1/setup` | `{ needsSetup, catalogItems, profileApiConfigured, sources }` |
| GET | `/api/v1/payload` | the whole dossier: character, gear, catalog, derived cards, builds, icons, freshness |
| GET | `/api/v1/meta` | `{ meta, catalogMeta, freshness }` |
| GET | `/api/v1/character` | character with derived fields (`kd`, `accuracy`, `headshot`, `hours`, `arrived`) |
| GET | `/api/v1/items?q=&kind=&rank=&slot=&limit=` | item search |
| GET | `/api/v1/items/:id` | item, stats, effects, card, icon |
| GET | `/api/v1/details/:key` | derived card by key `w:`, `a:`, `art:`, `c:` |
| GET | `/api/v1/catalog` | weapon and armor catalog |
| GET | `/api/v1/owned?kind=` | the character's gear with its container override |
| GET | `/api/v1/containers` | containers with their fill |
| GET | `/api/v1/builds` | builds with metrics and rows |
| GET | `/api/v1/builds/:slug` | one build |
| GET | `/api/v1/prices?names=A,B` | `price_latest` by name |
| GET | `/api/v1/sources` | source statuses and age |
| GET | `/api/v1/events?limit=` | change journal |
| GET | `/api/v1/admin/export` | the typed dossier JSON (attachment) |
| GET | `/api/v1/admin/cleanup` | owned records/copies and build count |

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
| POST | `/api/v1/character` | `CharacterCreateSchema`: `nick`, `region` (`ru \| eu \| na \| sea`), optional `faction`, `alliance`, `clanName`, `clanRank`, `playstyle`, `dryRun`. The dossier holds one character: a second create answers `409 CHARACTER_EXISTS` |
| POST | `/api/v1/owned` | `OwnedCreateSchema` (optionally `container` for a container) |
| PATCH | `/api/v1/owned/:id` | `OwnedPatchSchema` (optionally `container` override or `null` to clear) |
| DELETE | `/api/v1/owned/:id?qty=` | — (removes one copy or `qty`) |
| PUT | `/api/v1/containers/:id/fill` | `{ artifacts: [{ name, level, quality? }], asOf?, dryRun? }` |
| POST | `/api/v1/builds` | `BuildInputSchema` |
| DELETE | `/api/v1/builds/:slug?dryRun=` | — |
| PATCH | `/api/v1/character` | `CharacterPatchSchema` |
| POST | `/api/v1/events/:id/rollback` | `{ dryRun? }` |
| POST | `/api/v1/admin/cleanup` | `{ scope: "owned" \| "builds" \| "all", dryRun? }` |

`CharacterPatchSchema` accepts identity fields (`nick`, `region`, `faction`, `alliance`,
`clanName`, `clanRank`, `money`, `maxMoney`, `stash`, `playstyle`) and `stats`, a map of raw
counter id → number/string/`null`. Writing a value sets the `manual` origin; `null` clears
it and reveals the API value. Derived fields (K/D, accuracy, headshot share, hours) are
read-only and rejected in the patch.

Each cleanup scope writes one `event_log` row (`owned.clear`, `build.clear`,
`dossier.clear`) whose `before` is the full snapshot, so Rollback restores the cleared
data. An empty scope answers `409 NOTHING_TO_CLEAR`.

Character creation writes one `character.create` event with `before: null`. Its rollback
deletes the character only while no gear or build exists; otherwise it answers
`409 CHARACTER_NOT_EMPTY`, because deleting the row would cascade the dossier away.

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

The `icons` result adds `icons` (files written) and `failed` (per-file failures that do not
fail the source). The `profile` source requires the STALZONE client credentials; without
them it answers `status: "stale"` with `error: "STALZONE_API_NOT_CONFIGURED"`.

A source failure does not fail the request: `status: "stale"`, an `error` with the text,
and the previous data stays. Inside the 15-minute TTL `scpmodel` does not go to the network
(`items: 0`, `ageMin`).

## MCP

`POST /mcp` — stateless Streamable HTTP, `Authorization: Bearer <NUXT_MCP_TOKEN>`.
Without a configured token — 404; with a missing or wrong token — 401. The protocol and
tool list are in `docs/MCP.md`.
