-- Cutover from the collapsed owned_* model to inventory instances (spec §14).
-- Owner decision 2026-11-17: the project is not deployed, so the schema is rewritten in
-- place; backward compatibility is not required until the first deployment.
--
-- Rules:
--  - one inventory (8x8) and one stash (8x12) per character;
--  - an owned_item row expands into `qty` single instances (gear never collapses);
--  - role, slot and display_name are copied; a numeric quality ("120", "120%") also sets
--    rarity_pct, while the original string stays in quality;
--  - owned_container copies into container_data for every expanded instance;
--  - each container_slot becomes a NEW artifact instance (the old fill referenced a catalog
--    item, so matching it to an owned artifact would merge two separate things); the fill
--    attaches to the first copy of a qty > 1 container, and slots beyond the effective
--    capacity become loose;
--  - every migrated item starts loose so the owner can arrange it in the grid;
--  - old event_log rows stay untouched.

INSERT INTO storage
  (character_id, kind, name, name_norm, width, height, max_weight, sort_order, created_at, updated_at)
SELECT id, 'inventory', 'Inventory', 'inventory', 8, 8, NULL, 0,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM character;

-- name_norm mirrors norm() from packages/shared/src/format.ts. SQLite lower() folds ASCII
-- only, so the Cyrillic alphabet is folded explicitly; quotes are stripped and runs of
-- spaces collapse, as in norm().
INSERT INTO storage
  (character_id, kind, name, name_norm, width, height, max_weight, sort_order, created_at, updated_at)
