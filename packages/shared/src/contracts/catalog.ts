import { z } from 'zod';

export const DamagePointSchema = z.object({
  d0: z.number().nullable(),
  dB: z.number().nullable(),
  distA: z.number().nullable(),
  distB: z.number().nullable(),
  distMax: z.number().nullable(),
});
export type DamagePoint = z.infer<typeof DamagePointSchema>;

/** The derived detail card. Kind-specific fields are optional; unknown keys stay available. */
export const ItemCardSchema = z
  .object({
    kind: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    type: z.string().nullable(),
    rank: z.string().nullable(),
    slot: z.string().nullable(),
    weight: z.number().nullable(),
    effects: z.string().nullish(),
    caliber: z.string().nullish(),
    cls: z.string().nullish(),
    mag: z.number().nullish(),
    rof: z.number().nullish(),
    spread: z.number().nullish(),
    hipSpread: z.number().nullish(),
    recoil: z.number().nullish(),
    reload: z.number().nullish(),
    reloadTac: z.number().nullish(),
    ergonomics: z.number().nullish(),
    draw: z.number().nullish(),
    aim: z.number().nullish(),
    platePen: z.number().nullish(),
    pierce: z.number().nullish(),
    mods3: z.object({ head: z.number().nullable(), limbs: z.number().nullable() }).nullish(),
    p0: DamagePointSchema.nullish(),
    p15: DamagePointSchema.nullish(),
    dps15: z.number().nullish(),
    ttk15: z.number().nullish(),
    curve: z.array(z.number()).nullish(),
    prot: z.union([z.number().nullable(), z.record(z.string(), z.number().nullable())]).nullish(),
    mods: z.array(z.object({ name: z.string(), value: z.number(), pct: z.boolean() })).nullish(),
    slots: z.number().nullish(),
    slotEq: z.number().nullish(),
    eff: z.number().nullish(),
    shield: z.number().nullish(),
    bonus: z.string().nullish(),
    armor: z.number().nullish(),
    armor15: z.number().nullish(),
  })
  .loose();
export type ItemCard = z.infer<typeof ItemCardSchema>;

export const ItemSummarySchema = z.object({
  id: z.number().int(),
  externalId: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  kind: z.string(),
  category: z.string().nullable(),
  rank: z.string().nullable(),
  slot: z.string().nullable(),
  weight: z.number().nullable(),
  cosmetic: z.boolean(),
  icon: z.string().nullable(),
  stats: z.array(z.unknown()).optional(),
  effects: z.array(z.unknown()).optional(),
});
export type ItemSummary = z.infer<typeof ItemSummarySchema>;

export const ItemStatSchema = z.object({
  item_id: z.number().int(),
  stat_id: z.string(),
  label: z.string().nullable(),
  level: z.number().int(),
  value_num: z.number().nullable(),
  value_min: z.number().nullable(),
  value_max: z.number().nullable(),
  value_text: z.string().nullable(),
  pct: z.number().int(),
  is_positive: z.number().int().nullable(),
  is_additional: z.number().int(),
  source_id: z.string().nullable(),
});
export type ItemStat = z.infer<typeof ItemStatSchema>;

export const ItemEffectSchema = z.object({
  item_id: z.number().int(),
  position: z.number().int(),
  label: z.string(),
  is_positive: z.number().int(),
});
export type ItemEffect = z.infer<typeof ItemEffectSchema>;

const weaponCatalogRow = z.object({
  name: z.string(),
  rank: z.string(),
  type: z.string().nullable(),
  icon: z.string().nullable(),
  slot: z.string().nullable(),
  caliber: z.string().nullable(),
  mag: z.number().nullable(),
  weight: z.number().nullable(),
  dmg15: z.number().nullable(),
  rof: z.number().nullable(),
  dps15: z.number().nullable(),
  ttk15: z.number().nullable(),
});

const armorCatalogRow = z.object({
  name: z.string(),
  rank: z.string(),
  cls: z.string().nullable(),
  icon: z.string().nullable(),
  weight: z.number().nullable(),
  armor15: z.number().nullable(),
});

export const CatalogItemSchema = z.union([weaponCatalogRow, armorCatalogRow]);
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const PriceRowSchema = z.object({
  id: z.number().int(),
  itemId: z.number().int().nullable(),
  externalId: z.string().nullable(),
  name: z.string(),
  quality: z.string().nullable(),
  bonus: z.number().nullable(),
  lotPrice: z.number().nullable(),
  lotCount: z.number().nullable(),
  currentPrice: z.number().nullable(),
  lastTrade: z.number().nullable(),
  lotUpdatedAt: z.string().nullable(),
  sourceId: z.string(),
  fetchedAt: z.string(),
});
export type PriceRow = z.infer<typeof PriceRowSchema>;

export const ArtifactStatSchema = z.object({
  key: z.string(),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  mid: z.number(),
  pos: z.boolean(),
  pct: z.boolean(),
  additional: z.boolean().optional(),
});
export type ArtifactStat = z.infer<typeof ArtifactStatSchema>;

export const ArtifactSourceSchema = z.object({
  exboId: z.string(),
  name: z.string(),
  type: z.string(),
  stats: z.array(ArtifactStatSchema),
  additional: z.array(ArtifactStatSchema),
});
export type ArtifactSource = z.infer<typeof ArtifactSourceSchema>;
