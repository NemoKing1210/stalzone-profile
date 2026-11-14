-- 0001_init.sql — базовая схема досье STALZONE.
-- Все изменения только новыми миграциями.

CREATE TABLE source (
  id            TEXT PRIMARY KEY,              -- exbo_base | wiki | scpmodel | profile | motifs | local
  kind          TEXT NOT NULL,
  url           TEXT,
  last_ok_at    TEXT,
  last_try_at   TEXT,
  etag          TEXT,
  status        TEXT NOT NULL DEFAULT 'idle',  -- idle | ok | stale | error
  last_error    TEXT
);

CREATE TABLE character (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nick              TEXT NOT NULL,
  realm             TEXT NOT NULL,
  faction           TEXT,
  alliance          TEXT,
  clan              TEXT,
  arrived           TEXT,
  hours             INTEGER,
  kd                REAL,
  accuracy          REAL,
  headshot          REAL,
  achievements      INTEGER,
  achievement_points INTEGER,
  money             INTEGER,
  max_money         INTEGER,
  stash             TEXT,
  playstyle         TEXT,
  stats             JSON,
  updated_at        TEXT NOT NULL,
  UNIQUE (nick, realm)
);

CREATE TABLE item (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     TEXT NOT NULL REFERENCES source(id),
  exbo_id       TEXT NOT NULL,
  realm         TEXT NOT NULL DEFAULT 'ru',
  name          TEXT NOT NULL,
  name_norm     TEXT NOT NULL DEFAULT '',       -- lower/ё→е/без кавычек, для поиска
  name_en       TEXT,
  name_en_norm  TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL,                  -- weapon | armor | container | artifact | attachment | ammo | motif | other
  category      TEXT,                           -- weapon/assault_rifle, armor/combined, artefact/gravity ...
  rank          TEXT,
  slot          TEXT,
  weight        REAL,
  quality       TEXT,
  is_cosmetic   INTEGER NOT NULL DEFAULT 0,
  base_item_id  INTEGER REFERENCES item(id),
  icon_path     TEXT,
  raw           JSON NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (realm, exbo_id)
);
CREATE INDEX item_name ON item(name);
CREATE INDEX item_name_norm ON item(name_norm);
CREATE INDEX item_kind ON item(kind, category);
CREATE INDEX item_base ON item(base_item_id);

CREATE TABLE item_stat (
  item_id       INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,                  -- damage.start | bullet_dmg_factor | weapon.tooltip...
  label         TEXT,
  level         INTEGER NOT NULL DEFAULT 0,     -- уровень заточки, 0 = база
  value_num     REAL,
  value_min     REAL,
  value_max     REAL,
  value_text    TEXT,
  pct           INTEGER NOT NULL DEFAULT 0,
  positive      INTEGER,
  is_additional INTEGER NOT NULL DEFAULT 0,     -- 1 = дополнительное свойство артефакта
  source_id     TEXT REFERENCES source(id),
  PRIMARY KEY (item_id, key, level, is_additional)
);
CREATE INDEX item_stat_key ON item_stat(key);
CREATE INDEX item_stat_level ON item_stat(item_id, level);

CREATE TABLE owned (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES item(id),
  kind          TEXT NOT NULL,                  -- weapon | armor | container | artifact
  level         INTEGER NOT NULL DEFAULT 0,
  skin_item_id  INTEGER REFERENCES item(id),
  quality       TEXT,
  note          TEXT,
  role          TEXT,
  slot          TEXT,
  extra         JSON,                           -- display-only поля (щит, бонус, тип контейнера)
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX owned_unique ON owned (character_id, item_id, level, COALESCE(skin_item_id, 0));
CREATE INDEX owned_kind ON owned (character_id, kind);

CREATE TABLE container_fill (
  container_owned_id INTEGER NOT NULL REFERENCES owned(id) ON DELETE CASCADE,
  slot               INTEGER NOT NULL,
  artifact_item_id   INTEGER NOT NULL REFERENCES item(id),
  level              INTEGER NOT NULL DEFAULT 0,
  quality            TEXT,
  as_of              TEXT NOT NULL,
  PRIMARY KEY (container_owned_id, slot)
);

CREATE TABLE build (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  slug               TEXT UNIQUE NOT NULL,
  title              TEXT NOT NULL,
  short              TEXT,
  tag                TEXT,
  goal               TEXT,
  container_item_id  INTEGER REFERENCES item(id),
  slots              INTEGER,
  eff                REAL,
  budget             INTEGER,
  total              INTEGER,
  metrics            JSON,
  verdict            TEXT,
  position           INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL
);

CREATE TABLE build_slot (
  build_id   INTEGER NOT NULL REFERENCES build(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  item_id    INTEGER REFERENCES item(id),
  label      TEXT,
  quality    TEXT,
  rank       TEXT,
  price      INTEGER,
  lots       INTEGER,
  eff        TEXT,
  bonus      TEXT,
  minus      TEXT,
  why        TEXT,
  PRIMARY KEY (build_id, position)
);

CREATE TABLE price_snapshot (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id        INTEGER REFERENCES item(id),
  exbo_id        TEXT,
  name           TEXT NOT NULL,
  name_norm      TEXT NOT NULL DEFAULT '',
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
);
CREATE INDEX price_lookup ON price_snapshot (name_norm, quality_norm, fetched_at DESC);
CREATE INDEX price_item ON price_snapshot (item_id, fetched_at DESC);

-- Свежий снапшот на каждую комбинацию имя+качество+бонус.
CREATE VIEW price_latest AS
  SELECT
    id, item_id, exbo_id, name, name_norm, quality, quality_norm, bonus,
    lot_price, lot_count, current_price, last_trade, lot_updated_at,
    source_id, fetched_at
  FROM (
    SELECT
      p.*,
      ROW_NUMBER() OVER (
        PARTITION BY p.name_norm, COALESCE(p.quality_norm, ''), COALESCE(p.bonus, 0)
        ORDER BY p.fetched_at DESC, p.id DESC
      ) AS rn
    FROM price_snapshot p
  )
  WHERE rn = 1;

CREATE TABLE content_block (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,                     -- recs | earnings | notes | builds_meta | catalog_meta
  slug       TEXT,
  title      TEXT,
  lead       TEXT,
  payload    JSON NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX content_block_unique ON content_block (kind, COALESCE(slug, ''));

CREATE TABLE icon (
  key        TEXT PRIMARY KEY,                  -- w:KS-1 | a:Куница | art:Изюм:15 | c:Бочонок
  path       TEXT NOT NULL,                     -- icons/<sha1>.webp (относительно apps/web/dist)
  mime       TEXT NOT NULL DEFAULT 'image/webp',
  source_id  TEXT REFERENCES source(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE app_meta (
  key        TEXT PRIMARY KEY,
  value      JSON NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE event_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  actor     TEXT NOT NULL,                      -- agent | user | sync
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  before    JSON,
  after     JSON,
  note      TEXT
);
CREATE INDEX event_log_at ON event_log (at DESC);
