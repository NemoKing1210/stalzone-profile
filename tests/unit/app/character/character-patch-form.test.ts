import { describe, expect, it } from 'vitest';
import type { ProfileCharacter } from '~/shared/types/profile';
import { NO_FACTION } from '~/shared/lib/factions';
import {
  canSubmitCharacterForm,
  characterFormChanged,
  characterFormFrom,
  characterFormIssues,
  characterFormMessage,
  clampCounter,
  COUNTER_MAX,
  toCharacterPatch,
  type CharacterFormState,
} from '../../../../app/features/character/model/characterPatchForm';

const stored: ProfileCharacter = {
  nick: 'Lynx',
  region: 'eu',
  faction: 'rise',
  alliance: 'North',
  clanName: 'Wolves',
  clanRank: 'Captain',
  money: 125000,
  maxMoney: 900000,
  stats: { kil: 300, dea: 100, 'sho-fir': 1000, 'sho-hit': 250, 'sho-hea': 50, 'reg-tim': '2024-06-01' },
};

function form(overrides: Partial<CharacterFormState> = {}): CharacterFormState {
  return { ...characterFormFrom(stored), ...overrides };
}

describe('character patch form', () => {
  it('starts from the stored character and normalises an unknown faction to the sentinel', () => {
    const state = characterFormFrom(stored);
    expect(state.nick).toBe('Lynx');
    expect(state.region).toBe('eu');
    expect(state.faction).toBe('rise');
    expect(state.money).toBe(125000);
    expect(state.stats.kil).toBe(300);
    expect(state.stats['reg-tim']).toBe('2024-06-01');

    const unknown = characterFormFrom({ ...stored, faction: 'raiders' as never });
    expect(unknown.faction).toBe(NO_FACTION);
  });

  it('shows a stored numeric counter as a number, not as an empty stepper', () => {
    const state = characterFormFrom({ stats: { kil: '300' } });
    expect(state.stats.kil).toBe(300);
  });

  it('treats an all-empty form as invalid and unchanged', () => {
    const empty = characterFormFrom({});
    expect(characterFormChanged(empty, characterFormFrom({}))).toBe(false);
    expect(characterFormIssues(empty, characterFormFrom({}))).toContainEqual({ field: 'nick', code: 'required' });
    expect(toCharacterPatch(empty)).toMatchObject({
      nick: '',
      faction: null,
      alliance: null,
      clanName: null,
      money: null,
      stats: { kil: null, 'reg-tim': null },
    });
  });

  it('refuses an untouched form and calls it out as no change', () => {
    const state = form();
    expect(characterFormChanged(state, form())).toBe(false);
    expect(canSubmitCharacterForm(state, form())).toBe(false);
    expect(characterFormIssues(state, form())).toContainEqual({ field: '_form', code: 'noChanges' });
  });

  it('accepts a real change and builds the patch without the reka-ui sentinel', () => {
    const state = form({ nick: '  Lynx  ', faction: NO_FACTION, alliance: '  ' });
    expect(characterFormChanged(state, form())).toBe(true);
    expect(canSubmitCharacterForm(state, form())).toBe(true);

    const patch = toCharacterPatch(state);
    expect(patch.nick).toBe('Lynx');
    expect(patch.faction).toBeNull();
    expect(patch.alliance).toBeNull();
    expect(patch.clanName).toBe('Wolves');
  });

  it('reports field-level problems with localisable codes', () => {
    const blankNick = characterFormIssues(form({ nick: '   ' }), form());
    expect(blankNick).toContainEqual({ field: 'nick', code: 'required' });
    expect(characterFormMessage(blankNick[0]!)).toEqual({ key: 'forms.errors.required' });

    const negativeMoney = characterFormIssues(form({ money: -5 }), form());
    expect(negativeMoney).toContainEqual({ field: 'money', code: 'tooSmall', min: 0 });
    expect(characterFormMessage(negativeMoney[0]!)).toEqual({ key: 'forms.errors.tooSmall', params: { min: 0 } });

    const fractional = characterFormIssues(form({ money: 12.5 }), form());
    expect(fractional).toContainEqual({ field: 'money', code: 'notInteger' });

    const badCounter = characterFormIssues(form({ stats: { ...form().stats, kil: 'lots' } }), form());
    expect(badCounter).toContainEqual({ field: 'stats.kil', code: 'invalid' });

    expect(canSubmitCharacterForm(form({ money: -5 }), form())).toBe(false);
  });

  it('bounds the shot counters so the derived percentages stay at or below 100', () => {
    const overFired = form();
    overFired.stats['sho-fir'] = 100;
    overFired.stats['sho-hit'] = 150;
    const firedIssues = characterFormIssues(overFired, form());
    expect(firedIssues).toContainEqual({ field: 'stats.sho-hit', code: 'tooBig', max: 100 });
    expect(characterFormMessage(firedIssues[0]!)).toEqual({ key: 'forms.errors.tooBig', params: { max: 100 } });

    const overHit = form();
    overHit.stats['sho-hit'] = 100;
    overHit.stats['sho-hea'] = 120;
    expect(characterFormIssues(overHit, form())).toContainEqual({
      field: 'stats.sho-hea',
      code: 'tooBig',
      max: 100,
    });
  });

  it('keeps non-numeric counters as trimmed text and rejects over-long text', () => {
    const state = form({ stats: { ...form().stats, 'pla-tim': '  PT123H  ', 'reg-tim': ' 2024-06-01 ' } });
    const patch = toCharacterPatch(state);
    expect(patch.stats?.['pla-tim']).toBe('PT123H');
    expect(patch.stats?.['reg-tim']).toBe('2024-06-01');

    const tooLong = form({ stats: { ...form().stats, 'pla-tim': 'x'.repeat(501) } });
    expect(characterFormIssues(tooLong, form())).toContainEqual({
      field: 'stats.pla-tim',
      code: 'tooLong',
      max: 500,
    });
  });

  it('clamps stepper input to a non-negative whole number inside the guard band', () => {
    expect(clampCounter(-5)).toBe(0);
    expect(clampCounter(12.9)).toBe(12);
    expect(clampCounter(COUNTER_MAX + 1)).toBe(COUNTER_MAX);
    expect(clampCounter(undefined)).toBeNull();
    expect(clampCounter(Number.NaN)).toBeNull();
  });
});
