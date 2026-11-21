# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The project has no tagged releases yet, so entries are grouped by date, newest first.

## [Unreleased]

### Fixed

- Attachment storage is now byte-verified and safe to serve: an image must match its magic
  bytes, text must decode as UTF-8 without NUL, the canonical type and SHA-256 are stored
  (migration `0022`), text attachments are always served as `text/plain` with an attachment
  disposition (an uploaded HTML/JS file can no longer run on this origin), and every response
  carries `nosniff`, a sandbox CSP and `same-origin`. Attachment ids are `AUTOINCREMENT`
  (migration `0023`) so a deleted file's id is never reused, and the private cache
  revalidates through the `sha256` ETag instead of staying immutable, which previously could
  show an old file after an id was reused.
- OpenCode chat sends the `x-opencode-session` header, derived once per thread. The Go plan
  rejects a chat completion without it with `400 MissingSessionID`, which is why a verified
  Go connection produced no reply. A provider failure returned in `ChatTurnResult.error` is
  now shown inline on `/chat` as `The provider rejected the request (HTTP …)`; previously
  the turn was silent there because only HTTP failures set the inline error.
- The assistant key field accepts only an uppercase environment variable name
  (`[A-Z][A-Z0-9_]*`), so a pasted API key is rejected with `422 VALIDATION` instead of
  being stored and then looked up as a variable. A value saved before this check is ignored:
  `GET /api/v1/chat/settings` returns `apiKeyEnv: null` with `apiKeyEnvInvalid: true`, the
  provider's default variable is consulted, and `AI_NOT_CONFIGURED` names that variable
  instead of echoing the pasted secret.
- The assistant side panel fits its own controls: the header is two rows (the panel name and
  active thread, then the thread selector, New thread and Open full chat), so nothing sits
  under the close button; the panel widens to `min(94vw, 34rem)`; the thread menu opens above
  the panel instead of behind it; the composer gains a submit button (the panel was
  unsendable on touch); tool tables scroll inside the panel; and closing returns focus to the
  sparkles trigger in either locale instead of matching an English `aria-label`.
- A pointer drag keeps the pressed pixel under the cursor: the floating preview is
  anchored by the exact in-cell offset (`grabOffset`) instead of the grabbed cell's
  corner, so a card no longer jumps by up to one cell — a whole tile for a 1×1 stack — the
  moment it is picked up. The snapped ghost and the landing still use the whole grabbed
  cell, and the offset is clamped to the footprint's pixel size so a press deep inside a
  larger slot cannot push the card off the pointer.
- Tidy and its rollback park every moved row before writing the new cells, so reordered
  origins and item-id rollback order can no longer trip the unique grid-origin index. A
  rollback whose snapshot cell now holds an item written after the event answers
  `409 ROLLBACK_CONFLICT` with a localized message instead of a raw SQLite error.
- The changelog filter bar sticks flush to the viewport top on desktop, and an entry hash
  lands just below the 50 px bar instead of behind it.
- Inventory drags no longer snap back: a write forces a payload refetch instead of
  accepting the fresh cache, and an optimistic move is cleared only when the refreshed
  payload actually shows its target.

### Added

- One chat thread can be deleted from the `/chat` list or the side panel after a confirmation:
  its messages, pending write and attachment blobs are removed, the active conversation resets
  to a fresh thread, and the audited `chat.thread.delete` event keeps only the id and counts
  (never the title, message text or bytes). The deletion is not rollbackable.
- Chat files have real viewers: an image thumbnail opens a full-screen carousel with a
  counter, thumbnails, arrow/keyboard navigation, zoom, download and "open original"; a text
  file opens a readable preview with copy and download; every message gains a copy action.
  The composer accepts files by picker, drag-and-drop and paste, shows image thumbnails and
  a running count/aggregate-size meter for the 4-file / 6 MiB budget.
- The assistant composer accepts files: images (`png`, `jpeg`, `webp`, `gif`) and text files
  with a 4-file / 4 MiB-per-file / 6 MiB-total budget. The files travel with the turn, are
  stored in `chat_attachment` (migration `0021`) beside the user message and cascade with the
  thread. Text is inlined into the prompt (clipped at 24,000 characters) and images become
  real image parts for the OpenAI-compatible, Anthropic and Google mappers, so a screenshot
  or a notes file can be discussed in the conversation. Messages show thumbnails or a named
  download chip served by `GET /api/v1/chat/attachments/:id` behind the session; the turn
  route alone accepts a 12 MiB body. This narrows the assistant's "no file contents" rule to
  files the owner explicitly attaches — no `.env`, DB, snapshot or server path is read — and
  the owner decision is recorded in the assistant design.
- Adding an item now starts from a catalog picker instead of a raw result list: search matches
  every word in any order across Russian and English names and category paths (`12 ак`,
  `assault rifle`), the rank select narrows the catalog, and each row shows a 40 px icon, a
  rank-coloured name with the matched fragments underlined, its category, weight and an
  owned-instance counter. The selected row opens a card with the icon, English name, kind,
  category, slot, weight and the catalog stat rows from `/api/v1/details/:key`, while the
  per-kind form sits beside it; on a phone the columns stack and the footer stays in view.
  Motifs, styles and cosmetic variants are no longer offered as owned gear.
  `GET /api/v1/items` treats `q` as words and accepts `rank=master` as well as `RANK_MASTER`.
