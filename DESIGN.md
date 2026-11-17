# DESIGN.md — STALZONE visual system

Status: proposed; implementation starts only after the owner approves this document.
Date: 2026-11-15.
Scope: the visual language of the Nuxt site — color, type, layout, components, the accent setting.
Out of scope: data model, API, MCP contract, business logic, number formulas, authorization.

Current UI change (2026-11-16): the Builds, Recommendations, Earnings and Notes sections
were removed from the site. Sections 8.5–8.8 below describe the earlier proposal and are
kept for reference only.

The site is a private STALZONE profile. It keeps Nuxt UI for controls (buttons, inputs,
selects, modals, tables, toasts) because that library already provides behaviour and
accessibility. This document describes how those controls are dressed, which small custom
primitives are added, and how the pages are arranged. Nuxt UI is the skeleton; STALZONE is
the skin.

## 1. Intent

The profile should read as a piece of equipment from the Zone, not as a marketing site and
not as a generic admin dashboard. It is a working tool: dense, quiet, legible under a lot
of numbers, with the visual grammar of the in-game inventory.

Success looks like this:

- a player recognises the STALZONE inventory language immediately (dark panes, hairline
  rules, condensed caps, green selection, rank-coloured item names);
- a table with 356 rows and ten columns remains easy to scan;
- the interface never invents numbers, never hides a "no data" state, and never suggests an
  action that does not exist;
- changing the accent in Settings immediately recolours links, selection, focus and primary
  buttons without changing semantic colors;
- the whole visual layer can be explained by one token file and a handful of primitives.

## 2. Evidence

Four sources were analysed before this document.

### 2.1 Official site — stalzone.com

`stalcraft.net` redirects to `stalzone.com`: STALCRAFT: X is officially becoming STALZONE.
The marketing site is a black, cinematic landing built around full-bleed game art.

Observed tokens (from the served CSS):

| Token | Value | Use |
| --- | --- | --- |
| `--black-bg-color` | `#0A0A0A` | page background |
| `--card` | `#181818` | cards |
| `--card-description` | `#0F0F0F` | inset cards |
| `--border-color` | `#2E2D2D` | hairlines |
| `--title-text` | `#ECE7E1` | headings |
| `--main-color` | `#B1AFAC` | body text |
| `--red-color` | `#E91932` | CTA, live dot, alerts |
| `--warning-color` | `#EDB341` | warnings |
| `--border-radius-common` | `5px` | buttons, inputs |
| `--border-radius-card` | `10px` | cards |

Typography: **Bebas Neue** for large uppercase display headings and the wordmark; **Roboto**
for body copy; **Rodchenko** for a few constructivist accents; Manrope and Pretendard in
localised sections. Imagery is dark, desaturated and photographic: ruined industry, gas
masks, red emergency light, cold blue night, toxic green.

The official site is a reference for brand voice and display typography, **not** for the
application palette. Its red is a marketing accent; using it as the primary interactive
colour would collide with errors and negative values.

### 2.2 In-game inventory

The inventory screen provides the primary reference for the application. Observed
structure and colour:

- warm charcoal surfaces, not pure black: page/backdrop around `#1B1B1B`, panes around
  `#1F1F1F`, pane headers around `#262626`, hairline borders around `#343434`;
- text is warm off-white (`#D8D8D3`-ish), labels are muted grey (`#9A9A94`-ish);
- **the interactive accent is a muted green** (`#63B356`-ish): the selected item is outlined
  in green and its name is green;
- **red is semantic, not brand**: it marks negative modifiers and debuffs (`#C2564F`-ish);
- item names are coloured by rank/rarity: green, blue, violet, red, amber; a category label
  in small caps sits above each name;
- positive values (weights, protection, durability) are green; neutral values are off-white;
- panes have square corners, 1px rules, and a centred small-caps title bar;
- the layout is a three-column instrument: gear/character on the left, a long list of
  properties in the middle, the item grid on the right; a storage bar closes the right
  pane; compact keyboard hints sit in the top and bottom bars;
- typography is condensed sans (Roboto Condensed-like) at small sizes, with tabular
  numerals and wide tracking on labels;
- there are no shadows, gradients inside data areas, rounded cards or decorative textures.

This is the language the profile adopts. The official site's red and its 5/10px rounded
cards are deliberately not carried over.

### 2.3 stalzone.wiki

The community wiki confirms the same dark family and adds two useful patterns: a warm amber
accent for primary actions, and a consistent rank palette (`newbie` green, `stalker` blue,
`veteran` violet, `master` red, `legend` gold). Its cards are softer and rounder than the
game's; the profile takes the rank palette and the dense data tables, not the rounded card
style.

### 2.4 Previous static report (prior art)

The previous `report/stalcraft.html` was an olive/amber tactical dashboard. Its palette was
already close to the in-game inventory: `--bg #0b0d0a`, `--panel #141a13`, `--amber #e0a63c`,
`--olive #7f8f5a`, `--green #63b356`, `--red #c2564f`. This confirms that the muted green/red
pair belongs to the game's language, while the amber was an editorial choice of that report.

### 2.5 Conclusion

The profile uses the **in-game inventory** as its visual base, the **official wordmark** for
identity, and the **wiki rank palette** for item names. The default accent is the game's
green; the accent is user-selectable in Settings.

One adjustment follows from bilingual delivery: Bebas Neue has no Cyrillic in Fontsource, so
display headings use **Oswald** (Latin + Cyrillic) and Bebas Neue is reserved for the Latin
wordmark and large numerals. This keeps the Russian and English headings in the same face
instead of mixing Bebas with a fallback.

## 3. Principles

1. **Instrument, not poster.** The screen is a tool. Art direction lives in type, colour and
   spacing, not in large decorative images.
2. **Hairlines and panes.** Structure is made with 1px rules, header bars and square corners —
   the way the game divides an inventory into panes.
3. **One accent, fixed semantics.** The accent drives interaction (selection, active nav,
   focus, primary buttons). Positive, negative, warning and rank colours never change with
   the accent.
4. **Numbers are the content.** Numerals are tabular, right-aligned, and never shrink below a
   readable size. A dash means "no data"; zero is written as zero.
5. **Density with air.** Rows are compact but not cramped: 28–32px, 8–12px between groups,
   one clear hierarchy level per pane.
