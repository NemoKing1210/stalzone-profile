# Security policy

STALZONE Profile is a personal, single-user profile. It runs one process, keeps its data in
one SQLite database and reads only public sources. It holds no game credentials and never
signs in to Steam or EXBO.

## Supported versions

Security fixes land on `main` and in the latest `0.1.x` line. Older commits and forks are
not supported.

| Version             | Supported |
| ------------------- | --------- |
| `0.1.x` (`main`)    | Yes       |
| Older snapshot/fork | No        |

## Reporting a vulnerability

Report privately through GitHub Security Advisories:

**https://github.com/NemoKing1210/stalzone-profile/security/advisories/new**

Do not open a public issue, discussion or pull request for a suspected vulnerability. If
advisories are unavailable, contact [@NemoKing1210](https://github.com/NemoKing1210) and ask
for a private channel first.

Please include:

- the affected version or commit;
- what an attacker can do and under which preconditions;
- steps to reproduce, ideally against your own instance;
- any suggested fix or mitigation.

## What to expect

This is a personal project maintained on a best-effort basis; there is no SLA. You can
expect an acknowledgement, a triage decision and, for confirmed issues, a fix and a
coordinated disclosure date. Please allow reasonable time for a fix before publishing
details.

## In scope

- authentication and sessions (`/login`, `profile_session`, origin checks);
- sign-in rate limiting and `X-Forwarded-For` handling;
- MCP authorization (`NUXT_MCP_TOKEN`) and the write policy (`confirm`, rate limit);
- SQL injection, XSS, path traversal (`/icons/*`) and SSRF in source adapters;
- leakage of secrets, `data/`, `snapshots/` or `public/icons/`;
- privilege or data-integrity bugs in the API/MCP write path.

## Out of scope

- an instance exposed without HTTPS or a password, or a shared or leaked MCP token;
- vulnerabilities in upstream sources, dependencies or the Nuxt/Nitro stack — report them
  upstream, but tell us if the project needs a workaround;
- denial of service against a personal instance, brute force of your own password, or
  physical access to the host;
- social engineering and findings that require a compromised machine or browser.

## Safe harbour

Good-faith research is welcome. Use your own instance and data, do not access other
people's data, do not run destructive tests, and do not publish details before a fix is
available. The project will not pursue legal action for accidental, good-faith violations
of this policy.
