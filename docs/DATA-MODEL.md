# Data model

SQLite in WAL mode is the single source of truth. Working tables are typed columns; JSON
is allowed only inside `event_log.before/after` (the rollback snapshot) and the derived
`event_log.summary` (a display aid that is never read by rollback). Schema changes go
only through new migrations in `db/migrations/`.

## Tables

### Reference data (public sources)

| Table | Purpose |
|---|---|
| `source` | source status and freshness (`exbo_base`, `wiki`, `motifs`, `scpmodel`, `icons`, `profile`, `local`) |
| `sync_schedule` | exactly one row: auto-sync master switch and intervals for `catalog`, `prices`, `profile` (`0` = off, otherwise `15..10080` minutes) |
| `stat_definition` | stat ids with category, value type and labels |
| `item` | normalized catalog: one row per external item, `kind` in weapon/armor/container/artifact/attachment/ammo/motif/other |
| `item_stat` | numeric/text stats by `stat_id` and refinement level 0…15, with optional ranges |
| `item_effect` | ordered effect labels of artifacts and other items |
| `icon` | one icon per item: `path` is `/icons/<sha1>.<ext>` (`png` downloaded from EXBO, `webp` from an admin import), files in `ICONS_DIR`; `item` has no icon column |
| `price_quote` | auction price history; view `price_latest` — newest by name+quality+bonus |

### Profile data (the owner)

| Table | Purpose |
|---|---|
| `character` | identity: nick, region, faction, alliance, clan, money |
| `character_stat` | raw counters per character and stat, with origin `api` or `manual` |
| `storage` | the character's own grids: exactly one 8×20 `inventory`, exactly one 8×80 `overflow` (the intake stash, which grows with its contents) and any number of 8×200 `stash` rows, each with a unique normalized name per kind; a stash size is fixed after creation |
| `inventory_item` | one row per gear instance (weapon, armor, container, artifact, attachment, ammo, other) with level, quality, rarity, skin, display name, the catalog's slot and `is_virtual` (not owned in game but a full instance for layout, weight and loadout previews); `qty > 1` only for `ammo`/`other`. No free-text note or role columns |
| `item_placement` | where an instance is: `grid` (storage, x, y), `equipment` (slot), `container` (container instance, slot) or `weapon_module` (weapon instance, module slot); one row per instance. `loose` survives only as a legacy/transient value: it is never a write target, `0008` converts stored rows, and the read model reports any unplaced instance as `loose` |
| `container_data` | per-container override of type, shield, bonus, protection, slots, efficiency |
| `attachment_compat` | EXBO/manual attachment ↔ weapon compatibility pairs |
| `item_layout` | optional catalog-wide grid override: width, height, weight for an `item` |
| `event_log` | write journal: `before`/`after` rollback snapshots plus `request_id`, `origin` and a derived `summary` for reading an entry without guessing |

### Assistant (conversation data)

| Table | Purpose |
|---|---|
| `chat_settings` | one row: provider, endpoint override, model, limits, read-tool allow-list, price/log data scope and the write-only token; secrets never enter `event_log` |
| `chat_thread`, `chat_message` | the owner's threads and their ordered messages (`user`, `assistant`, `tool`) with the rendered tool `payload`, the provider's `reasoning` and a `meta` JSON (`model`, round duration, token usage); a value the provider did not send stays `NULL` |
| `chat_attachment` | a file the owner attached to one user message: `name`, `mime_type`, `size`, `sha256` and the bytes in `data`; bytes are verified at write time (magic-byte image type, UTF-8 text without NUL), cascade with the message and thread, and the read API returns metadata only |
| `chat_prompt`, `chat_prompt_active` | versioned `system`/`skill` prompts and the active pointer |

### Diagnostics (not profile data)

| Table | Purpose |
|---|---|
| `log_setting` | exactly one row: enabled, minimum level, retention days, row cap, browser capture flags and stdout mirror |
| `log_level` | optional per-category override (`http`, `sync`, `mcp`, `db`, `app`, `client`); an absent row inherits the minimum |
| `log_entry` | diagnostic entries: level, category, source, message, redacted JSON context, stack, request id, fingerprint, duration; indexes cover time, level, category, fingerprint and request id |

