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
  'modification',
  'ammo',
  'motif',
  'other',
]);

/** Only these kinds can belong to the profile; the rest stay catalog-only. */
export const OwnedKindSchema = z.enum(['weapon', 'armor', 'container', 'artifact']);
export type OwnedKind = z.infer<typeof OwnedKindSchema>;

/** Kinds an inventory instance can have. Motifs are catalog-only and never owned. */
export const InventoryKindSchema = z.enum([
  'weapon',
  'armor',
  'container',
  'artifact',
  'modification',
  'ammo',
  'other',
]);
export type InventoryKind = z.infer<typeof InventoryKindSchema>;

export const EquipmentSlotSchema = z.enum([
  'primary',
  'secondary',
  'melee',
  'armor',
  'backpack',
  'container',
  'quick1',
  'quick2',
  'quick3',
  'quick4',
]);
export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;

export const StorageKindSchema = z.enum(['inventory', 'stash', 'overflow']);
export type StorageKind = z.infer<typeof StorageKindSchema>;

/** Kinds a public write may create; the intake is system-owned. */
export const WritableStorageKindSchema = z.enum(['inventory', 'stash']);
export type WritableStorageKind = z.infer<typeof WritableStorageKindSchema>;

export const PlacementLocationSchema = z.enum(['grid', 'equipment', 'container', 'weapon_modification', 'loose']);
export type PlacementLocation = z.infer<typeof PlacementLocationSchema>;

export const RarityTierSchema = z.enum([
  'ordinary',
  'unordinary',
  'special',
  'rare',
  'exclusive',
  'legendary',
  'unique',
]);
export type RarityTier = z.infer<typeof RarityTierSchema>;

export const ModificationSlotSchema = z.enum([
  'scope',
  'muzzle',
  'grip',
  'magazine',
  'stock',
  'tactical',
  'other',
]);
export type ModificationSlot = z.infer<typeof ModificationSlotSchema>;

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