6. **Quiet texture.** The page shell may carry a low-contrast weathered backdrop (§4.7), but
   texture never reaches a data area: panes, tables and modals keep flat opaque surfaces. No
   scanlines or high-frequency noise under rows. A faint inset highlight on header bars and a
   blurred backdrop behind modals remain the in-pane maximum.
7. **Honest affordances.** No fake keyboard shortcuts. Keycaps appear only for shortcuts that
   really work; otherwise use web-native wording ("Open", "Edit").
8. **Accessible by construction.** Contrast, focus, keyboard paths and touch targets are part
   of the token set, not a later pass.
9. **Reuse before invention.** A Nuxt UI component with theme tokens first; a custom primitive
   only when the inventory language needs structure Nuxt UI does not provide.

## 4. Tokens

All tokens live in `app/assets/css/main.css` (Tailwind 4 `@theme` and `:root` overrides).
Pages and components consume tokens or Tailwind utilities derived from them; no raw hex in
templates.

### 4.1 Color

Raw palette (dark only):

| Token | Hex | Role |
| --- | --- | --- |
| `--sz-ink-950` | `#101010` | app chrome, top/bottom bars, tooltips |
| `--sz-ink-900` | `#161616` | page background |
| `--sz-ink-850` | `#1B1B1B` | secondary pane |
| `--sz-ink-800` | `#1F1F1F` | panel surface |
| `--sz-ink-750` | `#262626` | panel header, elevated surface |
| `--sz-ink-700` | `#2E2E2E` | hover surface, alternate row |
| `--sz-line` | `#343434` | default border |
| `--sz-line-strong` | `#454545` | selected/active border |
| `--sz-text` | `#D8D8D3` | primary text |
| `--sz-text-muted` | `#9A9A94` | secondary text, labels |
| `--sz-text-dim` | `#7A7A74` | decorative only (never essential text) |
| `--sz-text-inverse` | `#101010` | text on accent fills |
| `--sz-green` | `#63B356` | default accent, positive |
| `--sz-green-bright` | `#86CF7F` | positive text on dark |
| `--sz-amber` | `#E0A63C` | warning |
| `--sz-amber-bright` | `#F0C469` | warning text on dark |
| `--sz-blue` | `#4A9FD8` | info, stalker rank |
| `--sz-violet` | `#A06FC4` | veteran rank |
| `--sz-red` | `#C2564F` | negative fill, danger border |
| `--sz-red-bright` | `#E08B84` | negative/error text on dark |
| `--sz-brass` | `#D8C08A` | money and lot prices |

Semantic mapping (the names used by components):

| Semantic token | Value | Notes |
| --- | --- | --- |
| `--sz-accent` | accent preset, default `#63B356` | interaction only |
| `--sz-accent-hover` | preset hover | |
| `--sz-accent-pressed` | preset pressed | |
| `--sz-on-accent` | `#101010` | text/icon on accent fills |
| `--sz-bg` | `#161616` | page |
| `--sz-surface` | `#1F1F1F` | panel |
| `--sz-surface-alt` | `#1B1B1B` | secondary pane |
| `--sz-surface-header` | `#262626` | pane/table header |
| `--sz-border` | `#343434` | |
| `--sz-border-strong` | `#454545` | |
| `--sz-text` | `#D8D8D3` | |
| `--sz-text-muted` | `#9A9A94` | |
| `--sz-text-dim` | `#7A7A74` | decorative |
| `--sz-success` | `#63B356` | fixed, never follows accent |
| `--sz-success-text` | `#86CF7F` | |
| `--sz-warning` | `#E0A63C` | |
| `--sz-warning-text` | `#F0C469` | |
| `--sz-danger` | `#C2564F` | |
| `--sz-danger-text` | `#E08B84` | |
| `--sz-info` | `#4A9FD8` | |
| `--sz-money` | `#D8C08A` | |

Rank palette. Chip/border colours must equal `packages/shared/src/ranks.ts` `RANK_COLOR`;
item-name text uses a text-safe variant where the exact colour misses 4.5:1 on the pane.
The UI layer owns the text variants; `packages/shared` is not changed.

| Rank | Chip/border | Text on dark | Notes |
| --- | --- | --- | --- |
| default | `#6F7767` | `#9AA294` | olive grey; exact colour fails 4.5:1 as text |
| newbie | `#63B356` | `#63B356` | passes as text |
| stalker | `#4A9FD8` | `#4A9FD8` | passes as text |
| veteran | `#A06FC4` | `#C39CE0` | exact colour fails as text on the pane |
| master | `#C2564F` | `#E08B84` | exact colour fails as text on the pane |
| legend | `#E0A63C` | `#E0A63C` | passes as text |

Token names: `--sz-rank-default`, `--sz-rank-default-text`, and the same pair for `newbie`,
`stalker`, `veteran`, `master`, `legend`. `RarityName` reads the `-text` token; `RankBadge`
reads the base token.

Freshness:

| State | Color | Extra cue |
| --- | --- | --- |
| fresh (< 3 h) | `--sz-success-text` | dot + text |
| aging (< 24 h) | `--sz-warning-text` | dot + text |
| stale (≥ 24 h) | `--sz-danger-text` | dot + text |
| unknown | `--sz-text-muted` | text "no data" |

Rules:

- The accent is used for: active navigation/category, selected row/card outline, focus ring,
  primary button fill, links, the thin progress fill. It is not used for positive values.
- Positive/negative/warning colors are fixed. A user cannot recolour them.
- Red is never the primary accent. The preset list excludes red because red already means
  "negative/error".
- Rank colour applies to the **item name** only (and a 1px rank border where a card has a
  visual border). It never colours numbers or whole rows. The name uses the text-safe variant;
  chips, dots and borders use the exact `RANK_COLOR`. A unit test verifies both variants against
  `#161616` and `#1F1F1F`.
- Colour is never the only carrier: rank is also written as text, freshness has a label,
  positive/negative values carry a sign or a word.

### 4.2 Typography

Families:

- `--sz-font-display`: **Oswald** (500). Page titles (h1), large KPI values, modal titles where
  a display face helps. It supports Latin and Cyrillic, so both locales share one display
  voice. Never body, table cells or labels.
- `--sz-font-brand`: **Bebas Neue** (400). Only the Latin wordmark (`STALZONE // PROFILE`) and
  digits in large KPI values. It has no Cyrillic; never use it for translated text.
