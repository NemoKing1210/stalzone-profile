-- Calendar counters get one canonical form: registration is an ISO date in `value_text`,
-- playtime is hours in `value_num`. `PT<number>H` is the only duration shape the API ever
-- accepted; anything else cannot be reinterpreted without inventing a value.
UPDATE character_stat
SET value_num = CAST(substr(trim(value_text), 3, length(trim(value_text)) - 3) AS REAL),
    value_text = NULL
WHERE stat_id = 'pla-tim'
  AND value_text IS NOT NULL
  AND trim(value_text) LIKE 'PT%H';

UPDATE character_stat
SET value_text = NULL
WHERE stat_id = 'pla-tim' AND value_text IS NOT NULL;

DELETE FROM character_stat
WHERE stat_id = 'reg-tim'
  AND value_text IS NOT NULL
  AND value_text NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