- A virtual inventory instance (`inventory_item.is_virtual`, migration `0018`) marks gear that
  is not owned in game while keeping it a full instance: it keeps its grid cell, weight,
  storage and loadout contribution, and a dashed `VIRT`/`ВИРТ` badge with a flask glyph
  appears on the tile, item card, list icon well, equipment slot, weapon and container panels,
  detail modal and chat rows. The REST create/patch bodies and the MCP add/update tools accept
  `virtual`, `list_inventory_items` filters by it, and every rollback restores the exact flag.

### Changed

- Settings → Assistant accepts the API token itself, not only the name of an environment
  variable. The token is stored in `chat_settings.api_key` (migration `0019`), wins over the
  `NUXT_AI_*` fallback, is write-only through the REST API, never enters `event_log`, and a
  settings rollback leaves it unchanged. Switching provider clears a stored token. Migration
  `0019` moves a legacy pasted value from `api_key_env` into `api_key`; the field is no longer
  shown in the UI. Owner decision recorded in the assistant design and
  `docs/CONFIGURATION.md`: the token lives in plain text inside the SQLite file and its
  backups.
- OpenCode is split into **OpenCode Zen** (pay-as-you-go, the existing
  `https://opencode.ai/inference/openai/v1`) and **OpenCode Go**
  (`https://opencode.ai/inference/go/openai/v1`). Both use the same Console key, so switching
  between the two plans keeps the stored token; migration `0020` rebuilds `chat_settings` to
  admit the new provider and leaves an existing `opencode` row on Zen.
- Settings → Assistant treats the base URL as optional for every built-in provider: the
  documented endpoint comes from the shared `CHAT_PROVIDER_META` catalog, a Custom endpoint
  switch reveals the input only for a proxy or self-hosted gateway, and switching provider
  clears a stale URL and an untouched default model. OpenCode (`https://opencode.ai/inference/openai/v1`,
  catalog at `/inference/v1/models`) and Command Code (`https://api.commandcode.ai/provider/v1`)
  now ship defaults instead of demanding a URL; the key status follows the selected provider
  and links to its API documentation.
- The weapon card's damage-falloff chart fills the modal width with a wide plot instead of a
  full-height one: two responsive geometries keep the axis text legible from phone to desktop,
  the legend sits beside the heading, the plot keeps only horizontal guides, axis ticks stop
  at one decimal, and each breakpoint is a marker with its damage and distance in a hover
  title. The series still come from `p0`/`p15` unchanged.

### Removed

- `inventory_item.note` and `inventory_item.role` (migration `0011`), their REST/MCP fields
  and the free-text modal inputs.
- Item rotation end to end: migration `0017_drop_item_rotation.sql` moves every `rotated = 1`
  grid row into its character's intake as an upright single-column row after the existing
  unrotated intake rows, then drops `item_placement.rotated`. The `rotated` field leaves the
  REST/MCP contracts, packing, tidy, auto-arrange, snapshots and rollback; the app loses the
  `R` key, the rotated drag preview and the rotated landing. Auto-arrange, tidy and overflow
  packing fit upright only, and a legacy rollback snapshot carrying `rotated: true` restores
  into the intake unrotated instead of writing an overlapping placement.

### Changed

- Catalog and inventory list rows show a larger 64 px icon well (image 60 px, crate fallback
  36 px); the static 135° hatch on item cards, inventory grid tiles and those wells drops to
  16% of `--sz-border-strong` (from 40%), so the striping reads as texture instead of a
  pattern behind the item name and numbers. Cards and grid tiles keep the 8 px pitch, while
  the well uses a new `sz-hatch--fine` 4 px pitch so the texture stays legible at that size.
- The stash and carried-inventory panes share a fixed header height (52 px touch / 36 px
  pointer) and one filter row component, so both rows start and wrap identically; intake
  keeps the tidy controls visible but disabled with its release hint below the row.
- Data tables scroll inside their own bounded box: `/weapons` list mode, the event log and
  `/logs` keep an opaque header at the top of the box while rows pass underneath.
- Item cards and grid tiles keep no selection frame: a single click changes nothing, while a
  double click or Enter opens the details; drag, hover and press states are unchanged.
- The language and theme switches live in a fixed top-right cluster on desktop and at the
  right end of the mobile header; the side panel keeps the account heading above its
  Settings/Logs/Sign-out list.
- The intake stash is eight cells wide as the carried grid and every stash; its packer
  reads the stored row dimensions, migration `0015` resizes existing intake rows and repacks
  their placements into one column, and onboarding/reset create the same 8×80 row.
- Character registration and playtime are typed: a date input for `reg-tim` and an
  hours/`PT…H` field for `pla-tim`. The contract rejects a non-ISO date and keeps playtime
  as numeric hours; migration `0012` normalises existing stat rows and the derived `hours`
  no longer falls back to legacy text.
- Inventory add/edit forms follow the kind: level and a skin (only motifs bound to the
  chosen item) for weapons/armor, one rarity percentage with a server-derived tier for
  artifacts, quantity for stacks; the slot is read from the catalog. `/inventory` gains one
  Add button that opens the same form. A cross-item skin is refused by the service.
- Settings and guide tab strips share one style constant: the active tab carries the nav's
  2 px accent underline along the strip's bottom, and the strip scrolls with full labels.
