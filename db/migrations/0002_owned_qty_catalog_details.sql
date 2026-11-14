-- 0002 — копии owned, каталог и карточки деталей.
-- Каталог и details вынесены из item.raw: легаси-дубли и точные ключи важны для паритета.

ALTER TABLE owned ADD COLUMN qty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE owned ADD COLUMN display_name TEXT;

DROP INDEX IF EXISTS owned_unique;
CREATE UNIQUE INDEX owned_unique
  ON owned (character_id, item_id, level, COALESCE(quality, ''), COALESCE(skin_item_id, 0));

CREATE TABLE catalog_entry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,                 -- weapon | armor
  position    INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  name_norm   TEXT NOT NULL DEFAULT '',
  data        JSON NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX catalog_entry_unique ON catalog_entry (kind, position);
CREATE INDEX catalog_entry_kind ON catalog_entry (kind, position);

CREATE TABLE details_card (
  key         TEXT PRIMARY KEY,              -- w: | a: | art: | c: + исходное имя
  item_id     INTEGER REFERENCES item(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  data        JSON NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX details_card_item ON details_card (item_id);
CREATE INDEX details_card_kind ON details_card (kind);