- `--sz-font-sans`: **Roboto Condensed** (400/500/700). Everything else: UI, tables, forms,
  prose, labels. 300 is not used for small text.
- `--sz-font-mono`: system monospace stack (`ui-monospace, SFMono-Regular, Menlo, Consolas,
  monospace`). IDs, JSON, event entity keys.

Delivery: self-hosted via Fontsource packages (`@fontsource/oswald`,
`@fontsource/roboto-condensed`, `@fontsource/bebas-neue`), Latin + Cyrillic subsets,
`font-display: swap`. No runtime request to Google Fonts. Weights: Oswald 500; Roboto
Condensed 400/500/700; Bebas 400. The Cyrillic requirement is the reason the display face is
Oswald rather than Bebas.

Scale (web sizes, deliberately larger than the game's tiny HUD):

| Role | Size / line | Weight | Transform | Tracking |
| --- | --- | --- | --- | --- |
| Display XL (h1 desktop) | 36 / 1.0 | Oswald 500 | uppercase | 0.06em |
| Display L (h1 mobile) | 28 / 1.0 | Oswald 500 | uppercase | 0.06em |
| H2 (pane section) | 17 / 1.2 | RC 500 | uppercase | 0.08em |
| H3 (card title) | 14 / 1.3 | RC 500 | none | 0.01em |
| Body | 13 / 1.45 | RC 400 | none | 0 |
| Table cell | 12.5 / 1.3 | RC 400 | none | 0 |
| Table header | 11 / 1.2 | RC 500 | uppercase | 0.13em |
| Label / caps | 11 / 1.2 | RC 500 | uppercase | 0.14em |
| Micro (status only) | 11 / 1.2 | RC 500 | uppercase | 0.12em |
| KPI value | 28 / 1.0 | Bebas 400 (digits only) | none | 0.02em |
| Prose | 14 / 1.55 | RC 400 | none | 0 |

Rules:

- Nothing essential below **11px**. The game's 8–10px labels are a screenshot artefact, not a
  web target.
- Uppercase is a CSS transform (`text-transform`), never baked into translation strings.
- All numerals use `font-variant-numeric: tabular-nums`; right-align numeric columns.
- Currency, decimals and dates come from `useFormat` / `@profile/shared/format`; no manual
  separators.
- Long Russian labels must wrap; never truncate a label without a tooltip. Ellipsis is allowed
  only in one-line table names with a tooltip/full value on selection.
- Prose line length 60–75ch; data panes may be tighter.

### 4.3 Spacing, radii, borders, elevation

- Spacing base 4px: `4, 8, 12, 16, 20, 24, 32, 40, 48`.
- Page gutter: 16px mobile, 24px desktop. App max-width: `1600px`; content can stretch.
- Pane padding: header 0 10px; body 10–12px (dense), 16px (comfortable).
- Gap between panes: 1px (shared border) on desktop; 8px between stacked panes on mobile.
- Radii: `0` everywhere. `--ui-radius: 0`. A 2px radius is allowed only on the focus ring
  and on the tiny status dot; cards, buttons, inputs, modals and badges are square.
- Borders: 1px `--sz-border`; selected/active 1px `--sz-border-strong` plus the accent; active
  navigation/category uses a 2px accent inset bar.
- Elevation: no drop shadows. Panel headers get `inset 0 1px 0 rgba(255,255,255,.04)`.
  Selected cards get `inset 0 0 0 1px accent`. Modal backdrop: `rgba(0,0,0,.72)` plus
  `backdrop-filter: blur(3px)`.
- Row height: 28px dense, 32px default. Touch rows: 44px minimum.

### 4.4 Iconography

- Lucide, already installed (`@iconify-json/lucide`). Stroke 1.5, sizes 16/20/24.
- Icons are functional, never decorative filler. Every icon has an accessible label or sits
  next to one.
- Section icons: crosshair (weapons), shield (armor), backpack (containers), gem (artifacts),
  layers (builds), lightbulb (recommendations), coins (earnings), notebook (notes), settings.
- The brand mark is a small radiation trefoil or a simple bracket monogram drawn in CSS/SVG;
  it is not an asset from the game. The shipped favicon (`public/favicon.ico`, 16/32/48 px)
  is that trefoil in the default game green on the ink tile; browser icons cannot follow the
  user-selected accent, so it is fixed.

### 4.5 Motion

- Durations: 120ms (hover/selection), 160ms (modal, toast), 200ms (pane reveal).
- Easing: `cubic-bezier(.2,.8,.2,1)` (ease-out). No bounce, no spring.
- Properties: colour, background-color, border-color, opacity, transform (≤2px). Never animate
  layout dimensions of tables.
- `prefers-reduced-motion: reduce` disables transforms and shortens transitions to 0.01ms.
- Selected state is instant enough (120ms) to feel like a game selection, not a web animation.

### 4.6 Z-index

| Layer | Value |
| --- | --- |
| sticky table header | 10 |
| radio bar | 30 |
| app header | 40 |
| dropdown/popover | 50 |
| modal/slideover | 60 |
| toast | 70 |
| tooltip | 80 |

### 4.7 Atmosphere layer

The shell carries a procedural backdrop, not a picture. `.sz-atmosphere` (applied to the root
element of the default layout, login and setup) paints a fixed viewport layer behind all
content:

- a fine grid every 28px whose 1px lines take the current accent (2.5%), so the backdrop
  recolours with the accent preset;
- a fine grain tile generated by an inline `feTurbulence` SVG (≈5% alpha);
- a heavy edge vignette that pulls the eye to the centre.

Rules: the layer is `position: fixed` and `pointer-events: none`, so it does not scroll with
rows and does not capture input; it renders at z-index −1 inside an isolated stacking context,
above the base colour and below every pane. Panes, tables, modals and the header keep opaque
surfaces — no texture is painted inside a data area. Nothing animates, so reduced motion
needs no special case. Weight: one CSS block plus two inline SVG data URIs; no image files
and no network requests.

## 5. Layout

### 5.1 App shell

```
┌ top bar ────────────────────────────────────────────────────────────────┐
│ brand  //  nav (uppercase)                     freshness  locale  actions │
├ main ─────────────────────────────────────────────────────────────────────┤
│  page content (panes, tables, grids)                                     │
├ status bar ──────────────────────────────────────────────────────────────┤
│ count / storage / last update / section context                          │
├ radio bar ───────────────────────────────────────────────────────────────┤
│ play · prev/next · ZONE FM · track · time · meter · volume · track list   │
└──────────────────────────────────────────────────────────────────────────┘
```

- Top bar: 48px desktop, 56px mobile (wraps nav to a second scrollable row). Background
  `--sz-ink-950`, bottom border `--sz-border`.
- Brand: Bebas wordmark `STALZONE // PROFILE`; the slashes use the accent. On mobile only the
  mark and "STALZONE" remain.
- Navigation: uppercase 11px, tracking 0.14em, muted text; active = text + 2px accent inset
  underline. Horizontal scroll on narrow screens (Nuxt UI `UNavigationMenu`).
- Right cluster: freshness badge, locale menu, settings, logout. Ghost buttons, 32px square.
- Main: page-specific archetype below; padding 16/24px.
- Status bar (optional per page): 28px, `--sz-ink-950`, top border; shows counts, storage
  weight, last update, and only real shortcuts. Hidden on mobile if it costs vertical space.
- Radio bar: collapsed by default to a floating 44px radio button at the bottom-right;
  expanding shows the 56px mobile / 64px desktop bar, closing returns to the button. Both
  states are fixed overlays: the shell reserves no height, so opening or hiding the player
  never shifts the layout. The open/collapsed choice persists. It exists only in the
  authenticated shell (not on `/login` or `/setup`) and stays silent until the user presses
  play; it never autoplays. See §6.4.

### 5.2 Page archetypes

**A. Inventory list** — weapons, armor, containers, artifacts.
A single full-width pane: the shared toolbar (Owned/Catalog where the payload has a catalog,
grid/list views, search, type/class, rank, sort and direction, grouping, reset) + card grid
or table + a count hint. Grouping renders sections with `label · count` headings. Selecting
an item opens its card in a modal at every width; the list is never narrowed by a side
column. Sections are reached from the top navigation.

**B. Two-pane list + detail** — reserved.
No current section uses it; the pages that did were removed or moved to archetype A.

**C. Document column** — builds, recommendations, notes.
Full-width panes stacked with 16px gaps. Each pane = header (title, tag, edit action), an
optional metric strip, a body (rows, table or prose) and a footer verdict/note. No third
pane; long text must not be squeezed into 280px.

**D. Dashboard** — overview.
Left 300px: character sheet (nick, playstyle, key stats and money).
Center 1fr: career/achievement stat list. Right 320px: section counts and data freshness.
On mobile the order is character → counts → career.

**E. Admin** — settings.
A two-column grid of panes (single column below 1024px): Appearance, Sources, Event log,
Export, Backups, Data, Access. Sources and Event log use tables with their own scroll.

**F. Auth** — login.
Centered 360px pane on the shared atmosphere backdrop (§4.7); brand, subtitle, password field,
error alert, sign-in button, locale switcher top-right. No navigation.

### 5.3 Responsive

Breakpoints: `640`, `1024`, `1280`.

- `≥1280`: tables show all columns; the overview keeps its three panes.
- `1024–1279`: tables drop low-priority columns.
- `<1024`: single column. Navigation becomes a horizontally scrollable row. Item grids: 2
  columns at ≥640, 1 column below. Tables become horizontally scrollable with a sticky first
  column, or switch to a compact card list when the page already has one.
- `<640`: 44px touch targets; edit actions always visible (never hover-only); modals become
  full-height slide-overs; the status bar is hidden if it would push content.
- No horizontal page scroll at any width. Wide tables scroll inside their pane only.

### 5.4 Density

- Default row 32px; tables can opt into `dense` (28px) for catalog lists.
- Pane header 30px; toolbar 36px.
- Section spacing: 12px inside a pane, 16px between panes, 24px between page blocks.
- Empty states: 40px vertical padding, icon 24px, one sentence.

## 6. Components

### 6.1 Nuxt UI mapping

Controls remain Nuxt UI. The table lists the intended defaults; they are applied through
`app.config.ts` and `--ui-*` tokens so pages stay free of repeated `:ui` props.

| Component | Dressing |
| --- | --- |
| `UApp` | global wrapper; `toaster` positioned bottom-right |
| `UButton` | square; primary = accent fill + `--sz-on-accent`; secondary = `--sz-surface` + 1px border; ghost = transparent + muted, hover surface; danger = red fill; sizes xs 28px, sm 32px, md 36px; focus ring 2px accent offset 2px; no shadow |
| `UInput`, `USelect`, `USelectMenu`, `UInputNumber` | height 32px; `--sz-ink-900` background; 1px `--sz-border`; square; placeholder `--sz-text-dim`; focus border accent + 1px ring; invalid border red + message in `--sz-danger-text` |
| `UFormField` | label 11px caps muted; description 11px dim; error 11px danger text; 6px gap |
| `UModal`, `USlideover` | surface `--sz-ink-800`, 1px border, square; header 44px with title 14px 500; backdrop blur(3px) 72% black; footer actions right-aligned; scrollable body; mobile full-height |
| `UTable` | header `--sz-ink-750`, 11px caps, sticky; rows 30px, hairline dividers; hover accent 5%; selected row accent 8% + 2px left accent bar; numeric cells right/tabular; sortable header shows a 10px caret and `aria-sort` |
| `UCard` | replaced by `ProfilePane` where the inventory chrome is needed; a bare `UCard` uses surface + 1px border + square, header `--sz-ink-750` |
| `UBadge` | square; 11px caps; subtle = 12% colour + text colour; outline = 1px colour + text; never a pill |
| `UAlert` | square; 2px left semantic bar; icon 16px; title 12px 500; description 12px muted; neutral/info/warning/error variants |
| `UDropdownMenu` | surface `--sz-ink-800`, 1px border, square; item 30px; hover accent 8%; danger item red text |
| `UTooltip` | `--sz-ink-950`, 1px border, 11px, max 280px |
| `UNavigationMenu` | top nav, uppercase 11px; active accent underline 2px; hover surface |
| `UTabs` | segmented square tabs, 11px caps; active = surface + accent text + 2px bottom bar |
| `UProgress` | track `#151515`, fill accent, height 3px, square |
| `UEmpty` | icon 24px dim, title 14px 500, description 12px muted, centred, no card |
| `USkeleton` | `--sz-ink-750`, pulse 1.6s, square |
| `UToast` | surface + 1px border + 2px left accent/semantic bar; title 12px 500, description 11px muted; 160ms |
| `UAvatar` | square 1px border; fallback initials in RC 500 |

States (all components): default, hover, active/pressed, focus-visible, disabled, loading,
selected (where applicable), invalid. Focus-visible is always a 2px accent ring with 2px
offset; disabled uses 40% opacity and `cursor: not-allowed`; loading keeps the label width.

### 6.2 Custom primitives

Six small components, each with one job. They are presentation-only, SSR-safe, and have no
data fetching.

1. **`ProfilePane.vue`** — the pane chrome.
   Props: `title?: string`, `hint?: string`, `dense?: boolean`, `flush?: boolean`.
   Slots: `header`, `actions`, default, `footer`.
   Renders a `<section>` with a 30px header (`--sz-ink-750`, 1px bottom border, uppercase
   11px title, optional right hint/actions) and a body. Square, no shadow. Used everywhere a
   panel is needed; replaces most `UCard` usage on data pages.

2. **`StatRow.vue`** — one property line.
   Props: `label`, `value` (string | number | null), `tone?: 'neutral' | 'success' | 'danger'
   | 'warning'`, `suffix?`, `hint?`, `bar?: { value, max }`.
   Renders a flex row: muted label left, tabular value right, tone colour; `null` → `—` with
   `--sz-text-dim`. Optional 3px bar. Used in center panes and item cards.

3. **`RarityName.vue`** — an item name in rank colour.
   Props: `name`, `rank?: string | null`, `level?: number | null`, `size?: 'sm' | 'md' | 'lg'`.
   Uses `rankKey` and the exact `RANK_COLOR` for the border/dot from
   `@profile/shared/ranks` (subpath import), and the text-safe rank variant for the name.
   Renders the name plus `+15` when `level` is present; the level uses `--sz-success-text`, the
   name uses `--sz-rank-*-text`. Falls back to `--sz-text` when the rank is unknown. Colour is
   supported by the visible rank word elsewhere in the same card, not colour alone.

4. **`ProfileItemCard.vue`** — an inventory card.
   Props: `name`, `rank`, `category`, `level`, `icon?`, `stats` (array of `{ label, value,
   tone? }`), `selected?`, `to?`/`clickable?`.
   Renders: category caps, `RarityName`, a 16:9 icon/silhouette well (game icons when present,
   a generic Lucide silhouette otherwise), a footer with 2–3 stats (weight green, caliber
   neutral). Selected: 1px accent inset and a 2px left accent bar. Hover: surface-alt. Click
   and keyboard selection are handled by a real `<button>`; the card is not a naked div.

5. **`StorageBar.vue`** — the "Personal storage 38 / 90" bar.
   Props: `label`, `value`, `max`, `unit?`, `tone?`.
   Renders label left, numbers right, 3px bar underneath. Used only for real numeric ratios
   (container fill count, section counts). `character.stash` is a localized string such as
   "54.4 / 75.7"; it is displayed as text and never parsed to feed this bar. Clamps at 100%,
   never hides the real numbers.

6. **`KeyHint.vue`** — a real shortcut hint.
   Props: `keys: string[]`, `label: string`.
   Renders bordered keycaps. **Only for implemented shortcuts** (for example `Esc` to close a
   modal, `/` to focus search if implemented). If no shortcut exists, do not render a keycap;
   use a normal hint or nothing.

Supporting components already exist and are restyled rather than replaced: `RankBadge`
(becomes a square rank chip), `FreshnessBadge` (dot + text), `PriceCell` (brass money +
muted lot count), `StatBar` (wraps the 3px bar), `EventLog`, `LocaleSwitcher`,
`ConfirmActionModal`, `Edit*Modal`, `ContainerFillEditor`.

### 6.3 States and feedback

- Loading: skeletons that match the final row/card height; no spinners inside data panes.
- Empty: icon + one sentence + (when possible) the reason and the next action.
- No data: `—` with a tooltip "no data"; never `0`, never a guess.
- Error: `UAlert` with the localized message from `useApiError`; errors are red, not accent.
- Success: toast bottom-right, 3s, with a semantic left bar.
- Dry run: the write result preview uses the same pane chrome; a dashed 1px border marks the
  preview state.
- Selection: accent border; no glow; the selected row remains readable on hover.
- Disabled: 40% opacity; tooltips explain why when the reason is not obvious.

### 6.4 Radio bar

`ZoneRadio` (`app/features/radio/ui`) is the shell's only fixed element at the bottom.

- 56px mobile / 64px desktop, `position: fixed`, z-index 30, `--sz-ink-950` background and a
  1px `--sz-border` top rule; `env(safe-area-inset-bottom)` padding on iOS.
- Left: play/pause, previous, next. Centre: `ZONE FM` in 10px tracked uppercase, an `ON AIR`
  dot only while playing, the track title, and on wider screens the elapsed/total time and a
  2px progress rule. Right: a 16-bar level meter, mute, volume, and the track list.
- The meter reads an `AnalyserNode`; the time reads the media element. Nothing is invented:
  before metadata the time is `--:--`, and a failed play reads as an error.
- All colours are `--sz-*` tokens; the accent drives the meter, the progress rule and the
  current track in the list. Square corners, no shadows, no texture.
- Mobile keeps play/pause, previous, next, the title, a volume popover and the track list.
  The meter, elapsed time and inline slider are hidden; the 44px touch targets remain.
- Collapsed by default: a single square radio button floats at the bottom-right (with a
  small `ON AIR` dot while playing) and opens the bar; the bar's chevron returns it to the
  button. Collapsing never pauses playback. Both states are fixed overlays, so neither
  reserves height nor moves the page.
- Appearance is animated: the bar slides up from the bottom edge with a fade (200ms
  transform, 160ms opacity) and the button fades and scales in; hiding reverses it. Under
  `prefers-reduced-motion: reduce` both change instantly.
- The chosen track, volume and open/collapsed state persist in `localStorage` under
  `profile.radio`; playback state does not. See `docs/AUDIO.md` for the assets and license.

## 7. Accent setting

### 7.1 UX

Settings gains an **Appearance** pane (first pane in Settings):

- Title: "Appearance" / "Оформление".
- Text: the accent changes selection, active sections, focus and primary buttons. Positive,
  negative and warning colours do not change.
- A radio group of five swatches: a 20px square of the colour, the localized name, and a
  "Default" tag on the green option. Selected: 2px accent ring + check icon.
- Changes apply immediately; no Save button, no page reload.
- A small "Reset to game default" action returns to green.

Presets:

| id | English | Russian | Hex | Hover | Notes |
| --- | --- | --- | --- | --- | --- |
| `green` | Zone green | Зелёный | `#63B356` | `#74C466` | default, matches in-game selection |
| `amber` | Amber | Янтарь | `#E0A63C` | `#EBC15E` | prior report; shares hue with warning, so warnings always carry an icon and text |
| `blue` | Signal blue | Синий | `#4A9FD8` | `#6FB5E4` | cool alternative |
| `violet` | Violet | Фиолетовый | `#B78BD6` | `#C9A6E3` | exact rank violet `#A06FC4` fails 4.5:1 on the pane; the preset uses the brighter variant |
| `bone` | Bone | Костяной | `#D8D8D3` | `#ECE7E1` | neutral, maximum contrast |

Red is not offered: it already means negative/error.

### 7.2 Mechanism

- `localStorage['profile.accent']` stores one of the preset ids. Invalid or missing → `green`.
- A tiny client plugin (`app/plugins/accent.client.ts`) reads the value and sets
  `document.documentElement.dataset.accent`.
- CSS defines `:root[data-accent='amber'] { --sz-accent: …; --ui-primary: …; }` etc. The
  default (`green`) is on `:root`, so SSR renders the default and hydration is stable.
- To avoid a flash for non-default users, an inline head script (same source, ≤200 bytes) sets
  the attribute before the app mounts. It reads only the local preference; it never touches
  personal data.
- No DB, API or MCP change. The preference is per browser, like sorting and filters.
- `--ui-primary` is overridden together with the full `--ui-color-primary-{50..950}` scale for
  the preset, so Nuxt UI's internal `primary-*` utilities and opacity modifiers stay coherent.
- The composable `useAccent()` exposes `accent`, `presets`, `setAccent`, `resetAccent`; it is
  SSR-safe (no `window` during setup; read on mount or via `useState`).

### 7.3 Accessibility

- Radio group semantics (`role="radiogroup"`, arrow-key navigation) or native inputs.
- Each swatch has a visible label; colour is not the only cue (name + check).
- Selected and focused states are distinct (ring vs. thicker border + check).
- All presets must meet 4.5:1 for text on `--sz-ink-900` and 4.5:1 for `--sz-on-accent` on the
  accent fill. Bone and amber are verified; blue/violet/green are verified in the palette
  section; if a future preset fails, it is rejected by a unit test.

## 8. Page blueprints

### 8.0 Reality constraints

The visual layer may only show fields that the payload actually carries. The following
elements from the game/reference screens are deliberately dropped or redefined; inventing a
field, parsing a display string, or changing the data model to satisfy a visual is forbidden:

- **No player rank chip.** `ProfileCharacter` has no rank. Rank colours are used only for item
  names. The character pane shows faction, clan and playstyle instead.
- **No numeric stash bar.** `character.stash` is a localized string. It is displayed as text;
  `StorageBar` is used only where numeric ratios exist.
- **No artifact weight.** The artifact payload does not expose item weight. The card omits it
  and shows `—` for other missing fields.
- **No URL selection state.** Weapons/armor selection stays local; there is no `?item=` deep
  link in this refresh.
- **No new date path.** `formatDate` stays the single formatter. If a stored value is not ISO,
  it returns the trimmed raw string instead of `—`, with a unit test; it does not add a second
  parser or a locale-specific guess.
- If a field is `null`, the UI shows `—` with a "no data" tooltip. It never shows `0`, an
  estimate, or a placeholder number.

### 8.1 Overview (`/`)

A three-pane instrument. The page title is the nick; faction, clan and realm sit under it.

- **Character** (left, 300px): nick, playstyle and the edit button, then a **Key stats** strip of four KPI tiles (hours, K/D, accuracy, headshots) separated by
  1px hairlines. Percentages carry a 2px accent bar on a 0–100 scale; no other tile has a bar
  because only percentages have a real maximum. Below: achievements with points, money and
  maximum money (brass `--sz-money`), in-zone-since as `StatRow`s, then the stash as the
  stored localized string, never a bar. No player rank chip; rank colours stay on item names.
- **Career** (center 1fr): the career list as rows, label muted, value in the display face,
  split into two balanced columns from 1280px (one list below).
- **Sections** (right 320px): a 2×2 inventory-slot grid — one square tile per section with
  icon, count and label; each tile links to its section and its accessible name includes the
  count. Below: **Data state** with profile date, prices age (success/warning/danger tone by
  the freshness thresholds), catalog date and source, and the about note.
- Mobile order: character → sections → career.
- Empty profile: a single pane with the current empty message, not a fake character.
- **Character editor** (modal behind "Edit profile"): fields are grouped as Profile /
  Progress / Combat / Money / Notes instead of one undifferentiated grid. Faction is a
  searchable select over the current STALZONE factions with free entry for any other value;
  "In the Zone since" is a native date input, and a stored non-ISO string is kept and shown
  as a hint until a date replaces it. Numeric fields carry real bounds and steps (percentages
  0–100, money in thousands). Actions sit in the modal footer: Reset, Cancel, and Check under
  dry run or Save otherwise.

### 8.2 Weapons (`/weapons`) and Armor (`/armor`)

- Left pane: character summary (compact) + section list; active = weapons/armor with a 2px
  accent left bar.
- Center pane: selected item detail — `RarityName`, category, rank, level; a block of
  `StatRow`s (damage, DPS, TTK, ROF, magazine, weight, caliber; armor: protection, +15,
  weight, class); effects/modifiers with green/red tones; a "no selection" state that shows
  aggregate counts instead of an empty void.
- Right pane: toolbar (Owned/Catalog segmented control, grid/list toggle, search, rank filter,
  sort), then the item grid (owned) or the dense table (catalog / list mode). Selected row or
  card is accent-outlined. Edit action appears on owned items only.
- Footer: count bar (`shown / total`, storage weight when available) and one real hint.
- The item detail modal remains for mobile and for details opened from builds/containers; on
  desktop the center pane is the primary detail surface. Selection is not encoded in the URL
  in this refresh (no `?item=` deep links).
- No change to calculations, sorting keys or filters.

### 8.3 Containers (`/containers`)

- One full-width pane with the shared inventory toolbar: grid/list views, search over name,
  type and bonus, rank and type filters, sort (name, weight, slots, efficiency, fill),
  direction, grouping by type and reset. State persists per browser.
- Card: `RarityName`, type, rank, icon, bonus text, stats slots / fill / weight. List:
  name, type, rank, slots, fill, efficiency, weight.
- Clicking a card or row opens a modal with `ContainerDetail` (header, 4-cell stat strip,
  artifact chips, fill date); owned containers get Edit and Fill actions. Opening a child
  dialog closes the container modal, so only one dialog is open at a time.
- Empty fill: "no artifacts" with the fill action, not an empty box.

### 8.4 Artifacts (`/artifacts`)

- One full-width pane with the shared inventory toolbar: grid/list views, search over name,
  type and effect, rank and type filters, sort (name, level, rank), direction, grouping by
  type and reset. State persists per browser.
- Cards: `RarityName`, type, quality, level and effect text clamped to 3 lines. List: name,
  type, rank, level, quality and a one-line truncated effect.
- Clicking a card or row opens the artifact card modal with full effects; owned artifacts
  keep the Edit action. Artifact weight is not exposed by the payload and is therefore not
  shown; missing fields render `—`, never a guess.
- Effects text stays muted prose; no colouring of arbitrary words.

### 8.5 Builds (`/builds`)

- Document column. Current build pane first (title, note, item chips).
- Each build is a `ProfilePane`: header with title + tag + edit; a 4-cell metric strip
  (container, slots, budget, total); the items table (name, quality, lot price, effect, plus,
  minus, why, rank); a verdict alert at the bottom; a price note alert when present.
- Tables keep all columns on desktop; horizontal scroll on mobile; the "why" column may move
  under the name on narrow screens.

### 8.6 Recommendations (`/recommendations`)

- Document column, 2 columns ≥1280, 1 below. Each recommendation is a `ProfilePane` with a
  title, lead, and rows (`label` muted left, value + description right); edit action in the
  header.
- No nested cards.

### 8.7 Earnings (`/earnings`)

- Filter bar: search, tier select, sort; edit-content action.
- Full-width table: activity, income (brass, tabular), tier, where, needs, risk, trust, note,
  source. Tier can be a rank-like chip; risk/trust use semantic text + label.
- A row expands inline (not a modal) for the full note and source date. On mobile the table
  becomes a card list with the same fields.

### 8.8 Notes (`/notes`)

- Search + 2-column grid of note panes; title, prose (whitespace preserved), edit action.
- Empty state explains there are no notes and how to add one.

### 8.9 Settings (`/settings`)

- Appearance pane first.
- Sources pane: table + sync buttons; status badges semantic (ok green, stale amber, error
  red, idle muted); error text red-bright.
- Event log pane: table; action badges neutral; rollback button ghost; confirm modal danger.
- Export / Backups / Data / Access panes in a 2-column grid; code tokens use inline code style
  (surface-alt, 1px border, monospace 11px).
- Event log and source table scroll inside their panes.

### 8.10 Login (`/login`)

- Centered 360px pane, brand, subtitle, password field, error alert, primary button, locale
  switcher. Background: the shared atmosphere backdrop (§4.7). No navigation, no
  footer links that do not exist.

## 9. Content and i18n

- Every visible string comes from `t(...)`; add keys to both `i18n/locales/en.json` and
  `ru.json` in the same change.
- New keys: `settings.appearanceTitle`, `settings.appearanceText`, `settings.accent`,
  `settings.accentDefault`, `settings.accentReset`, `accents.green`, `accents.amber`,
  `accents.blue`, `accents.violet`, `accents.bone`, `common.selected`.
- Uppercase and tracking are CSS, not part of the translation.
- Russian labels are longer; layouts must wrap, not truncate. Check both locales manually.
- Numbers, dates and money use existing formatters; the visual layer must not introduce a
  second formatting path. `formatDate` gains one documented fallback: a non-ISO stored value
  is returned trimmed instead of `—`, with a unit test.
- `docs/I18N.md` gets a short note about the appearance setting and its keys.

## 10. Accessibility

- Contrast targets: 4.5:1 for body and labels, 3:1 for large text and UI borders. The muted
  text on `--sz-ink-800` is ~5.8:1; `--sz-text-dim` is decorative and never used for essential
  content. Rank/category names use the text-safe variants listed in §4.1; a unit test checks
  every rank and accent preset against `#161616` and `#1F1F1F` and fails the build below 4.5:1.
- Focus is always visible: 2px accent ring, 2px offset. No `outline: none` without a
  replacement.
- Keyboard: every control reachable; modals trap focus (Nuxt UI) and close on Esc; tables
  expose sort state via `aria-sort`; clickable rows contain a real button/link; the item grid
  is navigable with Tab and Enter/Space.
- Hover is never the only way to reach an action; touch users see edit buttons.
- Colour is not the only carrier: rank text, freshness text, signs on negative numbers,
  labels on badges.
- Touch targets: 44×44px on mobile.
- Reduced motion respected.
- The interface remains usable at 200% zoom; no fixed-height text containers.
- Screen readers: panes are `<section>` with an accessible name; the decorative pane header
  does not duplicate the heading text; tables have captions or `aria-label`.

## 11. Performance and SSR

- Fonts self-hosted; preload the two primary woff2 files (Roboto Condensed 400, Oswald 500);
  `font-display: swap`; subset to Latin + Cyrillic. Budget: ≤180KB total fonts.
- No raster background images; the atmosphere layer (§4.7) is procedural CSS plus inline SVG,
  so it adds no files and no network requests. Panes stay opaque; no large filters except the
  modal backdrop blur.
- No runtime CSS-in-JS; tokens are static CSS. The accent switch changes variables only.
- SSR safety: no `window`, `localStorage` or `document` during setup. The accent plugin is
  client-only; the inline boot script runs before hydration and changes only an attribute on
  `<html>`.
- Deterministic dates: reuse `useFormat`; do not introduce `Date.now()` into SSR output.
- No change to the payload size or API responses.

## 12. Implementation mapping (Nuxt UI)

- `package.json` — add `@fontsource/oswald`, `@fontsource/roboto-condensed`,
  `@fontsource/bebas-neue`; import the needed weights/subsets from `main.css`.
- `app/assets/css/main.css`
  - `@import "tailwindcss"; @import "@nuxt/ui";`
  - `@theme` defines `--color-ink-*`, `--color-zone-*`, `--font-display`, `--font-sans`, and
    the rank/semantic colors.
  - `:root` overrides `--ui-bg`, `--ui-bg-muted`, `--ui-bg-elevated`, `--ui-bg-accented`,
    `--ui-text*`, `--ui-border*`, `--ui-radius: 0`, `--ui-primary`, `--ui-container`.
  - `[data-accent='…']` blocks override `--sz-accent`, `--ui-primary` and the
    `--ui-color-primary-*` scale.
  - A small `@layer components` block holds the shared primitives' classes (`.sz-pane`,
    `.sz-pane-header`, `.sz-caps`, `.sz-numeric`, `.sz-hairline`) so primitives stay thin.
