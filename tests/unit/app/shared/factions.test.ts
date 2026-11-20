import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '@profile/shared/contracts';
import {
  FACTION_EMBLEMS,
  factionEmblem,
  factionOptions,
  factionSelectItems,
  factionLabel,
  factionValue,
  NO_FACTION,
} from '~/shared/lib/factions';

const appRoot = path.join(process.cwd(), 'app');
const read = (file: string): string => fs.readFileSync(path.join(appRoot, file), 'utf8');

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

describe('faction emblems', () => {
  it('maps every faction to a shipped local image and the localised name key', () => {
    for (const faction of FACTIONS) {
      const emblem = factionEmblem(faction);
      expect(emblem).toEqual({ slug: faction, src: `/factions/${faction}.png`, altKey: `factions.${faction}` });
      expect(FACTION_EMBLEMS[faction]).toBe(`/factions/${faction}.png`);
      const file = path.join(process.cwd(), 'public', FACTION_EMBLEMS[faction]);
      expect(fs.statSync(file).size).toBeGreaterThan(0);
    }
  });

  it('falls back to the text label when the slug is unknown or absent', () => {
    expect(factionEmblem('raiders')).toBeNull();
    expect(factionEmblem('')).toBeNull();
    expect(factionEmblem(null)).toBeNull();
    expect(factionEmblem(undefined)).toBeNull();
    expect(factionLabel(t, 'raiders')).toBe('raiders');
  });

  it('carries an emblem on the select items without giving the sentinel one', () => {
    const items = factionSelectItems(t);
    expect(items[0]).toEqual({ label: 'forms.factionNone', value: NO_FACTION });
    for (const faction of FACTIONS) {
      expect(items.find((item) => item.value === faction)?.emblem).toBe(`/factions/${faction}.png`);
    }
  });

  it('never fetches an emblem from a third-party host at runtime', () => {
    for (const src of Object.values(FACTION_EMBLEMS)) expect(src.startsWith('/factions/')).toBe(true);
    for (const file of [
      'features/character/ui/OverviewPage.vue',
      'features/character/ui/EditCharacterModal.vue',
      'features/onboarding/ui/SetupPage.vue',
    ]) {
      expect(read(file)).not.toMatch(/https?:\/\//);
    }
  });
});
