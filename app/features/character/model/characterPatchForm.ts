import { CharacterPatchSchema, type CharacterPatch } from '@profile/shared/contracts';
import { factionEmblem, factionValue, NO_FACTION, type FactionChoice } from '~/shared/lib/factions';
import type { ProfileCharacter } from '~/shared/types/profile';

import {
  isNumericStatField,
  STAT_FIELDS,
  toCharacterStatsPatch,
  type StatField,
} from './characterStatsForm';

export const CHARACTER_REGIONS = ['ru', 'eu', 'na', 'sea', 'global'] as const;
export type CharacterRegion = (typeof CHARACTER_REGIONS)[number];

/** The contract stores plain numbers; the stepper stops at the largest exactly representable integer. */
export const COUNTER_MAX = Number.MAX_SAFE_INTEGER;

/** Maximum length the write contract allows for the free-text profile fields. */
export const TEXT_MAX = 100;

export interface CharacterFormState {
  nick: string;
  region: CharacterRegion;
  /** The form keeps the reka-ui sentinel; the patch turns it into `null`. */
  faction: FactionChoice;
  alliance: string;
  clanName: string;
  clanRank: string;
  money: number | null;
  maxMoney: number | null;
  stats: Record<StatField, string | number | null>;
  /** UI-only: a dry run is not part of the patch and never counts as a change. */
  dryRun: boolean;
}

export type CharacterFormField = Exclude<keyof CharacterFormState, 'stats'> | `stats.${StatField}` | '_form';

export type CharacterFormErrorCode =
  | 'required'
  | 'tooLong'
  | 'tooSmall'
  | 'tooBig'
  | 'notInteger'
  | 'invalid'
  | 'noChanges';

export interface CharacterFormIssue {
  field: CharacterFormField;
  code: CharacterFormErrorCode;
  min?: number;
  max?: number;
}

export interface CharacterFormMessage {
  key: string;
  params?: Record<string, number>;
}

function emptyStats(): Record<StatField, string | number | null> {
  return Object.fromEntries(STAT_FIELDS.map((field) => [field, null])) as Record<StatField, string | number | null>;
}

/** Starts the editor from the stored character; an absent character leaves every field empty. */
export function characterFormFrom(character: Partial<ProfileCharacter> | null | undefined): CharacterFormState {
  const stats = emptyStats();
  for (const field of STAT_FIELDS) {
    const value = character?.stats?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      stats[field] = value;
      continue;
    }
    if (typeof value !== 'string') {
      stats[field] = null;
      continue;
    }
    const numeric = isNumericStatField(field) ? Number(value) : Number.NaN;
    stats[field] = value.trim() !== '' && Number.isFinite(numeric) ? numeric : value;
  }
  const region = character?.region;
  const storedFaction = character?.faction;
  const money = character?.money;
  const maxMoney = character?.maxMoney;
  return {
    nick: character?.nick ?? '',
    region:
      typeof region === 'string' && (CHARACTER_REGIONS as readonly string[]).includes(region)
        ? (region as CharacterRegion)
        : 'ru',
    faction: factionEmblem(typeof storedFaction === 'string' ? storedFaction : null)?.slug ?? NO_FACTION,
    alliance: character?.alliance ?? '',
    clanName: character?.clanName ?? '',
    clanRank: character?.clanRank ?? '',
    money: typeof money === 'number' && Number.isFinite(money) ? money : null,
    maxMoney: typeof maxMoney === 'number' && Number.isFinite(maxMoney) ? maxMoney : null,
    stats,
    dryRun: false,
  };
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Builds the PATCH body from the form. Free text is trimmed here (not on every
 * keystroke), empty text becomes `null`, and the faction sentinel becomes `null`.
 * The values are deliberately not clamped: a value outside the contract has to
 * fail validation, not be silently adjusted under the owner's hands.
 */
export function toCharacterPatch(state: CharacterFormState): Omit<CharacterPatch, 'dryRun'> {
  const stats: Record<StatField, string | number | null> = emptyStats();
  for (const field of STAT_FIELDS) {
    const raw = state.stats[field];
    stats[field] = typeof raw === 'string' ? trimmedOrNull(raw) : raw;
  }
  return {
    nick: state.nick.trim(),
    region: state.region,
    faction: factionValue(state.faction),
    alliance: trimmedOrNull(state.alliance),
    clanName: trimmedOrNull(state.clanName),
    clanRank: trimmedOrNull(state.clanRank),
    money: state.money,
    maxMoney: state.maxMoney,
    stats: toCharacterStatsPatch(stats),
  };
}

/** True once the form differs from the snapshot it was opened with. */
export function characterFormChanged(state: CharacterFormState, baseline: CharacterFormState): boolean {
  // The patch builder emits a fixed key order, so the serialisation is stable.
  return JSON.stringify(toCharacterPatch(state)) !== JSON.stringify(toCharacterPatch(baseline));
}

