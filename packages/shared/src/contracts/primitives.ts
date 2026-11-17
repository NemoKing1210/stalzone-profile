import { z } from 'zod';

export const RegionSchema = z.enum(['ru', 'eu', 'na', 'sea', 'global']).default('ru');

/** A region the first-run wizard can persist; `global` is a filter value only. */
export const SetupRegionSchema = z.enum(['ru', 'eu', 'na', 'sea']);
export type SetupRegion = z.infer<typeof SetupRegionSchema>;

export const ItemKindSchema = z.enum([
  'weapon',
  'armor',
  'container',
  'artifact',
  'attachment',
  'ammo',
  'motif',
  'other',
]);

/** Only these kinds can belong to the profile; the rest stay catalog-only. */
export const OwnedKindSchema = z.enum(['weapon', 'armor', 'container', 'artifact']);
export type OwnedKind = z.infer<typeof OwnedKindSchema>;

/**
 * The four northern factions of STALZONE. Stalkers and bandits are starting
 * sides, not factions, so they must not be storable. The slug is what the DB
 * keeps; the display name lives in the i18n catalogs.
 */
export const FACTIONS = ['rise', 'frontier', 'mercenaries', 'covenant'] as const;
export const FactionSchema = z.enum(FACTIONS);
export type Faction = (typeof FACTIONS)[number];

export const SyncSourceSchema = z.enum(['exbo_base', 'wiki', 'motifs', 'scpmodel', 'icons', 'profile', 'all']);
export type SyncSource = z.infer<typeof SyncSourceSchema>;