- `app/app.config.ts`
  - `ui.colors.primary = 'zone'`, `ui.colors.neutral = 'ink'`.
  - Component defaults (`button`, `input`, `select`, `modal`, `table`, `badge`, `alert`,
    `card`, `progress`, `tooltip`, `dropdown`, `toast`) point at the tokens above; no raw hex.
- `app/components/` — the six primitives plus restyled existing components.
- `app/plugins/accent.client.ts` and `app/composables/useAccent.ts`.
- `nuxt.config.ts` — font preload/head entries if Fontsource does not inject them; no new
  modules required. `@nuxt/fonts` is already available through Nuxt UI but the doc assumes
  Fontsource for deterministic self-hosting.
- No changes to `packages/*`, `server/*`, `db/*` or MCP. The UI derives rank text variants
  from `RANK_COLOR`; it does not edit the shared rank constants.

## 13. Rollout and acceptance

Phases (each phase ends with `npm run check`):

1. **Foundations** — fonts, tokens, `app.config.ts`, base element styles, accent CSS blocks.
2. **Shell** — top bar, navigation, page header, status bar, login.
3. **Primitives** — `ProfilePane`, `StatRow`, `RarityName`, `ProfileItemCard`, `StorageBar`,
   `KeyHint`; restyle `RankBadge`, `FreshnessBadge`, `PriceCell`, `StatBar`.
