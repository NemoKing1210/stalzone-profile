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

/** Only these kinds can belong to the dossier; the rest stay catalog-only. */
export const OwnedKindSchema = z.enum(['weapon', 'armor', 'container', 'artifact']);
export type OwnedKind = z.infer<typeof OwnedKindSchema>;

export const CleanupScopeSchema = z.enum(['owned', 'builds', 'all']);
export type CleanupScope = z.infer<typeof CleanupScopeSchema>;

export const SyncSourceSchema = z.enum(['exbo_base', 'wiki', 'motifs', 'scpmodel', 'icons', 'profile', 'all']);
export type SyncSource = z.infer<typeof SyncSourceSchema>;