SELECT character_id, 'stash', stash_name,
       trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(stash_name), 'А', 'а'), 'Б', 'б'), 'В', 'в'), 'Г', 'г'), 'Д', 'д'), 'Е', 'е'), 'Ж', 'ж'), 'З', 'з'), 'И', 'и'), 'Й', 'й'), 'К', 'к'), 'Л', 'л'), 'М', 'м'), 'Н', 'н'), 'О', 'о'), 'П', 'п'), 'Р', 'р'), 'С', 'с'), 'Т', 'т'), 'У', 'у'), 'Ф', 'ф'), 'Х', 'х'), 'Ц', 'ц'), 'Ч', 'ч'), 'Ш', 'ш'), 'Щ', 'щ'), 'Ъ', 'ъ'), 'Ы', 'ы'), 'Ь', 'ь'), 'Э', 'э'), 'Ю', 'ю'), 'Я', 'я'), 'Ё', 'ё'), '«',''), '»',''), '"',''), '''',''), '`',''), 'ё', 'е'), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')),
       8, 12, NULL, 0,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT c.id AS character_id,
         CASE WHEN trim(COALESCE(c.stash, '')) = '' THEN 'Stash' ELSE trim(c.stash) END AS stash_name
  FROM character c
);

-- Deterministic old-id + copy -> new instance id mapping, reused by every later insert.
CREATE TEMP TABLE _owned_map AS
WITH RECURSIVE nums(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM nums WHERE n < (SELECT COALESCE(MAX(qty), 1) FROM owned_item)
)
SELECT o.id AS old_id,
       n.n AS copy,
       (SELECT COALESCE(MAX(id), 0) FROM inventory_item)
         + ROW_NUMBER() OVER (ORDER BY o.id, n.n) AS new_id
FROM owned_item o
JOIN nums n ON n.n <= o.qty;

INSERT INTO inventory_item
  (id, character_id, item_id, kind, level, quality, rarity_pct, rarity_tier, skin_item_id,
   qty, note, display_name, role, slot, created_at, updated_at)
SELECT m.new_id, o.character_id, o.item_id, o.kind, o.level, o.quality,
       CASE
         WHEN trim(replace(o.quality, '%', '')) <> ''
          AND trim(replace(o.quality, '%', '')) NOT GLOB '*[^0-9.]*'
          AND CAST(trim(replace(o.quality, '%', '')) AS REAL) BETWEEN 0 AND 175
         THEN CAST(trim(replace(o.quality, '%', '')) AS REAL)
       END,
       NULL, o.skin_item_id, 1, o.note, o.display_name, o.role, o.slot, o.created_at, o.updated_at
FROM _owned_map m
JOIN owned_item o ON o.id = m.old_id;

INSERT INTO container_data (item_id, type, shield, bonus, protection, slots, eff, updated_at)
SELECT m.new_id, oc.container_type, oc.shield, oc.bonus, oc.protection,
       CASE WHEN oc.slots BETWEEN 0 AND 20 THEN oc.slots END,
       oc.eff, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM _owned_map m
JOIN owned_container oc ON oc.owned_id = m.old_id;

-- Fill rows are new instances, so the old fill keeps its own identity next to owned items.
CREATE TEMP TABLE _fill_map AS
SELECT cs.container_owned_id,
       cs.slot,
       (SELECT COALESCE(MAX(new_id), 0) FROM _owned_map)
         + ROW_NUMBER() OVER (ORDER BY cs.container_owned_id, cs.slot) AS new_id
FROM container_slot cs;

INSERT INTO inventory_item
  (id, character_id, item_id, kind, level, quality, rarity_pct, rarity_tier, skin_item_id,
   qty, note, display_name, role, slot, created_at, updated_at)
SELECT fm.new_id, o.character_id, cs.artifact_item_id, 'artifact', cs.level, cs.quality,
       CASE
         WHEN trim(replace(cs.quality, '%', '')) <> ''
          AND trim(replace(cs.quality, '%', '')) NOT GLOB '*[^0-9.]*'
          AND CAST(trim(replace(cs.quality, '%', '')) AS REAL) BETWEEN 0 AND 175
         THEN CAST(trim(replace(cs.quality, '%', '')) AS REAL)
       END,
       NULL, NULL, 1, NULL, NULL, NULL, NULL,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM _fill_map fm
JOIN container_slot cs ON cs.container_owned_id = fm.container_owned_id AND cs.slot = fm.slot
JOIN owned_item o ON o.id = cs.container_owned_id;

-- Everything starts loose; the grid arranges it later.
INSERT INTO item_placement (item_id, character_id, location, updated_at)
SELECT m.new_id, o.character_id, 'loose', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM _owned_map m
JOIN owned_item o ON o.id = m.old_id;

-- The fill attaches to the first copy of the container row. A slot beyond the effective
-- capacity (container_data.slots, otherwise the container.slots stat at the item level)
-- falls through to the loose insert below instead.
INSERT INTO item_placement
  (item_id, character_id, location, container_item_id, container_slot, updated_at)
SELECT fm.new_id, o.character_id, 'container', cm.new_id, cs.slot,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM _fill_map fm
JOIN container_slot cs ON cs.container_owned_id = fm.container_owned_id AND cs.slot = fm.slot
JOIN owned_item o ON o.id = cs.container_owned_id
JOIN _owned_map cm ON cm.old_id = cs.container_owned_id AND cm.copy = 1
LEFT JOIN owned_container oc ON oc.owned_id = cs.container_owned_id
WHERE cs.slot < COALESCE(
  CASE WHEN oc.slots BETWEEN 0 AND 20 THEN oc.slots END,
  (SELECT s.value_num FROM item_stat s
    WHERE s.item_id = o.item_id AND s.stat_id = 'container.slots' AND s.level = o.level
    ORDER BY s.is_additional LIMIT 1),
  1000000
);

INSERT INTO item_placement (item_id, character_id, location, updated_at)
SELECT fm.new_id, o.character_id, 'loose', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM _fill_map fm
JOIN container_slot cs ON cs.container_owned_id = fm.container_owned_id AND cs.slot = fm.slot
JOIN owned_item o ON o.id = cs.container_owned_id
LEFT JOIN owned_container oc ON oc.owned_id = cs.container_owned_id
WHERE cs.slot >= COALESCE(
  CASE WHEN oc.slots BETWEEN 0 AND 20 THEN oc.slots END,
  (SELECT s.value_num FROM item_stat s
    WHERE s.item_id = o.item_id AND s.stat_id = 'container.slots' AND s.level = o.level
    ORDER BY s.is_additional LIMIT 1),
  1000000
);

DROP TABLE container_slot;
DROP TABLE owned_container;
DROP TABLE owned_item;
DROP TABLE _fill_map;
DROP TABLE _owned_map;

ALTER TABLE character DROP COLUMN stash;
