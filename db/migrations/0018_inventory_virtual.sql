-- A virtual instance is not owned in game but stays a full instance: it keeps its grid
-- footprint, contributes weight and loadout stats, and is the build preview. The badge is
-- the ownership signal; nothing else about the row changes.
ALTER TABLE inventory_item
  ADD COLUMN is_virtual INTEGER NOT NULL DEFAULT 0 CHECK (is_virtual IN (0, 1));