- Inventory: the stash tab strip lives in the left pane's header in place of the title,
  keeps the accent-filled active tab and its count, keeps auto-arrange/manage, and scrolls
  horizontally instead of wrapping when there are many stashes.
- Inventory panes scroll in one unpadded container per pane, so the track rides the pane
  border and the grid keeps the full width; every scroll area uses one themed scrollbar
  (square thumb on the track, dimmer on hover, `thin` in Firefox).
- The side menu collapses as one 200 ms width change: labels fade and clip, the icon
  rail has no brand mark, section icons sit centred in 64 px with count chips on the icon
  corner, and the footer uses the same accent-bordered rows as the top navigation.
- Inventory: the stash weight block sits in the left pane's footer like the carried
  weight, with the same surface, unit and gauge, and follows the selected stash tab.
- Catalog binding treats EXBO's `weapon_style/` and `armor_style/` rows as cosmetic
  motifs: they leave `/weapons` and `/armor`, keep `is_cosmetic`, and resolve their
  `base_item_id` from the style token; the next catalog sync also corrects rows stored
  as gear.

### Changed

- The page payload no longer carries the 662-card `details` map: owned rows and inventory
  items carry their own card, a catalog modal fetches `/api/v1/details/:key` once, and the
  read model loads only the stats each surface displays. Cold `buildPayload` drops from
  149 ms/902 KB to ~58 ms/184 KB; `docs/PERFORMANCE.md` records the capture.
- Inventory list mode renders one 40-row window of the sorted and filtered rows across all
  grouped sections, with a Load more control; grid mode, sorting and filtering are unchanged.
- Theme changes cross-fade for 200 ms where the View Transition API exists (instant without
  it or under reduced motion); settings/guide tab panels replay a 160 ms enter, sliders scale
  their thumb on press and catalog cards lift 1 px on hover.
- The inventory add form searches all ownable catalog kinds, shows the row's kind and
  category, fixes the kind from the picked row, and sends its exact `catalogItemId`, so
  attachments, ammo and consumables no longer collide with same-named rows of another kind.
- A filtered `/inventory` grid packs the matching items from the top-left in the chosen
  layout order, keeping each footprint and rotation; hidden items are not drawn, clearing
  the filter restores the stored cells, and grid drops are refused while any filter is on.
- Item cards and `/inventory` grid tiles carry one faint static 135°/8 px hatch; panes,
  tables and modals stay flat.
- Every catalog list row's 48 px icon well carries the same faint static hatch as an item
  card or grid tile, and its border takes the row's translucent rank colour; the plain strong
  border stands in when the rank is unknown. The shared `itemEdgeColor()` also fixes the grid
  tile edge, which previously emitted an invalid `var(--sz-rank-*)b3` value and never showed
  its rank colour.
- Every catalog item card pins its weight at the bottom-left corner of the footer, formatted
  with the shared `kg` label and an em dash when the value is missing; the remaining stats wrap
  to the right. Artifact rows now carry their instance weight from the payload.
- The assistant opens as a right-side panel on every page except `/chat`, from a sparkles
  button in the top bar (desktop and mobile) or the new `open-assistant` palette command. It
  uses the same conversation store and one shared `ChatConversation` as the page, names the
  active thread, offers a thread selector, New thread and Open full chat, and is a real
  dialog with a focus trap, Esc/overlay close and focus returned to its trigger; closing
  never stops a turn.
- Owned and catalog weapon modals chart damage falloff from the card's `p0`/`p15`: an inline
  SVG flat–linear–flat curve per level, 0 solid and +15 dashed, with metre/damage axes, faint
  ticks, a legend and an `sr-only` list of every plotted point. Missing or unordered points
  skip a series and a localized no-data line stands in when neither is valid.
- An assistant turn now keeps running after the owner leaves `/chat`: threads, messages, the
  per-thread pending confirmation and the in-flight request live in one Pinia store, so a
  return reuses the stored conversation and a completion elsewhere arrives as a reply,
  pending-write or error toast. Switching threads mid-turn never overwrites another
  conversation; `sending` stays true through the post-turn refresh and a reload still cancels.
- `/chat` can switch the assistant model from its header without opening Settings: the
  searchable selector loads the provider list when the assistant is configured, always
  includes the stored id, accepts a typed id, and PATCHes the same audited
  `chat_settings.model` every later turn and Settings → Assistant read. The value changes
  only after success, the selector and composer disable while a save or turn runs, and a
  missing key shows a disabled control with a Settings link.
- The assistant model field is a searchable picker instead of a bare input: Settings →
  Assistant loads the provider's model list through the new `POST /api/v1/chat/models`
  (OpenAI-compatible, Anthropic and Google shapes, Google limited to `generateContent`),
  debounces reloads when the form names a key variable or the provider is Ollama, offers a
  refresh control and a non-blocking inline error, and still accepts a manually typed id.
  The endpoint resolves the key only from the named env variable and writes nothing.
- Settings → Assistant is five collapsible blocks behind a per-browser Basic/Advanced
  switch: Basic shows only Connection, Advanced opens Connection and keeps Generation,
  Reliability and tools, Data scope, Prompts and skills collapsed until needed; the loaded
  form survives mode switches and Save stays visible outside the blocks.
