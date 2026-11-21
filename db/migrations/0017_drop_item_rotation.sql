-- Rotation is gone: the original game has no turning, so a manual `R`, a rotated drag
-- preview and a rotated auto-placement no longer exist. A legacy rotated row is parked in
-- its character's intake as an upright single-column row after the existing unrotated intake
-- rows; unrotated rows keep their cells and no reset is required. The column is dropped last.

DROP INDEX IF EXISTS placement_grid_origin;

CREATE TEMP TABLE rotation_repack AS
WITH sized AS (
  SELECT p.item_id, p.character_id, s.id AS intake_id, p.updated_at,
         p.storage_id AS old_storage, p.x AS old_x, p.y AS old_y,
         COALESCE(l.height,
           CASE
             WHEN ii.kind = 'weapon' THEN CASE i.category WHEN 'weapon/heavy' THEN 3 ELSE 2 END
             WHEN ii.kind IN ('armor', 'container') THEN 3
             ELSE 1
           END) AS h
  FROM item_placement p
  JOIN inventory_item ii ON ii.id = p.item_id
  JOIN item i ON i.id = ii.item_id
  JOIN storage s ON s.character_id = p.character_id AND s.kind = 'overflow'
  LEFT JOIN item_layout l ON l.item_id = ii.item_id
  WHERE p.location = 'grid' AND p.rotated = 1
), bases AS (
  SELECT p.character_id,
         COALESCE(MAX(p.y + COALESCE(l.height,
           CASE
             WHEN ii.kind = 'weapon' THEN CASE i.category WHEN 'weapon/heavy' THEN 3 ELSE 2 END
             WHEN ii.kind IN ('armor', 'container') THEN 3
             ELSE 1
           END)), 0) AS top
  FROM item_placement p
  JOIN inventory_item ii ON ii.id = p.item_id
  JOIN item i ON i.id = ii.item_id
  LEFT JOIN item_layout l ON l.item_id = ii.item_id
  WHERE p.location = 'grid'
    AND p.rotated = 0
    AND p.storage_id IN (SELECT id FROM storage WHERE kind = 'overflow')
  GROUP BY p.character_id
), packed AS (
  SELECT s.item_id, s.character_id, s.intake_id, s.updated_at,
         COALESCE(b.top, 0) + COALESCE(SUM(s.h) OVER (
           PARTITION BY s.character_id
           ORDER BY s.old_storage, s.old_y, s.old_x, s.item_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS new_y
  FROM sized s
  LEFT JOIN bases b ON b.character_id = s.character_id
)
SELECT item_id, character_id, intake_id, updated_at, new_y FROM packed;

DELETE FROM item_placement WHERE location = 'grid' AND rotated = 1;

INSERT INTO item_placement
  (item_id, character_id, location, storage_id, x, y,
   equipment_slot, container_item_id, container_slot, weapon_item_id, module_slot, verified, updated_at)
SELECT item_id, character_id, 'grid', intake_id, 0, new_y,
       NULL, NULL, NULL, NULL, NULL, 1, updated_at
FROM rotation_repack;

DROP TABLE rotation_repack;

CREATE UNIQUE INDEX placement_grid_origin
  ON item_placement (storage_id, x, y) WHERE location = 'grid';

ALTER TABLE item_placement DROP COLUMN rotated;
