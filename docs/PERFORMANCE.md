# Performance baseline

Measured on 2026-11-21 against the local working database (2 645 items, 54 415
`item_stat` rows, 6 inventory instances) on Windows, Node 24, Chromium via Playwright,
Nuxt dev server. Dev-server numbers are a floor for the production build, not a promise;
repeat the capture after any change to the payload, a read query or a list screen.

## Server: `buildPayload`

`npx tsx scripts/perf-audit.ts [db]` copies the database (including WAL) into a temp dir,
so the live file is never opened by a second writer.

| Metric                                        | Baseline       |
| --------------------------------------------- | -------------- |
| Cold build (fresh cache)                      | 149 ms         |
| Warm build (same `total_changes`)             | < 0.1 ms       |
| Serialized payload                            | 902 KB         |
| `details` cards                               | 662            |
| Catalog rows (weapons / armor / devices)      | 354 / 137 / 17 |
| `item_stat` rows read for the catalog context | 54 415         |

The payload cache keys on `total_changes()` with a 30 s TTL (`read-model/payload.ts`):
every write forces the next request to rebuild all 662 cards. `EXPLAIN QUERY PLAN` for the
per-item stat read shows the expected covering index:
`SEARCH item_stat USING INDEX item_stat_level (item_id=? AND level=?)`.

## Client: first paint (dev server, warm route)

| Page         | TTFB   | FCP    | DOM nodes | Rows rendered |
| ------------ | ------ | ------ | --------- | ------------- |
| `/`          | 49 ms  | 104 ms | 242       | —             |
| `/inventory` | 222 ms | 276 ms | 285       | —             |
| `/devices`   | 429 ms | 500 ms | 357       | 17            |
| `/weapons`   | 70 ms  | 140 ms | 7 707     | 354           |

The `/weapons` first measurement (2.1 s) was a cold Vite compile; the table records the
warm reload. The table view renders all 354 catalog rows with no pagination or
virtualization (`inventory/ui/InventoryScreen.vue`), which is the largest DOM count measured.

## Budget

- Warm `buildPayload` under 5 ms; cold under 250 ms on this fixture size.
- Serialized payload under 1.2 MB.
- Any authenticated page first contentful paint under 500 ms on a warm dev route.
- No screen above 10 000 DOM nodes.

## What the numbers justify

The warm numbers are inside budget; the cold rebuild is only paid after a write and stays
under a fifth of a second. No invasive split is justified by this baseline. The two measured
risks are recorded as their own `TODO.md` entries:

1. **payload size/cold cost** — 662 detail cards and 902 KB are rebuilt for every page after
   any write. Candidate: build card details lazily or cache them per item across cache
   generations.
2. **catalog list rendering** — 354 rows and 7 707 nodes on `/weapons`. Candidate:
   pagination or virtual scrolling once the catalog grows.

Re-run the script and the browser capture after either change and update this table.