- Items without a game icon now share one asset-free mark — a 32×32 isometric crate outline
  with a centred top diamond and three short 135° hatch strokes — in item cards, list icon
  wells, the inventory grid and its drag preview, equipment slots, container and weapon
  panels, detail modals and chat item rows. It inherits `currentColor`, stays neutral and is
  `aria-hidden`; no image file or network request is added, and page/section empty states,
  slot glyphs and the `—` for missing data are unchanged.
- On `/inventory`, Shift + primary click on a tile or a filled equipment slot performs one
  quick move without opening the card: with the equipment pane open a carried tile equips
  (swapping an occupied compatible slot) and a worn item returns to the first free carried
  cell; with a stash pane open a stash or intake tile comes home and a carried tile goes to
  the selected stash, while the intake never receives one. A blocked move shows one warning
  toast and writes nothing; a plain click, double click and Enter keep their behaviour.
- The ZONE FM radio is mounted again in the default layout; its FAB, bar, track list,
  persistence and Media Session behaviour are unchanged.
- The side panel shows the character's faction emblem and name beside the nick, and its
  navigation lists drop the row separators.
- List-mode catalog rows use a 48 px framed well with a 44 px image and a matching empty
  tile; the shared icon column widened to fit it.
- `/chat` keeps assistant threads and messages in the profile DB, renders tool results as
  item rows with rank badges, inventory and price tables, and asks to confirm every write
  with its dry-run diff before the MCP tool runs.
- An assistant turn runs through the in-process MCP registry: read tools execute freely,
  the first write returns its dry-run diff, and only a confirmed call writes (audited by the
  owning service), while a decline is returned to the model.
- Assistant prompts and skills live in the profile DB: a default system prompt plus
  inventory, pricing and write skills, editable in Settings → Assistant. Each save appends a
  version, `chat.prompt.update` is audited, the composed prompt injects every enabled skill
  and the journal can roll the active pointer back.
- Settings → Assistant configures the provider, base URL, model, limits, reasoning effort,
  timeout, retries, allowed read tools and the prices/logs data scope; the key comes from a
  named environment variable and a Test connection action checks it. `chat.settings.update`
  is audited and rollbackable.
- `docs/superpowers/specs/2026-11-21-chat-assistant-design.md` records the approved
  assistant design: allow-listed and redacted data only, every write confirmed, keys in env,
  threads/prompts in the profile DB and an MCP tool loop.
- `docs/PERFORMANCE.md` records a measured baseline (cold/warm `buildPayload`, payload
  bytes, per-page TTFB/FCP/DOM counts) with a budget and two measured follow-ups; the
  capture script is `scripts/perf-audit.ts`.
- A command palette opens on `Ctrl+Space` and `Ctrl/Cmd+K` (the binding is configurable
  per browser in Settings → Appearance) and runs navigation, money edits, a profile sync,
  item creation, theme/locale/density switches and stash selection with groups, fuzzy
  filtering, icons and owned counts. It refuses to open while a text field is focused,
  yields Escape to the inventory grid, and every profile write asks first.
- A `/devices` screen lists every device-category catalog item — detectors, night vision
  and the САК-1 — from a new `catalog.devices` payload group; those rows leave `/weapons`
  and `/armor`, and the payload, guide and both locales carry the group.
- Catalog lists lead with a 22 px item icon (lazy, decorative) and an em dash when the
  item has none; catalog and owned rows share the same renderer.
- The side menu's Inventory row carries the owned-instance count like the other sections,
  counting each storage, equipment-slot and loose item once.
- Overview: a Sync profile button pulls the official profile from the page header with a
  busy state, an actionable failure (missing credentials link to Settings → Sources, a 404
  to Edit profile) and a refreshed payload.
- Overview: a Verified badge appears only when the official API served this character; the
  payload character carries `profileFetchedAt`, and changing the nick or region clears the
  marker, with rollback restoring it.
- The shell now uses a side navigation: persistent and collapsible on wide screens, a
  drawer on narrow ones, with every section, the owned-count badges, account area,
  settings, logs, theme switch and sign-out in one place. The footer is removed.
- The client data layer is Pinia + Pinia Colada. One payload query, one write mutation and
  one query-key map replace the hand-written payload fetch and the screens' ad-hoc
  `$fetch`/`useAsyncData` reads; a successful write invalidates the profile key.
- A light theme ships beside the dark one: both `--sz-*` token sets, a persisted switch
  that is restored before hydration, light rank colours, and server-rendered HTML that
  already follows the stored theme. Appearance gains theme, font, density and notification
  position/duration/stack controls.
- Inventory: fixed 8-wide grids, 8×200 stashes without width/height inputs, stash tabs, a
  stash weight block, per-container kind/rank/quality filters with a same-storage drop
  guard, and an explicit audited tidy-up write with before/after and overflow reporting.
  Equipment slots now follow primary/secondary/melee weapon classes and highlight every
  compatible slot while dragging.
- Weapons and armor show the current-level and +15 values side by side from the payload,
  with thin comparison bars under DPS, TTK and bullet protection scaled inside the
  filtered visible set. TTK uses the inverted (shorter-is-better) scale.
- Character: faction emblems are local static assets with an unknown-slug fallback; the
  Edit profile action moved to the page header, and the rebuilt modal validates each field
  with `CharacterPatchSchema`, localizes field errors and disables save for an untouched or
  invalid form.
