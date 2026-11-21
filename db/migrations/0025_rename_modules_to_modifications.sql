-- The weapon gear concept is renamed from module/attachment to modification across the
-- schema, stored values, API, MCP and the audited rollback snapshots. Owner decision
-- 2026-11-21; the project is not deployed, so the public contract changes in one cutover
-- and no compatibility shim is kept. The migration is forward-only: rolling the code back
-- after it has run needs a matching reverse migration, not a reset.
--
-- The EXBO category strings stay source data (`attachment/scope`, ...); only the item kind
-- becomes `modification`. The assistant's chat attachments are a different concept and are
-- not touched.

/* ------------------------------- item ------------------------------- */

-- The placement triggers reference inventory_item; drop them before the rebuild and
-- recreate them on the new item_placement below.
DROP TRIGGER IF EXISTS placement_character_insert;
DROP TRIGGER IF EXISTS placement_character_update;

CREATE TABLE item_new (
  id           INTEGER PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES source(id),
  realm        TEXT NOT NULL DEFAULT 'ru',
  external_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  name_norm    TEXT NOT NULL,
  name_en      TEXT,
  name_en_norm TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL CHECK (kind IN ('weapon', 'armor', 'container', 'artifact', 'modification', 'ammo', 'motif', 'other')),
  category     TEXT,
  rank         TEXT,
  slot         TEXT,
  weight       REAL,
  is_cosmetic  INTEGER NOT NULL DEFAULT 0 CHECK (is_cosmetic IN (0, 1)),
  base_item_id INTEGER REFERENCES item(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  name_key     TEXT,
  UNIQUE (realm, external_id)
) STRICT;

INSERT INTO item_new
  (id, source_id, realm, external_id, name, name_norm, name_en, name_en_norm, kind, category,
   rank, slot, weight, is_cosmetic, base_item_id, created_at, updated_at, name_key)
SELECT id, source_id, realm, external_id, name, name_norm, name_en, name_en_norm,
       CASE WHEN kind = 'attachment' THEN 'modification' ELSE kind END,
       category, rank, slot, weight, is_cosmetic, base_item_id, created_at, updated_at, name_key
FROM item;

DROP TABLE item;
ALTER TABLE item_new RENAME TO item;
CREATE INDEX item_name ON item(name);
CREATE INDEX item_name_norm ON item(name_norm);
CREATE INDEX item_kind ON item(kind, category);
CREATE INDEX item_base ON item(base_item_id);
CREATE INDEX item_name_key ON item(name_key);

/* --------------------------- inventory_item -------------------------- */

CREATE TABLE inventory_item_new (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES item(id),
  kind         TEXT NOT NULL CHECK (kind IN
                 ('weapon', 'armor', 'container', 'artifact', 'modification', 'ammo', 'other')),
  level        INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 15),
  quality      TEXT,
  rarity_pct   REAL CHECK (rarity_pct IS NULL OR rarity_pct BETWEEN 0 AND 175),
  rarity_tier  TEXT CHECK (rarity_tier IS NULL OR rarity_tier IN
                 ('ordinary', 'unordinary', 'special', 'rare', 'exclusive', 'legendary', 'unique')),
  skin_item_id INTEGER REFERENCES item(id) ON DELETE SET NULL,
  qty          INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  display_name TEXT,
  slot         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  is_virtual   INTEGER NOT NULL DEFAULT 0 CHECK (is_virtual IN (0, 1)),
  CHECK (kind IN ('ammo', 'other') OR qty = 1)
) STRICT;

INSERT INTO inventory_item_new
  (id, character_id, item_id, kind, level, quality, rarity_pct, rarity_tier, skin_item_id, qty,
   display_name, slot, created_at, updated_at, is_virtual)
SELECT id, character_id, item_id,
       CASE WHEN kind = 'attachment' THEN 'modification' ELSE kind END,
       level, quality, rarity_pct, rarity_tier, skin_item_id, qty, display_name, slot,
       created_at, updated_at, is_virtual
FROM inventory_item;

DROP TABLE inventory_item;
ALTER TABLE inventory_item_new RENAME TO inventory_item;
CREATE INDEX inventory_item_character ON inventory_item (character_id, kind);
CREATE INDEX inventory_item_item ON inventory_item (item_id);

/* --------------------------- item_placement -------------------------- */

CREATE TABLE item_placement_new (
  item_id             INTEGER PRIMARY KEY REFERENCES inventory_item(id) ON DELETE CASCADE,
  character_id        INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  location            TEXT NOT NULL CHECK (location IN
                        ('grid', 'equipment', 'container', 'weapon_modification', 'loose')),
  storage_id          INTEGER REFERENCES storage(id) ON DELETE CASCADE,
  x                   INTEGER,
  y                   INTEGER,
  equipment_slot      TEXT,
  container_item_id   INTEGER REFERENCES inventory_item(id) ON DELETE CASCADE,
  container_slot      INTEGER,
  weapon_item_id      INTEGER REFERENCES inventory_item(id) ON DELETE CASCADE,
  modification_slot   TEXT,
  verified            INTEGER NOT NULL DEFAULT 1 CHECK (verified IN (0, 1)),
  updated_at          TEXT NOT NULL,
  CHECK (
    (location = 'grid' AND storage_id IS NOT NULL AND x IS NOT NULL AND y IS NOT NULL
      AND equipment_slot IS NULL AND container_item_id IS NULL AND container_slot IS NULL
      AND weapon_item_id IS NULL AND modification_slot IS NULL)
    OR (location = 'equipment' AND storage_id IS NULL AND equipment_slot IS NOT NULL
      AND x IS NULL AND y IS NULL AND container_item_id IS NULL AND container_slot IS NULL
      AND weapon_item_id IS NULL AND modification_slot IS NULL)
    OR (location = 'container' AND storage_id IS NULL AND container_item_id IS NOT NULL
      AND container_slot IS NOT NULL AND x IS NULL AND y IS NULL AND equipment_slot IS NULL
      AND weapon_item_id IS NULL AND modification_slot IS NULL)
    OR (location = 'weapon_modification' AND storage_id IS NULL AND weapon_item_id IS NOT NULL
      AND modification_slot IS NOT NULL AND x IS NULL AND y IS NULL AND equipment_slot IS NULL
      AND container_item_id IS NULL AND container_slot IS NULL)
    OR (location = 'loose' AND storage_id IS NULL AND x IS NULL AND y IS NULL
      AND equipment_slot IS NULL AND container_item_id IS NULL AND container_slot IS NULL
      AND weapon_item_id IS NULL AND modification_slot IS NULL)
  )
) STRICT;

