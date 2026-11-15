# CLAUDE.md

@AGENTS.md

The rules in `AGENTS.md` are mandatory. This file only adds what is specific to
Claude working in this repository.

## Working protocol

- Before any code change, follow TDD: a failing test → the minimal implementation →
  a green run. If the `test-driven-development` skill is available, use it.
- Do not say "done", "fixed" or "passes" until you have run the command and read its
  output. At minimum `npm run check`; for `app/` or `server/` also `npm run e2e`;
  for numbers also `npm run golden`.
- Start a multi-file task with a plan and get it agreed when behavior, the DB schema or
  the API/MCP contract changes.
- After context compaction, trust `git log`, `git status` and the files rather than your
  memory of what has already been done.

## Commits

- Do not add yourself as a co-author: no `Co-Authored-By: Claude …` trailers and no
  "Generated with Claude Code" lines — neither in commit messages nor in pull request
  descriptions.

## Boundaries

- Do not print in replies or send outside the values from `.env`, the contents of
  `data/*.db`, `snapshots/`, `public/icons/`: that is personal data. For debugging, work
  with a temporary copy of the DB or through the API/CLI.
- Do not run `git commit`, `git push`, merge, deploy, `docker compose down -v` or delete
  branches/volumes without the owner's explicit request.
- Do not run `npm run db:reset` without checking `DB_PATH`: the command deletes the
  database file.
- Do not call live EXBO/wiki/scpmodel from tests and do not add network calls to
  unit/integration tests.

## Context

- The source of truth for running the project and its variables is `README.md`; for flows
  it is `docs/ARCHITECTURE.md`; for invariants it is `docs/DATA-MODEL.md`.
- Do not duplicate existing components, composables, schemas and repositories: find the
  closest existing equivalent and reuse it.
- Write comments and documentation in English; keep identifiers in English. The only
  Russian in the codebase is the translation catalog and game data.
