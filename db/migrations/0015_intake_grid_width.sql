-- The intake stash joins the carried grid and every stash at eight cells wide. The row's
-- height stays 80 (it grows with its contents in the read model); existing placements are
-- repacked into one column so no origin sits past column 7 and the unique grid origin holds.
UPDATE storage SET width = 8 WHERE kind = 'overflow';

-- Replace the intake placements through a temp copy: an in-place UPDATE collides with the
-- old unique origins while rows are being moved, so the index is dropped and rebuilt around
-- the replacement.
DROP INDEX IF EXISTS placement_grid_origin;

CREATE TEMP TABLE intake_repack AS
WITH sized AS (
  SELECT p.item_id, p.character_id, p.storage_id, p.updated_at, p.x AS old_x, p.y AS old_y,
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
  WHERE p.location = 'grid'
    AND p.storage_id IN (SELECT id FROM storage WHERE kind = 'overflow')
), packed AS (
  SELECT item_id, character_id, storage_id, updated_at,
         SUM(h) OVER (ORDER BY old_y, old_x, item_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS top
  FROM sized
)
SELECT item_id, character_id, storage_id, updated_at, COALESCE(top, 0) AS new_y FROM packed;

DELETE FROM item_placement
WHERE location = 'grid'
  AND storage_id IN (SELECT id FROM storage WHERE kind = 'overflow');

INSERT INTO item_placement
  (item_id, character_id, location, storage_id, x, y, rotated,
   equipment_slot, container_item_id, container_slot, weapon_item_id, module_slot, verified, updated_at)
SELECT item_id, character_id, 'grid', storage_id, 0, new_y, 0,
       NULL, NULL, NULL, NULL, NULL, 1, updated_at
FROM intake_repack;

DROP TABLE intake_repack;
