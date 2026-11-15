# Changelog

## 2026-11-15 — first reproducible version

- Repository skeleton: npm workspaces, Nuxt 4 + Nuxt UI, TypeScript strict, ESLint,
  Vitest, Playwright, tsup.
- Shared zod schemas for the API and MCP, name normalization, ranks, formatting.
- SQLite schema: sources, items and stats, gear with `qty`, containers, builds, price
  history, content, icons, event log.
- Legacy dossier import, number parity on one DPS/TTK formula.
- Icons: 99 `.webp` files from `icons.json` are written to `ICONS_DIR` and served at
  `/icons/<sha1>.webp`; weapons, armor, containers and artifacts reference the file
  instead of a data URL.
- Lower layers: repositories, artifact calculation, old JSON export.
- Session auth, sign-in rate limit by socket address (`X-Forwarded-For` only with
  `NUXT_TRUST_PROXY=1`), origin check for mutations.
- REST API `/api/v1`: reads for every section, writes with `dryRun`, journal and rollback.
  Rolling back a container deletion restores `extra` and the fill; rolling back a fill
  without a container returns `409 OWNED_NOT_FOUND`.
- Nuxt UI: nine sections, search, sorting, cards, empty states.
- Editing: gear, character, containers, builds, notes, recommendations, earnings; the
  event log in `/settings`.
- MCP: 21 tools, stdio and stateless HTTP `/mcp`, bearer token, `dry_run`/`confirm`,
  a limit of 30 writes per minute, `dossier://schema`.
- Sources: EXBO adapters (cache by commit), stalzone.wiki (ranges, `additionalStats`,
  TTK 0…15), motifs (219 skins), profile (manual snapshot), scpmodel (15-minute TTL,
  `stale` on failure); sync from `/settings`, the CLI and MCP.
- Deploy: Dockerfile, compose with a `/data` volume, healthcheck, Caddy profile, backups
  kept for 14 days, GitLab CI.
- Documentation: README, architecture, API, MCP, data model, migration, runbook;
  `.env.example`. English documentation; the UI is English with a Russian translation.

### Known limitations

- The profile is updated manually: the official API does not expose it to third-party
  applications, and the inventory is not published either.
- 32 of 219 skins have no known base in the source — `base_item_id` stays empty instead of
  being guessed.
- `rebuild_site` in MCP does not rebuild the site: the deploy does.
