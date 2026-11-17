import { FACTIONS, type Faction } from '@profile/shared/contracts';

type Translate = (key: string) => string;

/** reka-ui rejects an empty string as an item value, so "no faction" needs a sentinel. */
export const NO_FACTION = 'none';
export type FactionChoice = Faction | typeof NO_FACTION;

export interface FactionOption {
  label: string;
  value: Faction;
}

export interface FactionSelectItem {
  label: string;
  value: FactionChoice;
}

/** The four northern factions, labelled through the i18n catalogs. */
export function factionOptions(t: Translate): FactionOption[] {
  return FACTIONS.map((value) => ({ label: t(`factions.${value}`), value }));
}

/** Form items for the optional faction: the sentinel entry clears it. */
export function factionSelectItems(t: Translate): FactionSelectItem[] {
  return [{ label: t('forms.factionNone'), value: NO_FACTION }, ...factionOptions(t)];
}

/** What the API and the DB receive: the sentinel and an empty choice become `null`. */
export function factionValue(choice: FactionChoice | null | undefined): Faction | null {
  return choice && choice !== NO_FACTION ? choice : null;
}

/** Display label for a stored slug; a value outside the enum falls back to the raw string. */
export function factionLabel(t: Translate, faction: string | null | undefined): string | null {
  if (!faction) return null;
  return (FACTIONS as readonly string[]).includes(faction) ? t(`factions.${faction}`) : faction;
}
