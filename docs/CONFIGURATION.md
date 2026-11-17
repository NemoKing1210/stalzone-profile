# Configuration

[README](../README.md) covers the minimal quick start; this file is the reference for every
variable. The template is [`.env.example`](../.env.example).

`.env` is read by `npm run dev`, `npm run build`, the CLI and the scripts. Variables exported
in the shell win over the file. Docker deployments do not read `.env` directly:
[`deploy/docker-compose.yml`](../deploy/docker-compose.yml) forwards the values it needs.

## Variables

| Variable                      | Default                        | Purpose                                                                            |
| ----------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `DB_PATH`                     | `./data/dossier.db`            | SQLite file (Docker: `/data/dossier.db`)                                           |
| `ICONS_DIR`                   | `./public/icons`               | Downloaded `.png` and rendered `.webp` icons (Docker: `/data/icons`)               |
| `SNAPSHOTS_DIR`               | `./snapshots`                  | Backup directory                                                                   |
| `DEV_HOST`                    | `127.0.0.1`                    | Dev-server address; a domain makes the console print it                            |
| `DEV_PORT`                    | `80`                           | Dev-server port                                                                    |
| `NUXT_PASSWORD_HASH`          | —                              | scrypt hash of the site password                                                   |
| `NUXT_PASSWORD`               | —                              | Plain password for development; ignored when the hash is set                       |
| `NUXT_SESSION_SECRET`         | ephemeral                      | HMAC secret for the `dossier_session` cookie                                       |
| `NUXT_MCP_TOKEN`              | —                              | Bearer token for `/mcp`; empty disables the endpoint                               |
| `NUXT_LOGIN_RATE_MAX`         | `5`                            | Sign-in attempts per window                                                        |
| `NUXT_LOGIN_WINDOW_MS`        | `60000`                        | Rate-limit window                                                                  |
| `NUXT_TRUST_PROXY`            | —                              | `1` trusts `X-Forwarded-For`; only behind Caddy or another proxy                   |
| `REALM`                       | `ru`                           | Source region                                                                      |
| `STALZONE_CLIENT_ID`          | —                              | Official STALZONE API client id; one pair serves dev server, CLI and MCP           |
| `STALZONE_CLIENT_SECRET`      | —                              | Official STALZONE API client secret; both it and the id are needed                 |
| `NUXT_STALZONE_CLIENT_ID`     | —                              | Runtime override for the Nuxt server (`/setup`, `/settings`); Docker sets this one |
| `NUXT_STALZONE_CLIENT_SECRET` | —                              | Runtime override for the Nuxt server; Docker sets this one                         |
| `STALZONE_API_URL`            | `https://eapi.stalzone.com`    | Profile API endpoint                                                               |
| `STALZONE_TOKEN_URL`          | `https://exbo.net/oauth/token` | OAuth token endpoint                                                               |

MCP clients may also use:

| Variable          | Default          | Purpose                                                             |
| ----------------- | ---------------- | ------------------------------------------------------------------- |
| `DOSSIER_API_URL` | —                | Make `npm run mcp` talk to a running server instead of local SQLite |
| `MCP_TOKEN`       | `NUXT_MCP_TOKEN` | Bearer token for the stdio-over-HTTP client                         |

## Password and sessions

Set one of `NUXT_PASSWORD_HASH` or `NUXT_PASSWORD`:

```bash
# recommended: scrypt hash
npm run hash-password -- 'my-password'    # paste into NUXT_PASSWORD_HASH

# development shortcut
NUXT_PASSWORD=dev npm run dev
```

`NUXT_SESSION_SECRET` must be at least 32 characters. Without it the server uses an
ephemeral secret and warns in the log: every restart ends all sessions.

## Dev server address

```bash
DEV_HOST=stalzone-profile.local
DEV_PORT=80
```

The dev server binds `127.0.0.1:80` by default. To use the local domain, add one line to the
`hosts` file (administrator rights required):

```
127.0.0.1 stalzone-profile.local
```

With `DEV_HOST=stalzone-profile.local` the console banner prints the domain instead of the
address. A non-IP `DEV_HOST` is appended to `devServer.allowedHosts` automatically.

## Official profile API

The `profile` source fills public statistics (time in game, kills, shots, achievements) from
the official STALZONE API through OAuth client credentials. Both the id and the secret are
required; with either missing, every counter stays editable by hand.

Locally one pair is enough: the server falls back to the plain `STALZONE_CLIENT_*` names,
and so do the CLI and MCP. Docker forwards the pair as `NUXT_STALZONE_CLIENT_*`.

## MCP endpoint

`NUXT_MCP_TOKEN` enables `POST /mcp`. Empty means the endpoint is off and answers 404; a
wrong token answers 401. The token grants access to every tool, including writes: keep it a
separate secret from the site password and rotate it after a leak.

## Rate limiting and proxies

Sign-in attempts are counted per client address. `X-Forwarded-For` is honored only when
`NUXT_TRUST_PROXY=1`, which is correct only behind a proxy that overwrites the header.
Otherwise a client can spoof it and bypass the limit.