Migrations: `0001_init.sql` is the typed baseline. On 2026-11-17 the owner approved a second
reset for the inventory redesign: because the project is not deployed, the baseline and
migrations may be rewritten in place until the first deployment. After that, every change is
a new `NNNN_*.sql` file. `0002_character_faction.sql` turns `faction` into an enum
(`rise`, `frontier`, `mercenaries`, `covenant`), keeps it nullable, normalizes legacy
free-text values to `NULL` and drops `playstyle`. `0003_drop_builds.sql` drops the
`build`, `build_metric` and `build_slot` tables: the profile now stores only item-centred
entities. Historical `event_log` rows that mention builds remain readable but can no
longer be restored. `0004_sync_schedule.sql` adds the single-row auto-sync schedule.
`0005_inventory_schema.sql` adds the instance model additively; `0006_inventory_data.sql`
copies the old `owned_*` rows into it and drops the old tables together with
`character.stash` (the stash becomes a `storage` row). An event written before `0006`
references tables that no longer exist, so `rollbackEvent` answers
`EVENT_NOT_ROLLBACKABLE` for the legacy actions (`owned.*`, `container.fill`,
`profile.clear`, `dossier.clear`) instead of failing halfway. `0007_logging.sql` adds the
three STRICT diagnostic tables and seeds the single `log_setting` row.
`0008_overflow_storage.sql` adds the `overflow` storage kind, resizes the inventory to
8×20, raises stashes still on the old 8×12 default to 40×80, inserts one `Intake` row per
character and converts every stored `loose` placement into a deterministic intake grid
cell (one column, cumulative heights) so no origin collides.
`0009_event_context.sql` adds three nullable `event_log` columns — `request_id` (the HTTP
`x-request-id`, also stored on `log_entry`), `origin` (`http` for a session write, `api` for
a bearer-token write; NULL for MCP, CLI and tests) and `summary` (JSON
`{ kind, fields }` derived from the snapshot pair) — plus an index on `request_id`. Existing
rows keep NULL context and stay readable; `/api/v1/events` derives the summary for them at
read time. `0010_stash_grid_dimensions.sql` rebuilds `storage` with a 1..200 height check,
normalizes the carried grid to 8×20 and every stash to 8×200, and leaves the then-40×80
intake unchanged. `0015_intake_grid_width.sql` resizes the intake to eight columns, keeps its
80-row base height and repacks every intake placement into one column (x=0, unrotated,
cumulative y) through a temp copy, then rebuilds the unique grid-origin index.
`0016_item_stat_read_index.sql` adds a covering index over the card columns of `item_stat`, so
the payload reads its stats without a table lookup. `0017_drop_item_rotation.sql` moves every
`rotated = 1` grid row into its character's intake as an upright single-column row after the
existing unrotated intake rows, then drops `item_placement.rotated`: the original game has no
turning, so no manual, preview or automatic rotation exists. Unrotated rows keep their cells.
A legacy rollback snapshot containing `rotated: true` restores into the intake unrotated.
`0018_inventory_virtual.sql` adds `inventory_item.is_virtual` (0/1, default 0), so old rows
read as real and a rollback restores the exact flag. `0021_chat_attachments.sql` adds
`chat_attachment`, the files attached to an assistant message. `0022_chat_attachment_hash.sql`
adds `sha256`, which doubles as the attachment route's strong ETag; `0023_chat_attachment_ids.sql`
rebuilds the table with `AUTOINCREMENT` so a deleted attachment id is never reused.
`0024_chat_message_meta.sql` adds `chat_message.reasoning` and `chat_message.meta`; both stay
`NULL` when the provider reported nothing.

## Source authority

| Layer | Authority |
|---|---|
| Item existence, realm, external id, ru/en name, kind, category, rank, slot, weight | `exbo_base` |
| Weapon damage per level, armor factor curve, artifact ranges, effect labels | `wiki` |
| Container slots, effectiveness, protection (`container.*` stats) | `wiki` top-level `capacity`, `effectiveness`, `protection` |
| Cosmetics and skin → base item | `motifs` |
| Market prices and lots | `scpmodel` |
| Icon files | `icons` |
| Character statistics | `profile` |
| Manual values | `local` |

