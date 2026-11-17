# Contributing

Thanks for taking the time to improve STALZONE Profile. This is a personal project, but
issues and pull requests are welcome.

By participating you agree to keep the project's constraints: no game credentials, no
private game files, public HTTP sources only, and no personal data in commits.

## Before you start

- Read [AGENTS.md](AGENTS.md). It is the canonical rulebook: boundaries, invariants,
  verification tiers and the "update along with code" table.
- For architecture and flows see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); for data
  invariants see [docs/DATA-MODEL.md](docs/DATA-MODEL.md).
- Report security issues through [SECURITY.md](SECURITY.md), never a public issue.

## Setup

Node.js 22+ (24 recommended) and npm.

```bash
npm ci
cp .env.example .env                     # password hash + session secret
npm run hash-password -- 'my-password'   # paste into NUXT_PASSWORD_HASH
openssl rand -hex 32                     # paste into NUXT_SESSION_SECRET
npm run db:migrate
npm run dev                              # http://stalzone-profile.local
```

The database starts empty: sign in and finish `/setup`, or run `npm run sync` from the
terminal. Every variable is described in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

Never commit `.env`, `data/`, `snapshots/`, `public/icons/` or any `*.db*` file.

## Development workflow

1. Open an issue or describe the change before a large pull request.
2. Write a failing test first — TDD is mandatory — then the minimal fix.
3. Keep one logical change per commit and do not reformat unrelated files.
4. Update the documentation the change touches; AGENTS.md lists which files.

```bash
npm test -- tests/integration/writes.test.ts   # focused test
npm run test:related -- <changed files>        # tests importing the change
npm run typecheck:node                         # packages/, server/, scripts/
npm run typecheck                              # app/
npx eslint <changed files>
npm run boundaries
```

### Verification tiers

| Tier                         | When                       | Run                                                                                                     |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1 — inner loop               | while writing test and fix | the one focused test                                                                                    |
| 2 — before a commit          | once per logical change    | typecheck + lint + the affected suites                                                                  |
| 3 — before push, PR or merge | when leaving the branch    | `npm run check`, plus `npm run golden`, `npm run build` or `npm run smoke:mcp` when the change needs it |

The full matrix by changed path is in [AGENTS.md](AGENTS.md#verification-tiers). Do not
claim a green check from focused tests alone: name the tier and the commands you ran.

## Code style

- TypeScript strict, ESM; relative imports inside packages end with `.js`.
- Prettier: single quotes, width 120, semicolons, trailing commas.
- English identifiers, comments, documentation and commit messages. Russian exists only in
  `i18n/locales/ru.json` and as game data.
- API and site use `camelCase`; MCP tools and arguments use `snake_case`.
- Dependencies point one way: `app/server → mcp → core → sources/shared`. The app never
  imports `@dossier/core` and uses `@dossier/shared` only through `/contracts`, `/ranks`
  and `/format`. `npm run boundaries` enforces this.

## Tests

- `tests/unit` — pure functions, no database and no network.
- `tests/integration` — a temporary database plus the public fixture catalog.
- Never call EXBO, stalzone.wiki or scpmodel from tests; pass a fake `fetchImpl` or use
  `tests/fixtures`.
- Cover rollback: the state before and after, container overrides and fill, and the error
  when an entity is missing.

## Commits and pull requests

- Conventional Commits: `feat(scope): …`, `fix: …`, `docs: …`, `refactor: …`, `test: …`,
  `build: …`, `chore: …`.
- One logical step per commit, English messages.
- A pull request states the problem, the approach, the tests run (the tier and the
  commands) and any migration or contract change.
- Do not include personal data, secrets, database files, snapshots or icons.
- Merge, push and deploy are the owner's decision.

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