4. **Data pages** — overview, weapons, armor, containers, artifacts.
5. **Document pages** — builds, recommendations, earnings, notes, settings.
6. **Accent setting** — settings pane, composable, plugin, boot script, tests.
7. **Polish** — focus states, responsive pass, empty/error states, screenshots, docs.

Acceptance:

- `npm run check` green; `npm run golden` still `0 mismatches`,
  `legacyDeltas: []` (no numeric change).
- No horizontal page scroll at 360, 768, 1024, 1440px.
- Keyboard-only pass: login → overview → weapons → open item → edit → close; visible focus
  everywhere; modals close on Esc.
- Both locales render without clipped labels.
- Accent switch applies instantly, survives reload, resets to green, and changes no semantic
  colour.
- Visual QA covers every page at 1440 and 390. Screenshots are **local only** and are never
  committed or sent outside; the profile is personal data. If an image must be shared, it is
  taken against an anonymized fixture or the empty-profile server (`:3111`) — never the
  working database.
- No personal data, secrets, game assets or screenshots are committed.

## 14. Non-goals and anti-goals

Non-goals:

- light theme, theme editor beyond the accent preset list, per-user server-side preferences;
- custom controls replacing Nuxt UI; a second component library;
- game assets, item renders, fonts or textures copied from the client;
- literal game keybinds, inventory slot mechanics, drag-and-drop;
- data/API/MCP changes; number changes; adding fields only to satisfy a visual;
- URL-encoded item selection in this refresh;
- animation-heavy transitions or a 3D scene.

