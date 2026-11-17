<div align="center">

<h1>STALZONE Profile</h1>

<p><strong>A personal STALZONE profile</strong> — gear, containers and auction prices,<br>
backed by one SQLite database and exposed through a Nuxt site, a REST API and MCP.</p>

<p>
  <img alt="Node.js 22+" src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white">
  <img alt="Nuxt 4" src="https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white">
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="SQLite WAL" src="https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg">
</p>

</div>

## Overview

- **Site** — profile sections with search, sorting, grouping and editing.
- **Inventory** — a cell grid with per-item size and weight, multiple stashes, the game's
  equipment slots, containers with artifact slots and weapons with modules.
- **API** — `/api/v1/*` behind session auth; writes go only through the API, MCP or CLI.
- **MCP** — stdio for a local agent and HTTP `/mcp` with a bearer token.
- **Sync** — EXBO database, stalzone.wiki, skins, icons and scpmodel prices.

One process, one database, no separate worker. The data is personal: expose the site only
over HTTPS and behind a password.

## Quick start

Node.js 22+ (24 recommended) and npm.

```bash
npm ci
cp .env.example .env                     # password hash + session secret
npm run hash-password -- 'my-password'   # paste into NUXT_PASSWORD_HASH
openssl rand -hex 32                     # paste into NUXT_SESSION_SECRET
npm run db:migrate
npm run dev                              # http://stalzone-profile.local
```

Add `127.0.0.1 stalzone-profile.local` to your `hosts` file, sign in, and complete the
`/setup` wizard: nickname, region, catalog download. The database starts empty, so the
catalog must be downloaded before items can be added; `npm run sync` does the same from the
terminal.

- First launch, Docker, backups, upgrades and troubleshooting — [docs/RUNBOOK.md](docs/RUNBOOK.md)
- Every environment variable — [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- Tests, style and verification tiers — [CONTRIBUTING.md](CONTRIBUTING.md)

## Documentation

| Topic                                              | Document                               |
| -------------------------------------------------- | -------------------------------------- |
| First launch, Docker, backups, upgrades, incidents | [Runbook](docs/RUNBOOK.md)             |
| Reading the diagnostic log (`/logs`, `npm run logs`) | [Runbook §6](docs/RUNBOOK.md#6-troubleshooting) |
| Environment variables and secrets                  | [Configuration](docs/CONFIGURATION.md) |
| Components, packages, read and write flows         | [Architecture](docs/ARCHITECTURE.md)   |
| REST routes, payloads and errors                   | [API](docs/API.md)                     |
| MCP tools, write policy and clients                | [MCP](docs/MCP.md)                     |
| Tables, invariants and derived values              | [Data model](docs/DATA-MODEL.md)       |
| Rebuilding or migrating a database                 | [Migration](docs/MIGRATION.md)         |
| Interface text and locales                         | [i18n](docs/I18N.md)                   |
| How to change the code safely                      | [AGENTS.md](AGENTS.md)                 |
| Notable changes                                    | [Changelog](CHANGELOG.md)              |

## Layout

```
app/                 Nuxt UI slices: shared, entities, features, pages
server/              Nitro: API, auth middleware, /mcp
packages/core/       platform + domain modules (catalog, identity, inventory, …)
packages/shared/     contracts (zod), formatting, ranks
packages/sources/    EXBO, wiki, motifs, scpmodel adapters
packages/mcp/        tool registry, stdio and HTTP transports
db/migrations/       SQL migrations
deploy/              Dockerfile, compose, Caddy, backup
scripts/             CLI, golden, smoke
docs/                architecture, API, MCP, data model, configuration, runbook
```

## Constraints

- No game credentials: the project does not sign in to Steam/EXBO and does not read game
  files. Only public HTTP sources.
- The auction is read-only: prices and lots, no buying or listing.
- Numbers are never invented: no lot means "no lot", no stat means "no data".
- `profile.db` and the export are not edited by hand — only through the API, MCP or CLI.
- All secrets live in environment variables, never in the repository.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before a pull request; the canonical rules are in
[AGENTS.md](AGENTS.md). Report vulnerabilities privately through
[SECURITY.md](SECURITY.md) — never in a public issue.

## License

[MIT](LICENSE) © 2026 NemoKing1210. STALZONE and its game data belong to EXBO; this project
is unofficial and is not affiliated with or endorsed by them.