INSERT INTO item_placement_new
  (item_id, character_id, location, storage_id, x, y, equipment_slot, container_item_id,
   container_slot, weapon_item_id, modification_slot, verified, updated_at)
SELECT item_id, character_id,
       CASE WHEN location = 'weapon_module' THEN 'weapon_modification' ELSE location END,
       storage_id, x, y, equipment_slot, container_item_id, container_slot, weapon_item_id,
       module_slot, verified, updated_at
FROM item_placement;

DROP TABLE item_placement;
ALTER TABLE item_placement_new RENAME TO item_placement;

CREATE UNIQUE INDEX placement_grid_origin
  ON item_placement (storage_id, x, y) WHERE location = 'grid';
CREATE UNIQUE INDEX placement_equipment
  ON item_placement (character_id, equipment_slot) WHERE location = 'equipment';
CREATE UNIQUE INDEX placement_container_slot
  ON item_placement (container_item_id, container_slot) WHERE location = 'container';
CREATE UNIQUE INDEX placement_modification_slot
  ON item_placement (weapon_item_id, modification_slot) WHERE location = 'weapon_modification';
CREATE INDEX placement_storage ON item_placement (storage_id, location);
CREATE INDEX placement_container ON item_placement (container_item_id);
CREATE INDEX placement_weapon ON item_placement (weapon_item_id);
CREATE INDEX placement_character ON item_placement (character_id, location);

CREATE TRIGGER placement_character_insert
BEFORE INSERT ON item_placement
WHEN NEW.character_id != (SELECT character_id FROM inventory_item WHERE id = NEW.item_id)
BEGIN SELECT RAISE(ABORT, 'placement character mismatch'); END;

CREATE TRIGGER placement_character_update
BEFORE UPDATE OF character_id, item_id ON item_placement
WHEN NEW.character_id != (SELECT character_id FROM inventory_item WHERE id = NEW.item_id)
BEGIN SELECT RAISE(ABORT, 'placement character mismatch'); END;

/* ------------------------- compatibility pairs ------------------------ */

ALTER TABLE attachment_compat RENAME TO modification_compat;
ALTER TABLE modification_compat RENAME COLUMN attachment_item_id TO modification_item_id;
DROP INDEX IF EXISTS attachment_compat_weapon;
CREATE INDEX modification_compat_weapon ON modification_compat (weapon_item_id);

/* --------------------------- audit journal --------------------------- */

-- `event_log.before`/`after` are the rollback contract, so existing snapshots move to the
-- new keys and values in the same cutover. Only exact JSON tokens are replaced; item names
-- and free text are untouched.
UPDATE event_log
SET action = 'inventory.item.modification'
WHERE action = 'inventory.item.module';

UPDATE event_log
SET before = replace(replace(replace(replace(replace(replace(before,
      '"moduleSlot":', '"modificationSlot":'),
      '"modules":', '"modifications":'),
      '"attachmentItemId":', '"modificationItemId":'),
      '"attachment":', '"modification":'),
      '"weapon_module"', '"weapon_modification"'),
      '"kind":"attachment"', '"kind":"modification"'),
    after = replace(replace(replace(replace(replace(replace(after,
      '"moduleSlot":', '"modificationSlot":'),
      '"modules":', '"modifications":'),
      '"attachmentItemId":', '"modificationItemId":'),
      '"attachment":', '"modification":'),
      '"weapon_module"', '"weapon_modification"'),
      '"kind":"attachment"', '"kind":"modification"')
WHERE before GLOB '*"moduleSlot":*' OR before GLOB '*"modules":*'
   OR before GLOB '*"attachmentItemId":*' OR before GLOB '*"attachment":*'
   OR before GLOB '*"weapon_module"*' OR before GLOB '*"kind":"attachment"*'
   OR after GLOB '*"moduleSlot":*' OR after GLOB '*"modules":*'
   OR after GLOB '*"attachmentItemId":*' OR after GLOB '*"attachment":*'
   OR after GLOB '*"weapon_module"*' OR after GLOB '*"kind":"attachment"*';

/* ----------------------------- assistant prompt ----------------------- */

-- The seeded skill text is updated only while it is still the untouched v1 body; an
-- owner-edited prompt keeps its wording.
UPDATE chat_prompt
SET body = 'When the owner asks about gear, use the inventory tools. Each instance is separate: weapons, armor, containers, artifacts and modifications never merge; only ammo and other stack. The carried grid is 8x20, a stash 8x200. Report an item by name, level, rank and location.'
WHERE kind = 'skill'
  AND name = 'inventory'
  AND body = 'When the owner asks about gear, use the inventory tools. Each instance is separate: weapons, armor, containers, artifacts and attachments never merge; only ammo and other stack. The carried grid is 8x20, a stash 8x200. Report an item by name, level, rank and location.';
