import { FACTIONS, type Faction } from '@profile/shared/contracts';

type Translate = (key: string) => string;

/** reka-ui rejects an empty string as an item value, so "no faction" needs a sentinel. */
export const NO_FACTION = 'none';
export type FactionChoice = Faction | typeof NO_FACTION;

export interface FactionOption {
  label: string;
  value: Faction;
  /** Local static emblem path; the alt text is the localised faction name. */
  emblem: string;
}

export interface FactionSelectItem {
  label: string;
  value: FactionChoice;
  emblem?: string;
}

export interface FactionEmblem {
  slug: Faction;
  src: string;
  /** i18n key of the faction name, used as the image alt text. */
  altKey: string;
}

/**
 * Public faction emblems, shipped under `public/factions/` so no page fetches a
 * third-party host at runtime. Sources were downloaded on 2026-11-20 from the
 * public STALCRAFT community wiki files (no game files, no sign-in):
 * `static.wikia.nocookie.net/stalcraft/images/7/79/Freedom.webp` (rise),
 * `.../7/74/Duty.webp` (frontier), `.../2/29/Mercenaries.webp`,
 * `.../a/a2/Covenate.webp` (covenant). Frontier/Rise use the emblems of the
 * factions they replaced in the same lineage.
 */
export const FACTION_EMBLEMS: Readonly<Record<Faction, string>> = {
  rise: '/factions/rise.png',
  frontier: '/factions/frontier.png',
  mercenaries: '/factions/mercenaries.png',
  covenant: '/factions/covenant.png',
};

function isFaction(value: string): value is Faction {
  return (FACTIONS as readonly string[]).includes(value);
}

/** The four northern factions, labelled through the i18n catalogs. */
export function factionOptions(t: Translate): FactionOption[] {
  return FACTIONS.map((value) => ({ label: t(`factions.${value}`), value, emblem: FACTION_EMBLEMS[value] }));
}

/** Emblem for a stored slug; an unknown slug returns `null` so the caller keeps the text label. */
export function factionEmblem(faction: string | null | undefined): FactionEmblem | null {
  if (!faction || !isFaction(faction)) return null;
  return { slug: faction, src: FACTION_EMBLEMS[faction], altKey: `factions.${faction}` };
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
  return isFaction(faction) ? t(`factions.${faction}`) : faction;
}
