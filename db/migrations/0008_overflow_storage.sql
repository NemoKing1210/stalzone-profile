-- Owner decision 2026-11-18: the project is not deployed, and the intake stash is a real
-- storage. A forward migration keeps the local profile; no reset required.

CREATE TABLE storage_new (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('inventory', 'stash', 'overflow')),
  name         TEXT NOT NULL,
  name_norm    TEXT NOT NULL,
  width        INTEGER NOT NULL CHECK (width BETWEEN 1 AND 40),
  height       INTEGER NOT NULL CHECK (height BETWEEN 1 AND 80),
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

UPDATE storage SET width = 8,  height = 20 WHERE kind = 'inventory';
-- 8 × 12 was the setup default, 8 × 10 the old storage manager default; custom sizes stay.
UPDATE storage SET width = 40, height = 80
WHERE kind = 'stash' AND width = 8 AND height IN (10, 12);

INSERT INTO storage
  (character_id, kind, name, name_norm, width, height, max_weight, sort_order, created_at, updated_at)
SELECT id, 'overflow', 'Intake', 'intake', 40, 80, NULL, 0,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM character;

-- One deterministic column: x = 0, y = cumulative item height (layout override or the
-- same defaults as `defaultSize`). Distinct y values satisfy placement_grid_origin.
-- Loose items move here; so do inventory grid items outside the new 8 × 20, which an
-- older build could leave behind after the inventory was resized.
WITH sized AS (
  SELECT p.item_id, ii.character_id, p.location, p.x, p.y, p.rotated,
         COALESCE(l.width,
           CASE
             WHEN ii.kind = 'weapon' THEN CASE i.category
               WHEN 'weapon/assault_rifle' THEN 5
               WHEN 'weapon/machine_gun' THEN 6
               WHEN 'weapon/sniper_rifle' THEN 6
               WHEN 'weapon/shotgun_rifle' THEN 5
               WHEN 'weapon/submachine_gun' THEN 4
               WHEN 'weapon/pistol' THEN 2
               WHEN 'weapon/melee' THEN 2
               WHEN 'weapon/heavy' THEN 7
               WHEN 'weapon/device' THEN 2
               ELSE 4
             END
             WHEN ii.kind IN ('armor', 'container') THEN 3
             ELSE 1
           END) AS w,
         COALESCE(l.height,
           CASE
             WHEN ii.kind = 'weapon' THEN CASE i.category WHEN 'weapon/heavy' THEN 3 ELSE 2 END
             WHEN ii.kind IN ('armor', 'container') THEN 3
             ELSE 1
           END) AS h
  FROM item_placement p
  JOIN inventory_item ii ON ii.id = p.item_id
  JOIN item i ON i.id = ii.item_id
  LEFT JOIN item_layout l ON l.item_id = ii.item_id
  WHERE p.location = 'loose'
     OR (p.location = 'grid'
         AND p.storage_id IN (SELECT id FROM storage WHERE kind = 'inventory'))
), moving AS (
  SELECT item_id, character_id, CASE WHEN rotated = 1 THEN w ELSE h END AS height
  FROM sized
  WHERE location = 'loose'
     OR x IS NULL OR y IS NULL
     OR x + CASE WHEN rotated = 1 THEN h ELSE w END > 8
     OR y + CASE WHEN rotated = 1 THEN w ELSE h END > 20
), ordered AS (
  SELECT item_id, character_id,
         COALESCE(SUM(height) OVER (
           PARTITION BY character_id ORDER BY item_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS y
  FROM moving
)
UPDATE item_placement
SET location = 'grid',
    storage_id = (SELECT s.id FROM storage s
                  WHERE s.character_id = ordered.character_id AND s.kind = 'overflow'),
    x = 0,
    y = ordered.y,
    rotated = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM ordered
WHERE item_placement.item_id = ordered.item_id;
