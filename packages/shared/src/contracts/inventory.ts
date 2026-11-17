import { z } from 'zod';
import {
  EquipmentSlotSchema,
  InventoryKindSchema,
  ModuleSlotSchema,
  RarityTierSchema,
  StorageKindSchema,
} from './primitives.js';

export const ContainerFillReadSchema = z.object({
  name: z.string(),
  lvl: z.number().int(),
});
export type ContainerFillRead = z.infer<typeof ContainerFillReadSchema>;


/* ------------------------------------------------------------------ */
/* Inventory instance model (new)                                     */
/* ------------------------------------------------------------------ */

export const RangeValueSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  value: z.number().nullable(),
  missing: z.array(z.string()),
});
export type RangeValue = z.infer<typeof RangeValueSchema>;

export const ContainerDataReadSchema = z.object({
  type: z.string().nullable(),
  shield: z.number().nullable(),
  bonus: z.string().nullable(),
  protection: z.number().nullable(),
  slots: z.number().nullable(),
  eff: z.number().nullable(),
});
export type ContainerDataRead = z.infer<typeof ContainerDataReadSchema>;

export const PlacementReadSchema = z.discriminatedUnion('location', [
  z.object({
    location: z.literal('grid'),
    storageId: z.number().int(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    rotated: z.boolean(),
  }),
  z.object({
    location: z.literal('equipment'),
    slot: EquipmentSlotSchema,
  }),
  z.object({
    location: z.literal('container'),
    containerItemId: z.number().int(),
    slotIndex: z.number().int().nonnegative(),
  }),
  z.object({
    location: z.literal('weapon_module'),
    weaponItemId: z.number().int(),
    slot: ModuleSlotSchema,
    verified: z.boolean(),
  }),
  z.object({
    location: z.literal('loose'),
  }),
]);
export type PlacementRead = z.infer<typeof PlacementReadSchema>;

export const ContainerReadSchema = z.object({
  name: z.string(),
  ownedId: z.number().int(),
  qty: z.number().int(),
  note: z.string().nullable(),
  quality: z.string().nullable(),
  skin: z.string().nullable(),
  type: z.string().nullable(),
  weight: z.number().nullable(),
  slots: z.number().nullable(),
  eff: z.number().nullable(),
  prot: z.number().nullable(),
  shield: z.number().nullable(),
  bonus: z.string().nullable(),
  rank: z.string().nullable(),
  artifacts: z.array(ContainerFillReadSchema),
  artifactsAsOf: z.string().nullable(),
  icon: z.string().nullable(),
  instanceId: z.number().int().optional(),
  storageId: z.number().int().nullable().optional(),
  placement: PlacementReadSchema.optional(),
});
export type ContainerRead = z.infer<typeof ContainerReadSchema>;

export interface InventoryItemRead {
  id: number;
  itemId: number;
  name: string;
  displayName: string | null;
  kind: z.infer<typeof InventoryKindSchema>;
  category: string | null;
  rank: string | null;
  level: number;
  quality: string | null;
  rarityPct: number | null;
  rarityTier: z.infer<typeof RarityTierSchema> | null;
  qty: number;
  skinItemId: number | null;
  icon: string | null;
  note: string | null;
  role: string | null;
  slot: string | null;
  weight: number | null;
  size: { width: number; height: number };
  placement: PlacementRead;
  container: ContainerDataRead | null;
  artifacts?: InventoryItemRead[];
  modules?: InventoryItemRead[];
}

export const InventoryItemReadSchema: z.ZodType<InventoryItemRead> = z.lazy(() =>
  z.object({
    id: z.number().int(),
    itemId: z.number().int(),
    name: z.string(),
    displayName: z.string().nullable(),
    kind: InventoryKindSchema,
    category: z.string().nullable(),
    rank: z.string().nullable(),
    level: z.number().int(),
    quality: z.string().nullable(),
    rarityPct: z.number().nullable(),
    rarityTier: RarityTierSchema.nullable(),
    qty: z.number().int(),
    skinItemId: z.number().int().nullable(),
    icon: z.string().nullable(),
    note: z.string().nullable(),
    role: z.string().nullable(),
    slot: z.string().nullable(),
    weight: z.number().nullable(),
    size: z.object({ width: z.number().int(), height: z.number().int() }),
    placement: PlacementReadSchema,
    container: ContainerDataReadSchema.nullable(),
    artifacts: z.array(InventoryItemReadSchema).optional(),
    modules: z.array(InventoryItemReadSchema).optional(),
  }),
);

export const StorageReadSchema = z.object({
  id: z.number().int(),
  kind: StorageKindSchema,
  name: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  maxWeight: z.number().nullable(),
  sortOrder: z.number().int(),
  items: z.array(InventoryItemReadSchema),
  weight: RangeValueSchema,
  updatedAt: z.string().nullable(),
});
export type StorageRead = z.infer<typeof StorageReadSchema>;

export const EffectBreakdownSchema = z.object({
  positive: RangeValueSchema,
  negative: RangeValueSchema,
  purge: RangeValueSchema.nullable(),
});
export type EffectBreakdown = z.infer<typeof EffectBreakdownSchema>;

export const ContainerLoadoutSchema = z.object({
  itemId: z.number().int(),
  effectiveness: z.number().nullable(),
  slots: z.number().nullable(),
  innerProtection: z.object({
    rad: z.number().nullable(),
    temp: z.number().nullable(),
    bio: z.number().nullable(),
    psy: z.number().nullable(),
    frost: z.number().nullable(),
  }),
  effects: z.record(z.string(), EffectBreakdownSchema),
});
export type ContainerLoadout = z.infer<typeof ContainerLoadoutSchema>;

export const LoadoutStatsSchema = z.object({
  carry: z.object({
    base: z.number(),
    bonus: RangeValueSchema,
    total: RangeValueSchema,
    safeLimit: RangeValueSchema,
    carried: RangeValueSchema,
    aboveSafe: z.boolean().nullable(),
    overweight: z.boolean().nullable(),
  }),
  storages: z.record(z.string(), RangeValueSchema),
  protection: z.record(z.string(), RangeValueSchema.nullable()),
  effects: z.record(z.string(), EffectBreakdownSchema),
  containers: z.array(ContainerLoadoutSchema),
  warnings: z.array(z.string()),
});
export type LoadoutStats = z.infer<typeof LoadoutStatsSchema>;

export const EquipmentReadSchema = z.object({
  primary: InventoryItemReadSchema.nullable(),
  secondary: InventoryItemReadSchema.nullable(),
  melee: InventoryItemReadSchema.nullable(),
  armor: InventoryItemReadSchema.nullable(),
  backpack: InventoryItemReadSchema.nullable(),
  container: InventoryItemReadSchema.nullable(),
  quick1: InventoryItemReadSchema.nullable(),
  quick2: InventoryItemReadSchema.nullable(),
  quick3: InventoryItemReadSchema.nullable(),
  quick4: InventoryItemReadSchema.nullable(),
});
export type EquipmentRead = z.infer<typeof EquipmentReadSchema>;

export const InventoryReadSchema = z.object({
  storages: z.array(StorageReadSchema),
  equipment: EquipmentReadSchema,
  loose: z.array(InventoryItemReadSchema),
  stats: LoadoutStatsSchema,
  updatedAt: z.string().nullable(),
});
export type InventoryRead = z.infer<typeof InventoryReadSchema>;