- The settings journal stores request id, origin and a display-only summary; the page gains
  filters, expandable rows and a readable before/after diff. Rollback snapshots remain the
  contract and the new tidy action is rollbackable.
- Sources show the named record metric for each source, freshness buckets, a sortable card
  list, relative update ages and a jump to the data the source feeds.
- `/guide` is a tabbed reference (site, flows, API, MCP, CLI, sources, guarantees) with
  current copy and every page, route, tool, script and source.
- Tutorial copy for self-evident interactions is removed from both locale catalogs;
  `DESIGN.md` §9 and `AGENTS.md` now state the rule.
- A branded boot splash covers the shell from the server paint until Nuxt reports the app
  hydrated: a trefoil mark, the `STALZONE // PROFILE` wordmark, an indeterminate 3px accent
  rule and a localized "Loading profile" label. It is skipped without scripting, waits for
  the web fonts (capped at 600ms), fades in 240ms and hides itself after 8s if the client
  never becomes ready.
- A diagnostic logging module: a SQLite-backed `log_entry` table with configurable minimum
  level, per-category overrides, retention days and a row cap. It records HTTP requests,
  sync runs, MCP calls, CLI commands, database boot lines and browser errors, with request
  ids, repeat grouping by fingerprint and redaction before storage. The `/logs` page lists,
  filters, groups, paginates and previews a purge; Settings → Logging edits the settings.
  REST gains `/api/v1/logs`, `/logs/stats`, `/logs/config`, `DELETE /logs` and
  `/api/v1/admin/logging`; MCP gains `list_logs`, `log_stats`, `get_logging`,
  `update_logging` and `clear_logs`; the CLI gains `npm run logs`. Diagnostics are separate
  from the `event_log` audit journal, and `log.clear` is not rollbackable.
- The profile has a full inventory: a cell grid with the item's own size and weight, one
  inventory plus any number of named stashes, the game's equipment slots (primary,
  secondary, melee, armor, backpack/container, quick slots 1–4), containers with artifact
  slots and their effectiveness, and weapons that accept attachments per module slot
  (scope, muzzle, grip, magazine, stock, tactical). Gear is stored as one row per instance,
  so identical-looking weapons keep their own level, quality, fill and modules; stackable
  ammo and consumables keep a quantity. The `/inventory` screen supports drag-and-drop
  between the grid, equipment slots, containers and modules, auto-arrange, stash creation,
  renaming and resizing, and a per-item layout override. The REST API gains
  `/api/v1/inventory`, `/inventory/items`, `/inventory/storages`,
  `/inventory/containers/:id/fill` and `/inventory/weapons/:id/modules/:slot`, and MCP gains
  `get_inventory`, `list_storages`, `list_inventory_items` plus the matching instance write
  tools.
- Settings → Resets replaces the single inventory cleanup with five scoped resets:
  inventory, manual stats, character, journal and full reset. Each one is one journalled
  transaction and can be rolled back from the Journal tab, including the full reset that
  also clears the history. The panel shows live counts per scope, disables empty scopes,
  returns to `/setup` after a character or full reset, and asks the owner to type the
  confirmation word before the full reset. `POST /api/v1/admin/cleanup` now takes a
  `scope` (defaulting to `inventory`) and `GET` reports counts for every scope.
- The site has a favicon: the brand radiation trefoil in the game green on the ink tile,
  shipped as a 16/32/48 px `public/favicon.ico` and declared in the document head. It lives
  at the existing public path, so it renders on `/login` and `/setup` too.
- `/settings?tab=sources` is now a source reference and control surface: every source has a
  description, what it updates, its public origin, status, freshness, commit snapshot and an
  honest record count. The tab adds an auto-update schedule (master switch plus catalog,
  prices and profile intervals) persisted in `sync_schedule`, edited through
  `PUT /api/v1/admin/sync` and rollbackable through the journal, and a Nitro scheduler that
  runs only due bundles while the process is on. `GET /api/v1/admin/sync` exposes
  diagnostics and bundle readiness; manual syncs share a process-wide single-flight lock and
  answer `409 SYNC_IN_PROGRESS` while a run is active.
- The first-run catalog step explains each data source: every source is a card with a short
  description, a Required or Recommended badge, a status line, an indeterminate progress bar
  while it downloads and a completed bar afterwards. A summary shows how many sources are
  ready, and "Download recommended" runs the important ones in catalog order.
- `MetaRead` in `@profile/shared/contracts` describes `GET /api/v1/meta` and is validated
  by the payload contract test; `OwnedKind` is exported as a type beside its schema.
- A `/changelog` page parses the root `CHANGELOG.md` at build time and renders it as a
  filterable timeline with date and category badges, inline code and italic notes. Links
  render only for safe targets; search, filters and the result count are accessible, and
  the file format is guarded by contract tests. The navigation gained a Changelog entry.
- A `/guide` page maps every screen, REST endpoint, MCP tool, CLI script and data source,
  with read/write flow diagrams and a live strip for the current profile. Its lists are
  contract-tested against `app/pages`, `server/api`, the MCP registry, `package.json` and
  the sync module, and the navigation gained a Guide entry.
- The shell carries a procedural Zone backdrop (`sz-atmosphere`): a faint fine grid whose
  lines follow the accent plus fine grain, painted with CSS and one inline SVG. It is fixed
  behind the content, never reaches a pane or a table; no image assets or network requests
  are added.
