-- 0001_init.sql — STALZONE dossier baseline. Baseline replacement, 2026-11-17.
-- Every later schema change is a new NNNN_*.sql migration.

CREATE TABLE source (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  url         TEXT,
  status      TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'ok', 'stale', 'error')),
  last_ok_at  TEXT,
  last_try_at TEXT,
  last_error  TEXT,
  commit_sha  TEXT,
  commit_date TEXT,
  updated_at  TEXT NOT NULL
) STRICT;

CREATE TABLE stat_definition (
  id         TEXT PRIMARY KEY,
  category   TEXT,
  value_type TEXT CHECK (value_type IS NULL OR value_type IN ('INTEGER', 'DECIMAL', 'DATE', 'DURATION', 'TEXT')),
  label_ru   TEXT,
  label_en   TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE item (
  id           INTEGER PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES source(id),
  realm        TEXT NOT NULL DEFAULT 'ru',
  external_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  name_norm    TEXT NOT NULL,
  name_en      TEXT,
  name_en_norm TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL CHECK (kind IN ('weapon', 'armor', 'container', 'artifact', 'attachment', 'ammo', 'motif', 'other')),
  category     TEXT,
  rank         TEXT,
  slot         TEXT,
  weight       REAL,
  is_cosmetic  INTEGER NOT NULL DEFAULT 0 CHECK (is_cosmetic IN (0, 1)),
  base_item_id INTEGER REFERENCES item(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (realm, external_id)
) STRICT;
CREATE INDEX item_name ON item(name);
CREATE INDEX item_name_norm ON item(name_norm);
CREATE INDEX item_kind ON item(kind, category);
CREATE INDEX item_base ON item(base_item_id);

CREATE TABLE item_stat (
  item_id       INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  stat_id       TEXT NOT NULL REFERENCES stat_definition(id),
  label         TEXT,
  level         INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 15),
  value_num     REAL,
  value_min     REAL,
  value_max     REAL,
  value_text    TEXT,
  pct           INTEGER NOT NULL DEFAULT 0 CHECK (pct IN (0, 1)),
  is_positive   INTEGER CHECK (is_positive IS NULL OR is_positive IN (0, 1)),
  is_additional INTEGER NOT NULL DEFAULT 0 CHECK (is_additional IN (0, 1)),
  source_id     TEXT REFERENCES source(id),
  PRIMARY KEY (item_id, stat_id, level, is_additional)
) STRICT;
CREATE INDEX item_stat_key ON item_stat(stat_id);
CREATE INDEX item_stat_level ON item_stat(item_id, level);

CREATE TABLE item_effect (
  item_id     INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  label       TEXT NOT NULL,
  is_positive INTEGER NOT NULL DEFAULT 1 CHECK (is_positive IN (0, 1)),
  PRIMARY KEY (item_id, position)
) STRICT;

CREATE TABLE icon (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL UNIQUE REFERENCES item(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  sha1       TEXT NOT NULL,
  source_id  TEXT REFERENCES source(id),
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX icon_sha1 ON icon(sha1);

CREATE TABLE price_quote (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER REFERENCES item(id),
  external_id    TEXT,
  name           TEXT NOT NULL,
  name_norm      TEXT NOT NULL,
  quality        TEXT,
  quality_norm   TEXT NOT NULL DEFAULT '',
  bonus          INTEGER,
  lot_price      INTEGER,
  lot_count      INTEGER,
  current_price  INTEGER,
  last_trade     INTEGER,
  lot_updated_at TEXT,
  source_id      TEXT NOT NULL REFERENCES source(id),
  fetched_at     TEXT NOT NULL
) STRICT;
CREATE INDEX price_quote_lookup ON price_quote (name_norm, quality_norm, fetched_at DESC);
CREATE INDEX price_quote_item ON price_quote (item_id, fetched_at DESC);

CREATE VIEW price_latest AS
  SELECT
    id, item_id, external_id, name, name_norm, quality, quality_norm, bonus,
    lot_price, lot_count, current_price, last_trade, lot_updated_at,
    source_id, fetched_at
  FROM (
    SELECT
      p.*,
      ROW_NUMBER() OVER (
        PARTITION BY p.name_norm, COALESCE(p.quality_norm, ''), COALESCE(p.bonus, 0)
        ORDER BY p.fetched_at DESC, p.id DESC
      ) AS rn
    FROM price_quote p
  )
  WHERE rn = 1;

CREATE TABLE character (
  id                 INTEGER PRIMARY KEY,
  nick               TEXT NOT NULL,
  region             TEXT NOT NULL CHECK (region IN ('ru', 'eu', 'na', 'sea', 'global')),
  faction            TEXT,
  alliance           TEXT,
  clan_name          TEXT,
  clan_rank          TEXT,
  money              INTEGER,
  max_money          INTEGER,
  stash              TEXT,
  playstyle          TEXT,
  profile_fetched_at TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (nick, region)
) STRICT;

CREATE TABLE character_stat (
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  stat_id      TEXT NOT NULL REFERENCES stat_definition(id),
  value_num    REAL,
  value_text   TEXT,
  origin       TEXT NOT NULL CHECK (origin IN ('api', 'manual')),
  fetched_at   TEXT NOT NULL,
  PRIMARY KEY (character_id, stat_id, origin)
) STRICT;

CREATE TABLE owned_item (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES item(id),
  kind         TEXT NOT NULL CHECK (kind IN ('weapon', 'armor', 'container', 'artifact')),
  level        INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 15),
  quality      TEXT,
  skin_item_id INTEGER REFERENCES item(id) ON DELETE SET NULL,
  note         TEXT,
  role         TEXT,
  slot         TEXT,
  qty          INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  display_name TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX owned_item_unique
  ON owned_item (character_id, item_id, level, COALESCE(quality, ''), COALESCE(skin_item_id, 0));
CREATE INDEX owned_item_kind ON owned_item (character_id, kind);

CREATE TABLE owned_container (
  owned_id       INTEGER PRIMARY KEY REFERENCES owned_item(id) ON DELETE CASCADE,
  container_type TEXT,
  shield         REAL,
  bonus          TEXT,
  protection     REAL,
  slots          INTEGER,
  eff            REAL
) STRICT;

CREATE TABLE container_slot (
  container_owned_id INTEGER NOT NULL REFERENCES owned_item(id) ON DELETE CASCADE,
  slot               INTEGER NOT NULL,
  artifact_item_id   INTEGER NOT NULL REFERENCES item(id),
  level              INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 15),
  quality            TEXT,
  as_of              TEXT NOT NULL,
  PRIMARY KEY (container_owned_id, slot)
) STRICT;

CREATE TABLE build (
  id                INTEGER PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  short             TEXT,
  tag               TEXT,
  goal              TEXT,
  container_item_id INTEGER REFERENCES item(id),
  slots             INTEGER,
  eff               REAL,
  budget            INTEGER,
  total             INTEGER,
  verdict           TEXT,
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
) STRICT;

CREATE TABLE build_metric (
  build_id INTEGER NOT NULL REFERENCES build(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label    TEXT NOT NULL,
  value    TEXT,
  sub      TEXT,
  PRIMARY KEY (build_id, position)
) STRICT;

CREATE TABLE build_slot (
  build_id INTEGER NOT NULL REFERENCES build(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  item_id  INTEGER REFERENCES item(id),
  label    TEXT,
  quality  TEXT,
  rank     TEXT,
  price    INTEGER,
  lots     INTEGER,
  eff      TEXT,
  bonus    TEXT,
  minus    TEXT,
  why      TEXT,
  PRIMARY KEY (build_id, position)
) STRICT;

CREATE TABLE event_log (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  before    TEXT,
  after     TEXT,
  note      TEXT
) STRICT;
CREATE INDEX event_log_at ON event_log (at DESC);
