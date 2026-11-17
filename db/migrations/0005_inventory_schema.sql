-- Additive inventory schema. The old owned_* tables stay until 0006 copies
-- their rows and drops them.
ALTER TABLE item ADD COLUMN name_key TEXT;
CREATE INDEX item_name_key ON item(name_key);

CREATE TABLE item_layout (
  item_id    INTEGER PRIMARY KEY REFERENCES item(id) ON DELETE CASCADE,
  width      INTEGER NOT NULL CHECK (width BETWEEN 1 AND 20),
  height     INTEGER NOT NULL CHECK (height BETWEEN 1 AND 20),
  weight     REAL CHECK (weight IS NULL OR weight >= 0),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE storage (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('inventory', 'stash')),
  name         TEXT NOT NULL,
  name_norm    TEXT NOT NULL,
  width        INTEGER NOT NULL CHECK (width BETWEEN 1 AND 40),
  height       INTEGER NOT NULL CHECK (height BETWEEN 1 AND 80),
  max_weight   REAL CHECK (max_weight IS NULL OR max_weight > 0),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX storage_one_inventory
  ON storage (character_id) WHERE kind = 'inventory';
CREATE UNIQUE INDEX storage_name
  ON storage (character_id, kind, name_norm);
CREATE INDEX storage_order ON storage (character_id, sort_order, id);

CREATE TABLE inventory_item (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES item(id),
  kind         TEXT NOT NULL CHECK (kind IN
                 ('weapon', 'armor', 'container', 'artifact', 'attachment', 'ammo', 'other')),
  level        INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 15),
  quality      TEXT,
  rarity_pct   REAL CHECK (rarity_pct IS NULL OR rarity_pct BETWEEN 0 AND 175),
  rarity_tier  TEXT CHECK (rarity_tier IS NULL OR rarity_tier IN
                 ('ordinary', 'unordinary', 'special', 'rare', 'exclusive', 'legendary', 'unique')),
  skin_item_id INTEGER REFERENCES item(id) ON DELETE SET NULL,
  qty          INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  note         TEXT,
  display_name TEXT,
  role         TEXT,
  slot         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (kind IN ('ammo', 'other') OR qty = 1)
) STRICT;
CREATE INDEX inventory_item_character ON inventory_item (character_id, kind);
CREATE INDEX inventory_item_item ON inventory_item (item_id);

CREATE TABLE item_placement (
  item_id          INTEGER PRIMARY KEY REFERENCES inventory_item(id) ON DELETE CASCADE,
  character_id     INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  location         TEXT NOT NULL CHECK (location IN
                     ('grid', 'equipment', 'container', 'weapon_module', 'loose')),
  storage_id       INTEGER REFERENCES storage(id) ON DELETE CASCADE,
  x                INTEGER,
  y                INTEGER,
  rotated          INTEGER NOT NULL DEFAULT 0 CHECK (rotated IN (0, 1)),
  equipment_slot   TEXT,
  container_item_id INTEGER REFERENCES inventory_item(id) ON DELETE CASCADE,
  container_slot   INTEGER,
  weapon_item_id   INTEGER REFERENCES inventory_item(id) ON DELETE CASCADE,
  module_slot      TEXT,
  verified         INTEGER NOT NULL DEFAULT 1 CHECK (verified IN (0, 1)),
  updated_at       TEXT NOT NULL,
  CHECK (
    (location = 'grid' AND storage_id IS NOT NULL AND x IS NOT NULL AND y IS NOT NULL
      AND equipment_slot IS NULL AND container_item_id IS NULL AND container_slot IS NULL
      AND weapon_item_id IS NULL AND module_slot IS NULL)
    OR (location = 'equipment' AND storage_id IS NULL AND equipment_slot IS NOT NULL
      AND x IS NULL AND y IS NULL AND container_item_id IS NULL AND container_slot IS NULL
      AND weapon_item_id IS NULL AND module_slot IS NULL)
    OR (location = 'container' AND storage_id IS NULL AND container_item_id IS NOT NULL
      AND container_slot IS NOT NULL AND x IS NULL AND y IS NULL AND equipment_slot IS NULL
      AND weapon_item_id IS NULL AND module_slot IS NULL)
    OR (location = 'weapon_module' AND storage_id IS NULL AND weapon_item_id IS NOT NULL
      AND module_slot IS NOT NULL AND x IS NULL AND y IS NULL AND equipment_slot IS NULL
      AND container_item_id IS NULL AND container_slot IS NULL)
    OR (location = 'loose' AND storage_id IS NULL AND x IS NULL AND y IS NULL
      AND equipment_slot IS NULL AND container_item_id IS NULL AND container_slot IS NULL
      AND weapon_item_id IS NULL AND module_slot IS NULL)
  )
) STRICT;
CREATE UNIQUE INDEX placement_grid_origin
  ON item_placement (storage_id, x, y) WHERE location = 'grid';
CREATE UNIQUE INDEX placement_equipment
  ON item_placement (character_id, equipment_slot) WHERE location = 'equipment';
CREATE UNIQUE INDEX placement_container_slot
  ON item_placement (container_item_id, container_slot) WHERE location = 'container';
CREATE UNIQUE INDEX placement_module_slot
  ON item_placement (weapon_item_id, module_slot) WHERE location = 'weapon_module';
CREATE INDEX placement_storage ON item_placement (storage_id, location);
CREATE INDEX placement_container ON item_placement (container_item_id);
CREATE INDEX placement_weapon ON item_placement (weapon_item_id);
CREATE INDEX placement_character ON item_placement (character_id, location);

CREATE TABLE container_data (
  item_id      INTEGER PRIMARY KEY REFERENCES inventory_item(id) ON DELETE CASCADE,
  type         TEXT,
  shield       REAL,
  bonus        TEXT,
  protection   REAL,
  slots        INTEGER CHECK (slots IS NULL OR slots BETWEEN 0 AND 20),
  eff          REAL,
  updated_at   TEXT NOT NULL
) STRICT;

CREATE TABLE attachment_compat (
  attachment_item_id INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  weapon_item_id     INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  source             TEXT NOT NULL CHECK (source IN ('exbo', 'manual')),
  updated_at         TEXT NOT NULL,
  PRIMARY KEY (attachment_item_id, weapon_item_id)
) STRICT;
CREATE INDEX attachment_compat_weapon ON attachment_compat (weapon_item_id);

CREATE TRIGGER placement_character_insert
BEFORE INSERT ON item_placement
WHEN NEW.character_id != (SELECT character_id FROM inventory_item WHERE id = NEW.item_id)
BEGIN SELECT RAISE(ABORT, 'placement character mismatch'); END;

CREATE TRIGGER placement_character_update
BEFORE UPDATE OF character_id, item_id ON item_placement
WHEN NEW.character_id != (SELECT character_id FROM inventory_item WHERE id = NEW.item_id)
BEGIN SELECT RAISE(ABORT, 'placement character mismatch'); END;