A wiki sync binds only `source_id = 'wiki'` stats and the item's effect labels; it never
rewrites an item's name, kind, category, rank, slot, weight or `source_id`. A record that
exists only in wiki is created with `source_id = 'wiki'` when it carries stats, effects or
container fields; a record that carries none is skipped. Rows created by older versions
from the identity-only wiki lists are left in place — a normal `exbo_base → wiki` re-sync
restores EXBO identity for every overlapping row. Wiki numbers are Russian-only; they bind
to the realm passed to the sync (`ru` by default).

The same precedence applies to writes. `item_stat` is keyed without `source_id`, so
`replaceItemStats` refuses to replace a stat slot already owned by a higher-priority source
(`wiki` → `exbo_base` → `scpmodel` → `local`, lower wins). A displayed value therefore no
longer depends on which source synced last, and a source can still replace every slot it
owns itself.

## Key invariants

- Every table is `STRICT`; SQL uses prepared statements only.
- `item` is unique by `(realm, external_id)`; `name_norm` is lower/ё→е/without quotes.
- `item_stat` is keyed `(item_id, stat_id, level, is_additional)` and has the covering
  `item_stat_read` index for the card columns; a new EXBO stat needs a
  `stat_definition` row, not a migration.
- `inventory_item` holds one row per thing; only `ammo` and `other` may carry `qty > 1`.
  `is_virtual = 1` marks an instance that is not owned in game: it keeps its cells, weight,
  storage contribution and loadout stats, and the badge is the only ownership signal.
  A weapon, armor, container, artifact or attachment is never collapsed into another row,
  because each carries its own modules, fill, level, quality or placement. A create may name
  the exact catalog row by `catalogItemId`; the row must have the requested `kind`, so an
  attachment, a consumable or a stack can never resolve to a same-named row of another kind.
- `storage` has exactly one `inventory` row and exactly one `overflow` row per character
  (partial unique indices) and unique `(character_id, kind, name_norm)` names for stashes.
  The inventory is 8×20; every stash is 8×200 and the intake is 8×80, growing with its
  contents. Onboarding and an inventory clear
  recreate the inventory and the intake row, and the setup wizard creates both in its
  character transaction. The intake stash is structural: public writes cannot create,
  rename, resize or delete it, items cannot be moved into it (`422 INVALID_PLACEMENT`), and
  a catalog layout change is refused while an instance sits in it (`409 LAYOUT_CONFLICT`).
  Its read height is `max(height, lowest occupied row)` so it grows without a write; its
  rows carry no carried weight.
- Deleting a stash, removing an instance that has children, and a container fill or module
  replacement that displaces an item all pack the orphaned instances into intake with the
  same first-fit used by auto-arrange. Auto-arrange is the reverse: it packs intake items
  into a regular stash.
- `item_placement`: exactly one row per instance. Partial unique indices make two instances
  unable to share a grid cell origin, an equipment slot, a container slot or a weapon module
  slot; a trigger rejects a placement whose `character_id` differs from its instance's.
  A `grid` item also needs a free rectangle of its resolved size, checked by the write
  service, not by a database constraint.
- `container_data` exists only for `kind = 'container'` instances; the fill is the set of
  `item_placement` rows whose `container_item_id` points at it and whose slot is below the
  container's effective capacity. A fill row is its own `inventory_item`, not a reference to
  a catalog item.
- `character_stat` is keyed `(character_id, stat_id, origin)`. A manual value wins in
  display; clearing the manual row reveals the API value again. Raw counters are the only
  editable stats — K/D, accuracy, headshot share and hours are derived at read time.
  The `profile` sync owns only `origin='api'` rows: it deletes and rewrites them on every
  success, while manual rows are never touched. Playtime arrives as seconds or an
  ISO-8601 duration and is stored as hours. The two calendar counters have one canonical
  form: `reg-tim` is an ISO date (`YYYY-MM-DD`) in `value_text`, `pla-tim` is hours in
  `value_num`; the API accepts `PT…H` for playtime and converts it, and rejects a
  non-ISO registration instead of storing it raw.