- A session-only `ZONE FM` radio bar sits at the bottom of the authenticated shell. It plays
  three looping CC0 ambient tracks by Tsorthan Grove with play/pause, previous/next, a track
  list, volume and mute, a level meter driven by the real analyser and Media Session support.
  The player is collapsed to a small floating radio button by default and opens on click with
  a slide-up animation; both states are fixed overlays, so it never shifts the page. The
  chosen track, volume and open/collapsed state persist, and playback never autoplays. Audio
  lives in `public/audio/zone-fm/` behind the session, and its provenance is in `docs/AUDIO.md`.

### Changed

- The inventory screen picks a card up at the cell under the pointer (grid, equipment, container
  and intake alike), never drags on a right press, and opens the item panel only on a double click;
  a single click selects. The unused drag and pane-header hints are gone, and the catalog screens'
  link to the carried inventory reads "Inventory". One category-level equipment table in
  `@profile/shared/contracts` now gates the write service, the tile context menu and the drag
  targets: a mismatched slot answers `422 INVALID_PLACEMENT` and never lights up during a drag.
  The left inventory column toggles between equipment and the selected stash, both panes are one
  viewport tall with their own scroll, and the equipment doll gives every slot its footprint
  (weapons 5–6×2, armor and containers 3×3, quick slots 1×1) with the held item filling it.
  One shared item-details modal now serves `/inventory` and the four catalog pages: per-kind
  stats, weapon attachment install/remove, container artifact slots and instance editing in one
  place, replacing the separate weapon and container panels.

- The read model builds one catalog context and one inventory snapshot per payload,
  reuses one card index for details and both catalogs, and caches the payload per database
  until `total_changes()` moves. `useProfile()` makes one `/api/v1/payload` request; meta is
  derived locally. `/api/v1/meta`, `/character`, `/containers` and `/catalog` build only
  their own section. On the local 2,645-item database a payload now issues 19 prepared
  statements instead of 46 and a repeat load is cache-served; the first build stays around
  0.1–0.2 s and is the only one that reads the catalog stats.
- Sync resolves items and icons in batches instead of per row, reuses the price insert
  statement, skips the catalog upsert when the EXBO commit is unchanged, and writes icons
  through a temp file plus rename (a truncated file is downloaded again). Prices keep only
  the current quote per name/quality/bonus, so `price_latest` does not scan an ever-growing
  history; `/api/v1/prices` resolves many names in one query per 500 names.
- Write routes read JSON with a byte-counting stream, so a chunked body cannot exceed
  2 MiB (32 KiB for browser logs) before zod runs. The in-memory limiter refuses new keys
  at 5,000 active windows instead of clearing every window, and destructive journal
  snapshots over 20,000 events or 32 MiB answer `413 JOURNAL_TOO_LARGE` without allocating.
  `swap: true` on a grid target is rejected with `422 INVALID_PLACEMENT`; the client resolves
  grid collisions. SQLite opens with tuned `cache_size`, `mmap_size` and `temp_store` and
  runs `PRAGMA optimize` on close.
- The collapsed `owned_item`/`owned_container`/`container_slot` model is replaced by
  `storage`, `inventory_item`, `item_placement`, `container_data`, `attachment_compat` and
  `item_layout`. Migration `0006` copies the old rows (one instance per copy, a stash per
  `character.stash`, a new artifact instance per fill slot) and drops the old tables;
  `character.stash` is gone. The site payload's flat `weapons`/`armor`/`containers`/
  `artifacts` lists are now a table view over the same instances and add `instanceId`,
  `storageId` and `placement`; container fills have no per-fill timestamp, so
  `artifactsAsOf` is `null`. Cleanup counts report `inventory: { items, storages,
  placements }` instead of `owned: { records, copies }`, and journal events written before
  the redesign cannot be rolled back (`409 EVENT_NOT_ROLLBACKABLE`).
- The product is consistently named **profile** instead of **dossier**: the workspace
  packages are `@profile/*`, the MCP tool is `export_profile_json`, the resource is
  `profile://schema`, the environment variables are `PROFILE_API_URL` and `PROFILE_DOMAIN`,
  the session cookie is `profile_session`, the default database file is `data/profile.db`
  and the Docker volume is `profile-data`. Journal rows written before the rename keep the
  old `dossier.clear` action name so they stay rollback-compatible; existing data must be
  copied to the new filename and volume (see `docs/RUNBOOK.md`).
- Sources have one written authority: `exbo_base` owns item identity, `wiki` owns the
  numeric layers (per-level weapon damage, armor and artifact numbers, effect labels) and
  the container capacity, effectiveness and protection fields, which the wiki sync now
  stores as `container.*` stats. The wiki sync fetches only the artifact, armor, container
  and TTK endpoints, binds to the row EXBO created instead of overwriting its name, kind,
  category and rank, is realm-aware, and creates a wiki-only row only when it carries data
  (`docs/DATA-MODEL.md#source-authority`). Existing numbers do not move; container cards
  gain the values they previously left empty. A stat slot owned by a higher-priority source
  is no longer overwritten by a lower-priority one, so a displayed value does not depend on
  which source synced last.
- The `/changelog` page is a vertical timeline: entries that share a release date sit under
  one date node, each card reads as a single column of colour-ruled categories, items get a
  category-coloured marker, and the filter bar sticks under the header on wide screens.
