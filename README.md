# Stalzone Profile

A personal STALZONE dossier: gear, containers and auction prices.
SQLite is the source of truth, Nuxt 4 serves the site and the HTTP API, and MCP gives an
agent access to the same data.

- **Site** — dossier sections with search, sorting and editing.
- **API** — `/api/v1/*` behind session auth; writes go only through the API, MCP or CLI.
- **MCP** — stdio for a local agent and HTTP `/mcp` with a bearer token.
- **Sync** — EXBO database, stalzone.wiki, skins and scpmodel prices.

The data is personal: expose it only over HTTPS and behind a password.

## Quick start

Node.js 24 (22 minimum) and npm are required.

```bash
npm ci
npm run db:migrate        # SQLite schema
npm run dev               # http://stalzone-profile.local
```

The database starts empty apart from migrations and sources. Sign in, and the site sends
you to `/setup`: enter the nickname and region, download the public catalog (EXBO,
stalzone.wiki, motifs, prices, icons) and, when the official profile API is configured,
load the public statistics. Then add gear from the inventory pages or through the API/MCP.

The wizard can be skipped: gear is still editable, but the catalog must be downloaded
before items can be added. `npm run sync` does the same from the terminal. A reset
database is empty again, so do not reset one you still need.

For the local domain add one line to `hosts` (administrator rights required):

```
127.0.0.1 stalzone-profile.local
```

The dev server listens on `127.0.0.1:80` and accepts that `Host`. Set `DEV_HOST` and
`DEV_PORT` in `.env` or the shell to change the address: with
`DEV_HOST=stalzone-profile.local` the console prints the domain instead of `127.0.0.1:80`.
A non-IP `DEV_HOST` is added to the allowed hosts automatically.

The sign-in password is set in one of two ways:

```bash
# recommended: scrypt hash in NUXT_PASSWORD_HASH
npm run hash-password -- 'my-password'

# development: a plain password in NUXT_PASSWORD
NUXT_PASSWORD=dev npm run dev
```

The session secret is `NUXT_SESSION_SECRET`, at least 32 characters long. Without it the
server uses an ephemeral secret and warns in the log: every restart resets all sessions.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DB_PATH` | `./data/dossier.db` | SQLite file (in Docker — `/data/dossier.db`) |
| `ICONS_DIR` | `./public/icons` | icon directory (downloaded `.png`, rendered `.webp`; in Docker — `/data/icons`) |
| `DEV_HOST` | `127.0.0.1` | dev-server address; the local domain makes the console print it |
| `DEV_PORT` | `80` | dev-server port |
| `NUXT_PASSWORD_HASH` | — | scrypt hash of the site password |
| `NUXT_PASSWORD` | — | plain password for development |
| `NUXT_SESSION_SECRET` | ephemeral | HMAC secret for the `dossier_session` cookie |
| `NUXT_MCP_TOKEN` | — | bearer token for `/mcp`; empty disables the endpoint |
| `NUXT_LOGIN_RATE_MAX` | `5` | sign-in attempts per window |
| `NUXT_LOGIN_WINDOW_MS` | `60000` | rate-limit window |
| `NUXT_TRUST_PROXY` | — | `1` trusts `X-Forwarded-For` (only behind Caddy/proxy) |
| `REALM` | `ru` | source region |
| `SNAPSHOTS_DIR` | `./snapshots` | backup directory |
| `STALZONE_CLIENT_ID` | — | official STALZONE API client id; one pair serves the dev server, CLI and MCP |
| `STALZONE_CLIENT_SECRET` | — | official STALZONE API client secret; both it and the id are needed |
| `NUXT_STALZONE_CLIENT_ID` | — | runtime override for the Nuxt server (`/setup`, `/settings`); Docker sets this one |
| `NUXT_STALZONE_CLIENT_SECRET` | — | — |
| `STALZONE_API_URL` | `https://eapi.stalzone.com` | profile API endpoint |
| `STALZONE_TOKEN_URL` | `https://exbo.net/oauth/token` | OAuth token endpoint |

The full template is `.env.example`.

## Production build

```bash
npm run build             # .output/
npm run build:cli         # dist/cli.js and dist/mcp-stdio.js
DB_PATH=/data/dossier.db NUXT_SESSION_SECRET=... node .output/server/index.mjs
```