- `price_latest` is computed, not stored: `ROW_NUMBER()` over
  `(name_norm, quality_norm, bonus)`, newest by `(fetched_at, id)`. Only the current quote
  per key is kept: each prices sync prunes older rows for the same key, so the table does
  not grow with the sync schedule. The read model never used the history.
- Reference data is not part of a reset; price pruning is maintenance of the current quote,
  not a user-visible deletion of profile state.
- `event_log.before/after` are the rollback contract; the format may change only in a
  backward-compatible way, with a rollback test. `request_id`, `origin` and `summary` are
  reading aids beside the snapshots: `summary.kind`/`fields` are derived from the same
  values (top-level fields that differ, capped at 20), never replace `before`/`after`, and
  a journal snapshot still restores rows written before `0009` with NULL context.
  Grouping comes from `entity` and the action prefix, so no stored group/severity column
  duplicates it; every HTTP write is owner-authorized, so there is no honest severity to
  store.

## Diagnostic log

The diagnostic log is telemetry, not a business record. `event_log` stays the audit
journal: business writes still go through their module's `write.ts` and every one lands
there. `log_entry` rows are observations written by the logging writer; they never mutate
profile state, so they are exempt from the "data changes only through services" rule and do
not need an `event_log` partner. The two audited exceptions are the logging settings write
(`logging.settings.update`) and a purge (`log.clear`).

- Classification: `debug`/`info`/`warn`/`error`; `warn` means a source is stale or a request
  is slow or rejected, `error` means a run crashed. Never invent data or log a value as zero
  when it is missing.
- Retention: the server sweeps hourly — rows older than `retention_days` and, beyond
  `max_rows`, the oldest rows. Retention writes no `event_log` row; it adds one summary
  entry with the counts when logging is enabled.
- Purge: `log.clear` deletes the filtered set in one transaction and is deliberately not
  rollbackable (`NON_ROLLBACKABLE_ACTIONS`). A filtered purge without any predicate is
  rejected as `LOG_FILTER_REQUIRED`; clearing everything needs `scope: "all"`.
- Secrets never enter a row: the writer redacts secret-looking keys, bearer tokens and URL
  query strings before truncation and fingerprinting.

## Profile resets

Cleanup exposes five scopes: `inventory`, `manualStats`, `character`, `journal` and `all`.
Each writes one `event_log` row and stores what it removed in `before`:

- `character.delete` and `reset.all` snapshot the character row, every `character_stat`
  row with its origin, and the whole instance inventory (storages, instances, placements,
  container data and item layouts). The character is recreated with its original id and
  timestamps on rollback, and the inventory rows come back under their original ids.
- `inventory.clear` deletes every storage, instance and placement and recreates the default
  8×20 carried grid (and the intake on demand); its `before` snapshot holds the raw rows, so
  rollback restores the exact previous state, including the old storage ids.
- `journal.clear` snapshots every event row with its id and raw `before`/`after` strings;
  rollback replaces the journal with that snapshot. A snapshot over 20,000 rows or 32 MiB
  is refused with `413 JOURNAL_TOO_LARGE` before it is allocated, so the operation cannot
  exhaust memory; the journal is left untouched.
- `reset.all` stores both snapshots, so even a full reset can be undone.
- Reference data (`item`, `price_quote`, `icon`, `source`, `sync_schedule`) is never part
  of a reset. A `character` or `all` reset leaves the database without a character, the
  same state as a fresh install, and the wizard returns.

## Derived reads

Pages and MCP never read stored display values. `packages/core/src/modules/read-model/payload.ts`
assembles the typed rows, and `catalog-view.ts` derives item cards and detail cards at read
time (`details[key]`, weapon/armor/artifact/container cards).