Anti-goals (would make the result a failure even if it looks "cool"):

- red as the primary accent;
- rounded cards, pills and big shadows;
- grunge noise or scanlines behind tables (the page backdrop in §4.7 is allowed; inside a
  data pane it is not);
- tiny 8–10px body text;
- colour-only rank/status encoding;
- fake keyboard hints;
- unreadable low-contrast "atmosphere";
- new numbers or estimates implied by the visual layer.

## 15. Decisions log

| Decision | Choice | Why |
| --- | --- | --- |
| Base language | in-game inventory | the owner's reference; it is the game's actual application UI |
| Accent default | Zone green `#63B356` | the game's selection/positive colour |
| Red | semantic only | collisions with errors/negatives; official site red is marketing |
| Display font | Oswald 500 for headings; Bebas Neue only for the Latin wordmark/digits | Bebas has no Cyrillic in Fontsource; one display face must serve both locales |
| UI font | Roboto Condensed | matches the in-game condensed UI; good Cyrillic support |
| Radii | 0 | game panes are square |
| Accent storage | `localStorage` | per-browser UI preference; no schema/API change |
| Accent presets | green, amber, blue, violet, bone | red excluded; each verified for contrast |
| Custom components | six thin primitives | keeps the language consistent across nine pages without replacing Nuxt UI |
| Light theme | no | out of scope; the game is dark |
| Keycaps | only real shortcuts | honest affordances |
| Minimum text | 11px | web readability, unlike the game's HUD |
| Rank colours | exact `RANK_COLOR` for chips/borders; text-safe variants for names | `default`, `veteran`, `master` fail 4.5:1 as text on the pane |
| Player rank chip | omitted | the data model has no player rank; no field is invented |
| Stash | displayed as the stored string | `character.stash` is not numeric; parsing it would invent data |
| Artifact weight | omitted | not exposed by the payload |
| URL selection | no `?item=` deep link in this refresh | keeps routing/SSR out of a visual change |
| Screenshots | local only; anonymized fixture or empty server for any shared image | the real profile is personal data |
| Overview composition | KPI tiles and inventory-slot tiles inside the three panes | the owner asked for a more game-like, clearer reading; still only real numbers and bars with a true maximum |
| Page backdrop | procedural atmosphere layer (§4.7), fixed and behind opaque panes | the owner asked for a worn Zone backdrop; CSS/SVG keeps it asset-free and keeps tables readable |

Open items that the builder may settle:

- whether the status bar is useful on every page or only on data pages;
- the exact icon/silhouette used for items without a game icon;
- whether the center detail pane on weapons/armor persists the last selection across
  navigation (recommended: persist in `localStorage` like sorting);
- whether the accent boot script is worth the inline bytes versus a one-frame flash
  (recommended: include it; it is tiny).
