-- Owner decision 2026-11-20: the carried grid and every stash are eight cells wide, and a
-- stash is 8 x 200. Height 200 does not fit the previous CHECK (1..80), so the storage table
-- is rebuilt. Existing stashes are normalized; the read-only intake stays 40 x 80 because it
-- is not a stash and grows with its contents.

CREATE TABLE storage_new (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('inventory', 'stash', 'overflow')),
  name         TEXT NOT NULL,
  name_norm    TEXT NOT NULL,
  width        INTEGER NOT NULL CHECK (width BETWEEN 1 AND 40),
  height       INTEGER NOT NULL CHECK (height BETWEEN 1 AND 200),
  max_weight   REAL CHECK (max_weight IS NULL OR max_weight > 0),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
) STRICT;

INSERT INTO storage_new SELECT * FROM storage;
DROP TABLE storage;
ALTER TABLE storage_new RENAME TO storage;

CREATE UNIQUE INDEX storage_one_inventory ON storage (character_id) WHERE kind = 'inventory';
CREATE UNIQUE INDEX storage_one_overflow  ON storage (character_id) WHERE kind = 'overflow';
CREATE UNIQUE INDEX storage_name          ON storage (character_id, kind, name_norm);
CREATE INDEX storage_order                ON storage (character_id, sort_order, id);

UPDATE storage SET width = 8, height = 20  WHERE kind = 'inventory';
UPDATE storage SET width = 8, height = 200 WHERE kind = 'stash';
