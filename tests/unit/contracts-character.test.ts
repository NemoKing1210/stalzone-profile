import { describe, expect, it } from 'vitest';
import {
  CharacterCreateSchema,
  CharacterPatchSchema,
  CharacterReadSchema,
  FactionSchema,
  FACTIONS,
} from '@dossier/shared/contracts';

describe('character faction contract', () => {
  it('accepts exactly the four playable STALZONE factions', () => {
    expect(FACTIONS).toEqual(['rise', 'frontier', 'mercenaries', 'covenant']);
    expect(FactionSchema.options).toEqual([...FACTIONS]);
    for (const faction of FACTIONS) {
      expect(CharacterCreateSchema.parse({ nick: 'T', region: 'ru', faction }).faction).toBe(faction);
    }
  });

  it('rejects starting sides, legacy names and free text', () => {
    for (const faction of ['stalkers', 'bandits', 'Сталкеры', 'Заря', 'whisper', 'rise ']) {
      expect(CharacterCreateSchema.safeParse({ nick: 'T', region: 'ru', faction }).success).toBe(false);
      expect(CharacterPatchSchema.safeParse({ faction, dryRun: false }).success).toBe(false);
    }
  });

  it('keeps the faction optional', () => {
    expect(CharacterCreateSchema.parse({ nick: 'T', region: 'ru' }).faction).toBeUndefined();
    expect(CharacterCreateSchema.parse({ nick: 'T', region: 'ru', faction: null }).faction).toBeNull();
    expect(CharacterPatchSchema.parse({ faction: null, dryRun: false }).faction).toBeNull();
  });

  it('no longer carries playstyle', () => {
    expect(CharacterCreateSchema.parse({ nick: 'T', region: 'ru', playstyle: 'sniper' })).not.toHaveProperty(
      'playstyle',
    );
    expect(CharacterPatchSchema.parse({ nick: 'T', playstyle: 'sniper' })).not.toHaveProperty('playstyle');
    expect(CharacterReadSchema.shape).not.toHaveProperty('playstyle');
  });
});
