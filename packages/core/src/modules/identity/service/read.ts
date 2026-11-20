import type { CharacterRead } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { getCharacter, listCharacterStats, type CharacterRow, type CharacterStat } from '../repo/characters.js';
import { deriveCharacterFields, effectiveCharacterStats } from './character-stats.js';

/** The contract character read: identity columns, derived fields and the effective stat map. */
export function getCharacterRead(db: Db, id?: number): CharacterRead | null {
  const character = getCharacter(db, id);
  if (!character) return null;
  return getCharacterReadFrom(character, listCharacterStats(db, character.id));
}

/** Same read from rows the caller already loaded (the payload reads them once). */
export function getCharacterReadFrom(character: CharacterRow, rows: CharacterStat[]): CharacterRead {
  const effective = effectiveCharacterStats(rows);
  const stats: Record<string, number | string> = {};
  for (const [statId, stat] of Object.entries(effective)) stats[statId] = stat.value;

  return {
    id: character.id,
    nick: character.nick,
    region: character.region,
    faction: character.faction,
    alliance: character.alliance,
    clanName: character.clan_name,
    clanRank: character.clan_rank,
    money: character.money,
    maxMoney: character.max_money,
    profileFetchedAt: character.profile_fetched_at,
    ...deriveCharacterFields(effective),
    stats,
  };
}