- The character faction is one of the four northern STALZONE factions — Rise, Frontier,
  Mercenaries or Covenant — stored as the slug `rise`, `frontier`, `mercenaries` or
  `covenant` and still optional. Both the setup wizard and the profile editor use a select
  instead of free text, and the API rejects any other value. The new migration
  `0002_character_faction.sql` turns legacy free-text factions into "not specified".
- The playstyle field is gone from the profile: the character table, the API contracts,
  the overview page and the profile editor no longer carry it.
- `@profile/core` publishes each module only by name (`./modules/<name>`); the deep
  `./modules/*` wildcard and the dead `src/calc` compatibility shims are gone.
- The write result, freshness, event and owned-kind shapes have one definition in
  `@profile/shared/contracts`; core and the app reuse them instead of redeclaring.
- `server/utils/serialize.ts` keeps only the event adapter: the test-only `itemJson`
  wrapper and the unused `findAnyDetailsCard` export are removed.

### Removed

- Saved builds are gone from the profile. The project now keeps only item-centred
  entities: the `build`, `build_metric` and `build_slot` tables are dropped by
  `0003_drop_builds.sql`; the builds module, `GET/POST/DELETE /api/v1/builds`, the
  `list_builds`, `get_build`, `save_build` and `delete_build` MCP tools, the payload
  `builds` section and the export field are removed. Cleanup keeps only the inventory
  action (`POST /api/v1/admin/cleanup` takes `{ dryRun? }`), and `CHARACTER_NOT_EMPTY`
  now checks gear alone. Historical journal rows that mention builds stay readable but
  cannot be rolled back.

## [2026-11-17] — Contract-first modular monolith: core modules and app slices

### Added

- Boundaries are enforced, not just documented: dependency-cruiser covers packages,
  server, app and tests, and ESLint (`boundaries/dependencies`) applies
  `shared → entities → features → pages`, forbids feature-to-feature imports, bans
  `@dossier/core` in the app and restricts `@dossier/shared` to `/contracts`, `/ranks`
  and `/format`. `npm run check` and the CI verify stage run `npm run boundaries`.

### Changed

- `packages/core` is now `platform` (config, DB, migrations, journal, security) plus
  bounded-context modules: `catalog`, `identity`, `inventory`, `builds`, `sync`, `setup`,
  `maintenance`, `read-model`. Each module exposes one `index.ts`; its `repo/` and
  `service/` files are private. The old `src/repo` and `src/services` shims and the
  `@dossier/core/services/*` subpath are gone.
- `packages/shared` publishes contracts under `src/contracts`; `src/schemas.ts` and the
  `@dossier/shared/schemas` subpath are removed. Use `@dossier/shared/contracts`.
- The app is split into slices — `app/shared` (ui, composables, lib, types),
  `app/entities`, `app/features`, `app/pages` — with the old `app/components`,
  `app/composables`, `app/utils` and `app/types` directories removed. Pages stay thin
  wrappers around feature screens.

_No API, MCP or database contract change; the calculator and the golden fixture are
untouched._

## [2026-11-17] — Seedless onboarding: setup wizard, gear entry, icons, optional profile API

### Added

- First run: sign in → `/setup` redirect → nickname/region → catalog download. The
  middleware never redirects API calls, `/_*`, `/icons/*` or non-HTML requests.
- `POST /api/v1/character` creates the single character, logs `character.create` and
  refuses its rollback once gear or builds exist (`CHARACTER_NOT_EMPTY`).
- Inventory pages add gear from the catalog through `AddOwnedModal`; an empty catalog
  shows a notice and a link back to `/setup`. A container opens its fill editor right
  after it is added.
- New `icons` source downloads `<sha1>.png` from the EXBO repository into `ICONS_DIR`;
  `/icons/:file` serves both `.png` and `.webp`. Per-file failures are counted, not fatal.
- New optional `profile` source fills public statistics from the official STALZONE API
  (OAuth client credentials). It rewrites only `origin='api'` rows, keeps manual
  overrides, stores playtime as hours and drops counters missing from the response.
- `sync_source` (MCP) and `npm run sync` accept `icons` and `profile`; `all` stays
  catalog-only. `GET /api/v1/setup` reports first-run state.

_No schema change; the calculator and the golden fixture are untouched._

## [2026-11-17] — Typed database baseline, seedless catalog and reset

### Added

- `GET /api/v1/details/:key` serves derived cards.
- `export_dossier_json` is added; `get_character` and `get_item` return the typed shapes
  (derived fields, stats, effects, card).

### Changed

- `0001_init.sql` is replaced by a typed baseline: reference tables (`source`,
  `stat_definition`, `item`, `item_stat`, `item_effect`, `icon`, `price_quote`,
  `price_latest`) and dossier tables (`character`, `character_stat`, `owned_item`,
  `owned_container`, `container_slot`, `build`, `build_metric`, `build_slot`, `event_log`).
  Working tables keep no JSON; only `event_log.before/after` does. An existing database
  must be rebuilt — see `docs/MIGRATION.md`. There is no automatic data migration.
- `character_stat` stores raw counters with `api`/`manual` origins. The character editor
  edits raw counters only; K/D, accuracy, headshot share and hours are derived, read-only.