/** Steppers clamp typed input to a non-negative whole number within the guard band. */
export function clampCounter(value: number | null | undefined, max = COUNTER_MAX): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(0, Math.trunc(value)));
}

function counterValue(value: string | number | null): number | null {
  if (value == null || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function fieldOfPath(path: readonly PropertyKey[]): CharacterFormField {
  const [head, second] = path;
  if (typeof head !== 'string' || head === '') return '_form';
  if (head === 'stats' && typeof second === 'string') return `stats.${second as StatField}`;
  return head as CharacterFormField;
}

function schemaIssues(patch: Omit<CharacterPatch, 'dryRun'>): CharacterFormIssue[] {
  const result = CharacterPatchSchema.safeParse(patch);
  if (result.success) return [];

  return result.error.issues.map((issue): CharacterFormIssue => {
    const field = fieldOfPath(issue.path);
    switch (issue.code) {
      case 'too_small':
        // zod reports the value kind as `origin` for range checks.
        return issue.origin === 'string'
          ? { field, code: 'required' }
          : { field, code: 'tooSmall', min: Number(issue.minimum) };
      case 'too_big':
        return issue.origin === 'string'
          ? { field, code: 'tooLong', max: Number(issue.maximum) }
          : { field, code: 'tooBig', max: Number(issue.maximum) };
      case 'invalid_type':
        return issue.expected === 'int' || issue.expected === 'integer'
          ? { field, code: 'notInteger' }
          : { field, code: 'invalid' };
      default:
        return { field, code: 'invalid' };
    }
  });
}

function statIssues(state: CharacterFormState): CharacterFormIssue[] {
  const issues: CharacterFormIssue[] = [];
  for (const field of STAT_FIELDS) {
    const value = state.stats[field];
    if (value == null || value === '') continue;
    if (isNumericStatField(field)) {
      const numeric = counterValue(value);
      if (numeric == null) {
        issues.push({ field: `stats.${field}`, code: 'invalid' });
      } else if (!Number.isInteger(numeric)) {
        issues.push({ field: `stats.${field}`, code: 'notInteger' });
      } else if (numeric < 0) {
        issues.push({ field: `stats.${field}`, code: 'tooSmall', min: 0 });
      } else if (numeric > COUNTER_MAX) {
        issues.push({ field: `stats.${field}`, code: 'tooBig', max: COUNTER_MAX });
      }
    } else if (typeof value === 'string' && value.trim().length > 500) {
      issues.push({ field: `stats.${field}`, code: 'tooLong', max: 500 });
    }
  }

  // Accuracy and headshot share are derived from these counters; a hit count above
  // the shots fired would render a percentage above 100 and is never real data.
  const fired = counterValue(state.stats['sho-fir']);
  const hit = counterValue(state.stats['sho-hit']);
  const head = counterValue(state.stats['sho-hea']);
  if (fired != null && hit != null && hit > fired) {
    issues.push({ field: 'stats.sho-hit', code: 'tooBig', max: fired });
  }
  if (hit != null && head != null && head > hit) {
    issues.push({ field: 'stats.sho-hea', code: 'tooBig', max: hit });
  }
  return issues;
}

function dedupe(issues: CharacterFormIssue[]): CharacterFormIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Every problem that keeps the form from being submitted, in display order.
 * Field rules come from the same `CharacterPatchSchema` the server applies; the
 * stats recorder is looser there, so the editor adds its whole-number bounds.
 */
export function characterFormIssues(state: CharacterFormState, baseline: CharacterFormState): CharacterFormIssue[] {
  const issues = dedupe([...statIssues(state), ...schemaIssues(toCharacterPatch(state))]);
  if (!characterFormChanged(state, baseline)) issues.push({ field: '_form', code: 'noChanges' });
  return issues;
}

export function canSubmitCharacterForm(state: CharacterFormState, baseline: CharacterFormState): boolean {
  return characterFormIssues(state, baseline).length === 0;
}

/** What the UI renders under a field; no raw zod text reaches the owner. */
export function characterFormMessage(issue: CharacterFormIssue): CharacterFormMessage {
  switch (issue.code) {
    case 'required':
      return { key: 'forms.errors.required' };
    case 'tooLong':
      return { key: 'forms.errors.tooLong', params: { max: issue.max ?? 0 } };
    case 'tooSmall':
      return { key: 'forms.errors.tooSmall', params: { min: issue.min ?? 0 } };
    case 'tooBig':
      return { key: 'forms.errors.tooBig', params: { max: issue.max ?? 0 } };
    case 'notInteger':
      return { key: 'forms.errors.notInteger' };
    case 'noChanges':
      return { key: 'forms.noChanges' };
    default:
      return { key: 'forms.errors.invalid' };
  }
}