The schema is applied when the server starts; a separate migration step is optional.

## Docker

```bash
cp .env.example .env      # fill in the password and secret
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
curl http://127.0.0.1:3000/api/v1/healthz
```

The container migrates the database on start and keeps it in the `dossier-data` volume
(`DB_PATH=/data/dossier.db`). The healthcheck hits `/api/v1/healthz`.

TLS through Caddy (optional profile):

```bash
DOSSIER_DOMAIN=dossier.example.com \
  docker compose -f deploy/docker-compose.yml --profile proxy up -d
```

The first start on an empty volume has no catalog. Load it:

```bash
docker compose -f deploy/docker-compose.yml exec app \
  node dist/cli.js sync
```

### Backups

```bash
npm run backup                    # snapshots/dossier-<time>.db, kept for 14 days
deploy/backup.sh                  # the same inside the container, /data/backups
```

Restore: stop the application, put the copy in place of `DB_PATH` (and remove
`-wal`/`-shm`), then start it. Details are in `docs/RUNBOOK.md`.

## Source sync

```bash
npm run sync                # catalog sources: exbo_base, wiki, motifs, scpmodel, icons
npm run sync wiki           # one: exbo_base | wiki | motifs | scpmodel | icons | profile
npm run sync scpmodel -- --force
```

`profile` is never part of `all`: it needs `STALZONE_CLIENT_ID`/`STALZONE_CLIENT_SECRET`
and replaces only the API-owned statistics.

The same is available through buttons in `/settings` and the `sync_source` MCP tool.
A source failure marks it `stale`: the previous snapshot stays, and the UI shows its age
and the error text. Prices refresh at most once every 15 minutes.

## Interface languages

The site defaults to English and ships a Russian translation. The language switch is in
the header (and on the sign-in page) and persists in the `dossier_lang` cookie.
Catalogs live in `i18n/locales/en.json` and `i18n/locales/ru.json`; see `docs/I18N.md`
for the key layout, the data-versus-interface boundary and how to add a language.

## MCP

stdio with a local database:

```bash
DB_PATH=./data/dossier.db npm run mcp
```

stdio over HTTP (the same tools, another machine):

```bash
DOSSIER_API_URL=https://dossier.example.com \
MCP_TOKEN=... npm run mcp
```

Claude Code / Aside connect the server with:

```json
{
  "mcpServers": {
    "stalzone-profile": {
      "command": "node",
      "args": ["/app/dist/mcp-stdio.js"],
      "env": {
        "DOSSIER_API_URL": "https://dossier.example.com",
        "MCP_TOKEN": "same-token-as-NUXT_MCP_TOKEN"
      }
    }
  }
}
```

The HTTP endpoint `POST /mcp` (stateless Streamable HTTP) requires
`Authorization: Bearer <NUXT_MCP_TOKEN>`. If no token is configured, it returns 404.
Writes default to `dry_run`; a real write needs `confirm: true` and is limited to
30 changes per minute. The full tool list is in `docs/MCP.md`.

## Checks

```bash
npm run check      # typecheck + lint + unit/integration
npm run golden     # formula regression on a public synthetic fixture: 0 mismatches
npm run build
npm run smoke:mcp  # all read-only MCP tools against a temporary fixture database
```

## Layout

```
app/                 Nuxt UI: pages, forms, components
server/              Nitro: API, auth middleware, /mcp
packages/core/       schema, repositories, calculations, writes, sync, payload
packages/shared/     zod schemas, formatting, ranks
packages/sources/    EXBO, wiki, motifs, scpmodel adapters
packages/mcp/        tool registry, stdio and HTTP transports
db/migrations/       SQL migrations
deploy/              Dockerfile, compose, Caddy, backup
scripts/             CLI, golden, smoke
docs/                architecture, API, MCP, data model, migration, runbook
```

## Constraints

- No game credentials: the project does not sign in to Steam/EXBO and does not read game
  files. Only public HTTP sources.
- The auction is read-only: prices and lots, no buying or listing.
- Numbers are never invented: no lot means "no lot", no stat means "no data".
- `dossier.db` and the export are not edited by hand — only through the API, MCP or CLI.
- All secrets live in environment variables, never in the repository.
