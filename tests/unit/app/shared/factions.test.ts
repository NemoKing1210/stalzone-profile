import { describe, expect, it } from 'vitest';
import { FACTIONS } from '@profile/shared/contracts';
import { factionOptions, factionSelectItems, factionValue, NO_FACTION } from '~/shared/lib/factions';

const t = (key: string): string => key;

describe('faction select items', () => {
  it('never hands reka-ui an empty string value', () => {
    for (const item of factionSelectItems(t)) {
      expect(typeof item.value).toBe('string');
      expect(item.value).not.toBe('');
    }
  });

  it('offers "no faction" plus the four factions', () => {
    const items = factionSelectItems(t);
    expect(items.map((item) => item.value)).toEqual([NO_FACTION, ...FACTIONS]);
    expect(factionOptions(t).map((item) => item.label)).toEqual(FACTIONS.map((faction) => `factions.${faction}`));
  });

  it('maps the sentinel back to null for the API', () => {
    expect(factionValue(NO_FACTION)).toBeNull();
    expect(factionValue(null)).toBeNull();
    expect(factionValue(undefined)).toBeNull();
    for (const faction of FACTIONS) expect(factionValue(faction)).toBe(faction);
  });
});
