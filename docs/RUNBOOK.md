# Runbook

## 1. First launch

```bash
git clone <repo> stalzone-profile && cd stalzone-profile
cp .env.example .env
npm run hash-password -- 'password'    # paste into NUXT_PASSWORD_HASH
openssl rand -hex 32                   # paste into NUXT_SESSION_SECRET
```

`NUXT_MCP_TOKEN` is needed only if an agent is allowed HTTP access: it is a separate
secret, not the site password.

Locally:

```bash
npm ci
npm run db:migrate
npm run dev
```

The dev server opens at `http://stalzone-profile.local`; add
`127.0.0.1 stalzone-profile.local` to `hosts`. The port and domain are in `devServer`
in `nuxt.config.ts`.

Then, in the browser:

1. Sign in with the password from `.env`.
2. `/setup` opens on its own: enter the nickname and a live region (`ru`, `eu`, `na`,
   `sea`).
3. Download the catalog (`exbo_base`, `wiki`, `motifs`, `scpmodel`, `icons`). It needs
   internet; skipping leaves the dossier browsable but without items to add.
4. If `NUXT_STALZONE_CLIENT_ID`/`NUXT_STALZONE_CLIENT_SECRET` are set, load the profile
   statistics. Otherwise enter the counters by hand in the character editor.

`/setup` also runs from the terminal: `npm run sync` for the catalog, then the API/MCP for
gear.

## 2. Docker

```bash
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/api/v1/healthz
```

The first start creates `/data/dossier.db` and applies migrations. The catalog on an empty
volume is empty — load it from the sources:

```bash
docker compose -f deploy/docker-compose.yml exec app node dist/cli.js sync
docker compose -f deploy/docker-compose.yml restart app
```

Then sign in. Phase 1 has no onboarding: a fresh database has no character, so the site
stays empty and the API answers `NO_CHARACTER` until phase 2 creates one. The catalog,
prices and sources sync normally.

Check: `http://<host>:3000/login` serves the form; sign in with the password from `.env`.

### TLS

```bash
DOSSIER_DOMAIN=dossier.example.com \
  docker compose -f deploy/docker-compose.yml --profile proxy up -d
```

Caddy obtains the certificate itself (ports 80/443 and DNS are required). Without a domain,
do not enable the `proxy` profile: only HTTPS should face the outside.

Behind a proxy set `NUXT_TRUST_PROXY=1` in `.env`: otherwise the sign-in rate limit counts
every client by Caddy's container IP, and a forged `X-Forwarded-For` bypasses it. Without a
proxy leave the variable empty.

## 3. Backups

Daily (cron outside the container):

```bash
cd /opt/stalzone-profile && deploy/backup.sh
```

Or locally: `npm run backup`. The command uses `db.backup()` (safe with a running WAL),
writes `dossier-<ISO>.db` into `snapshots/` (or `/data/backups`), and deletes copies older
than 14 days.

### Restore

1. Back up the current database (even a broken one).
2. Stop the application.
3. Replace the file and delete the WAL journals:

```bash
docker compose -f deploy/docker-compose.yml stop app
docker run --rm -v stalzone-profile_dossier-data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /backup/dossier-2026-11-15T04-00-00-000Z.db /data/dossier.db && rm -f /data/dossier.db-wal /data/dossier.db-shm'
docker compose -f deploy/docker-compose.yml start app
```

4. Check `/api/v1/healthz` and `/api/v1/sources`.

Checking a copy against a separate file: copy it to `/tmp/check.db` and run the CLI with
`DB_PATH=/tmp/check.db node dist/cli.js export /tmp/check.json` — the export must not fail.

## 4. Sync

```bash
npm run sync                 # catalog sources, sequentially: exbo_base, wiki, motifs, scpmodel, icons
npm run sync scpmodel        # prices only (cached within 15 minutes)
npm run sync icons           # download missing item icons into ICONS_DIR
npm run sync profile         # official STALZONE statistics; needs the client credentials
npm run sync wiki -- --force # ignore the TTL/cache
```

The same actions are buttons in `/setup`, `/settings` and the `sync_source` MCP tool.
`profile` is opt-in and never runs as part of `all`. It deletes only `origin='api'`
statistics and rewrites them; manual overrides win, and a counter missing from the
response disappears instead of staying stale. A response without a `stats` array is
rejected as `stale`, and a rejected profile never touches the stored rows.

`icons` runs after `exbo_base` because it needs the item list. It skips an item only when
both the icon row and the file exist, so a lost `ICONS_DIR` file is downloaded again; if
every download in a run fails the source is `stale`.

If a source fails it stays `stale`: old data remains visible, `/settings` shows
`last_error`, and the freshness badge shows the age. Do not delete the database because of
`stale`; repeat the sync.

## 5. Upgrading

1. `npm run backup` (or `deploy/backup.sh`).
2. `git pull`.
3. `docker compose -f deploy/docker-compose.yml build`.
4. `docker compose -f deploy/docker-compose.yml up -d`. The entrypoint applies new
   migrations.
5. Check healthz, `/settings` (sources), opening a card and one dry-run write.

Rollback: restore the previous image/tag and `up -d`; the database is backward-compatible
only if the migrations are non-destructive. A backup always exists before an upgrade.

## 6. Troubleshooting

| Symptom | What to check |
|---|---|
| 502 from Caddy | `docker compose ps`, `app` logs, healthcheck |
| Every request returns 401 | did `NUXT_SESSION_SECRET` change? after a secret change, sign in again |
| Sign-in returns 429 | rate limit (`NUXT_LOGIN_RATE_MAX`), wait out the 60 s window |
| `/mcp` returns 404 | `NUXT_MCP_TOKEN` is empty — no token configured |
| `/mcp` returns 401 | the `Authorization: Bearer ...` header, the same token |
| Prices do not update | `sources_status`, `last_error`, the 15-minute TTL |
| "no data" for a stat | the source has not synced yet; do not substitute numbers by hand |
| Add button says the catalog is missing | run `/setup` or `npm run sync`, then reload |
| Icons are missing | `npm run sync icons`; check `ICONS_DIR` is writable, `source=icons` in `/settings` |
| Profile sync reports `STALZONE_API_NOT_CONFIGURED` | set both client credentials (Nuxt names for the site, plain names for the CLI) |
| Profile sync reports a 401/403 | rotate/check the client credentials; manual counters stay untouched |
| `SQLITE_BUSY` | do not open the database with a third-party editor; WAL is already enabled |
| The site is empty after deploy | the volume is new: sign in, run `/setup`, or `node dist/cli.js sync` and add the character through the API |

Logs:

```bash
docker compose -f deploy/docker-compose.yml logs -f app
docker compose -f deploy/docker-compose.yml logs -f caddy
```

## 7. Security

- The site is personal: keep it behind HTTPS and a password, with `robots: noindex`.
- Secrets live only in `.env`/CI variables, never in git or images.
- The MCP token grants access to every tool, including writes: keep it a separate secret
  and rotate it after a leak.
- The auction is read-only; the project holds no game credentials.
- Public access to `/api/v1/healthz` is harmless (only `ok`/`db`).