- Derived character fields come from stat ids: `reg-tim` (in the Zone since), `pla-tim`
  (hours, numeric only — no text fallback), `kil`/`dea` (K/D), `sho-hit`/`sho-fir` (accuracy),
  `sho-hea`/`sho-hit` (headshot share), `ach-gai` (achievements count). Achievement points
  have no stat id in phase 1 and are `null`.
- Container display precedence: `container_data` override > `container.*` item stats >
  `null`. Fill comes from `item_placement` rows of the container instance; the payload has no
  per-fill timestamp, so `artifactsAsOf` is `null`.
- The flat `weapons`/`armor`/`containers`/`artifacts` lists in the payload are a list view
  built from the same instances. Each row keeps `ownedId` (now the instance id) for the
  table UI and adds `instanceId`, `storageId` and `placement`.
- Grid size and weight resolve per item: an `item_layout` override wins over the catalog
  weight/kind defaults, and the app's category model (`app/features/inventory/model/kinds`)
  supplies the per-kind fallback. A pile of `qty` stackables occupies one rectangle.
- No lot means `null` ("no lot"), no stat means `null` ("no data"). Zero, a missing value
  and an estimate never substitute for each other.

## Display formulas

One formula for the whole project (`packages/shared/src/calc/weapons.ts`, re-exported by
`packages/core/src/modules/catalog/calc/weapons.ts`):

```
displayedDmg = round(rawDamage, 1)
dps          = Math.round(displayedDmg * rof / 60)
ttk          = round((ceil(HP / displayedDmg) - 1) * 60 / rof, 2)
```

- `rawDamage` is damage at the required refinement level; `rof` is rounds per minute.
- `HP` is the target's effective health. It defaults to the 600 HP dummy everywhere on the
  server; the weapons page lets the owner change it, and every displayed TTK is computed
  from that one number.
- Damage is rounded first; DPS and TTK are then computed from it.
- No stored display value is substituted. `npm run golden` recomputes a public synthetic
  fixture and must print `mismatches: 0` and `legacyDeltas: []`.

## Item rules

- A skin is not an item: `kind = motif`, its base is found by `name.key`
  (`item.motif.wpn.ks1_ssop` → token `ks1_ssop`) and written to `base_item_id`.
  EXBO's `*_style/*` categories (`weapon_style/styles`, `armor_style/styles`) are
  cosmetics too: the binder stores them as `kind = motif` with `is_cosmetic = 1`
  instead of the group kind, so the catalog lists only real gear. A write accepts a skin
  only when the motif's `base_item_id` is the chosen item; a cross-item skin is refused.
- Artifact rarity is one percentage (`rarity_pct`, 0…175); `rarity_tier` is derived from it
  at the same game boundaries the calculator uses (100/115/130/145/160/175), never typed
  separately. Other kinds cannot receive a rarity or quality from a write.
- The instance `slot` is copied from the catalog item; the API does not accept a typed slot.
- `level` belongs to weapons and armor, `qty` to `ammo`/`other`; the add/edit forms show
  only the fields the chosen kind has, and `note`/`role` are not part of the model.
- The rank belongs to the weapon/armor itself, not to the skin.
- "(А)" is a separate item.
- Armor bullet protection comes from the item's `bullet_dmg_factor` curve (levels 0…15);
  other protection types come from their own `item_stat` rows.
- Effects (artifact bonuses) live in `item_effect` as ordered labels.

## Snapshots and freshness

- Every successful sync writes new rows/stats and updates `source.last_ok_at`.
- A sync failure does not delete old data: status `stale`, the error in `last_error`.
- Prices: a 15-minute TTL; on 5xx the previous `price_quote` keeps being served through
  `price_latest`, and the UI shows its age.
- `sync_schedule` changes only through `setSyncSchedule`: one `sync.schedule.update` event
  carries the four values in `before`/`after`, and rollback restores `before` (including a
  disabled state). A no-op writes nothing.
- Boot backfills `source.url` with each source's public origin (`COALESCE` keeps an existing
  value); `local` has no URL.
- The portable JSON export describes profile content and does not include settings; the
  SQLite backup includes `sync_schedule` like every other table.
- On first run the database is empty apart from migrations and sources: the catalog comes
  from `npm run sync`, gear through the API, MCP or the site.