- Container display follows override (`owned_container`) > item stats > `null`; containers
  are edited in the item modal instead of free-form `extra`.
- `PATCH /api/v1/character` accepts `stats`; the export is the typed dossier JSON.
- The MCP registry has 20 tools: 12 read, 8 write.
- `npm run golden` no longer reads a personal dossier: it recomputes a public synthetic
  fixture and must print `mismatches: 0` and `legacyDeltas: []`.
- `.env.example`, compose, README, runbook and docs drop `PROFILE_FILE` and the seed
  workflow.

### Removed

- The personal seeds, legacy import, `content_block` features (career, recommendations,
  earnings, build/catalog meta), `catalog_entry` and `details_card` are removed. The
  catalog and detail cards are derived at read time from synced public sources; the first
  run is an empty database plus `npm run sync`.
- The content route is gone.
- `upsert_content_block` and `export_legacy_json` are gone.
- `npm run import:legacy` is removed.

## [2026-11-17] — Inventory toolbar and grouping

### Added

- Weapons and Armor gained a type/class filter and grouping by type/class; all four
  inventory pages now share one toolbar component with grid/list views, search, rank, sort
  direction and reset.
- The toolbar persists its state per section in `localStorage`.

### Changed

- Containers and Artifacts are single full-width panes: grid/list views, search, type and
  rank filters, sorting and grouping. Container details and fill, and artifact cards, open
  in modals; the container side pane and slide-over are gone.

_No API, DB or MCP changes._

## [2026-11-17] — Dev server address comes from the environment

### Added

- `nuxt.config.ts` reads `DEV_HOST` and `DEV_PORT` (from `.env` or the shell) instead of
  hard-coding `127.0.0.1:80`. `npm run dev` prints the address it binds to, so
  `DEV_HOST=stalzone-profile.local` makes the console banner show the domain; a non-IP
  `DEV_HOST` is appended to `devServer.allowedHosts` automatically. Defaults are unchanged.
- `.env.example`, the README variable table and the quick start describe the two variables.

## [2026-11-17] — Character editor gets grouped fields, a faction select and a date input

### Added

- Faction becomes a searchable select of the current STALZONE factions («Сталкеры»,
  «Бандиты», «Заря», «Рубеж», «Завет», «Наёмники», «Шёпот»); any other value can still be
  typed and saved, and a stored legacy value stays selectable.
- New `forms.section*`, `forms.chooseFaction`, `forms.createFaction` and
  `forms.arrivedStored` keys in both catalogs.

### Changed

- The character editor groups its fields into Profile, Progress, Combat, Money and Notes
  instead of one flat grid, and moves the actions into the modal footer with a new Reset
  next to Cancel and Check/Save.
- "In the Zone since" is a native date input. A stored non-ISO string (for example
  `6 декабря 2024`) is not discarded: it is kept and shown as a hint until a date replaces
  it, so opening the editor and saving cannot rewrite game data.
- Numeric fields get real bounds and steps: percentages are 0–100, K/D steps by 0.01,
  money by 1000.

_No API, schema, MCP or number changes._

## [2026-11-16] — Overview reads as an inventory dashboard

### Added

- The Character pane leads with a **Key stats** strip (hours, K/D, accuracy, headshots).
  Percentages carry a 0–100 accent bar; no other value has a bar because none has a real
  maximum. Achievements with points, money and maximum money (brass) and the in-zone date
  follow as rows, then the stash as the stored string, never a bar.
- New keys `overview.keyStats` and `overview.sectionAria` in both catalogs.

### Changed

- Career splits into two balanced columns from 1280px. Sections became a 2×2 inventory-slot
  grid whose links name their count; the prices age in Data state uses the freshness tones.

### Removed

- The paper-doll placeholder is gone from the Character pane: the nick, playstyle and edit
  action now start the pane, so the first thing under the page title is data, not a stand-in.

_No API, schema, MCP or number changes._

## [2026-11-16] — Weapons and Armor drop the side columns

### Changed

- The Weapons and Armor pages are a single full-width list or grid: the character summary,
  the section list and the in-flow item card are gone. The top bar remains the only section
  navigation, and selecting an item opens its card in a modal at every width.

### Removed

- The unused `InventorySidebar` component and the `weapons`/`armor` `detailTitle` and
  `noSelection` translation keys are removed.

## [2026-11-16] — Builds, Recommendations, Earnings and Notes removed from the site

### Changed

- Old `/?tab=builds|recs|recommendations|earnings|notes` links stay on the overview instead
  of redirecting to a removed route.

### Removed

- The shell now has five sections: overview, weapons, armor, containers and artifacts. The
  Builds, Recommendations, Earnings and Notes pages, their navigation entries, overview
  counts and edit modals are gone.
- Notes are removed end to end: the `notes` content kind is rejected by the API and MCP,
  payload and export no longer carry `notes`, the seed has no notes, and migration `0003`
  deletes existing `content_block` rows of that kind. The cleanup is one-way.

_`/api/v1/builds`, the remaining content blocks (recommendations, earnings, build and
catalog meta), export and MCP tools are unchanged._

## [2026-11-15] — First reproducible version

### Added

- Repository skeleton: npm workspaces, Nuxt 4 + Nuxt UI, TypeScript strict, ESLint,
  Vitest, tsup.
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

[Unreleased]: https://github.com/NemoKing1210/stalzone-profile/commits/main
