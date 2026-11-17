-- The faction is no longer free text: STALZONE has four northern factions and
-- the dossier stores their slugs. Legacy free-text values cannot be mapped
-- reliably, so they become NULL ("no faction") instead of being guessed.
UPDATE character
SET faction = NULL
WHERE faction IS NOT NULL
  AND faction NOT IN ('rise', 'frontier', 'mercenaries', 'covenant');

-- Playstyle was a free-form note nobody used; it is removed from the dossier.
ALTER TABLE character DROP COLUMN playstyle;

CREATE TRIGGER character_faction_insert
BEFORE INSERT ON character
WHEN NEW.faction IS NOT NULL
  AND NEW.faction NOT IN ('rise', 'frontier', 'mercenaries', 'covenant')
BEGIN
  SELECT RAISE(ABORT, 'character.faction must be one of rise, frontier, mercenaries, covenant');
END;

CREATE TRIGGER character_faction_update
BEFORE UPDATE OF faction ON character
WHEN NEW.faction IS NOT NULL
  AND NEW.faction NOT IN ('rise', 'frontier', 'mercenaries', 'covenant')
BEGIN
  SELECT RAISE(ABORT, 'character.faction must be one of rise, frontier, mercenaries, covenant');
END;
