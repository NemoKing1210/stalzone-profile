import { z } from 'zod';
import { CatalogItemSchema, DeviceCatalogRowSchema, ItemCardSchema } from './catalog.js';
import { ContainerReadSchema, InventoryReadSchema } from './inventory.js';
import { SourceStatusSchema } from './api.js';
import { FactionSchema } from './primitives.js';

/** The payload character is a view over the identity read; `{}` means no character yet. */
export const PayloadCharacterSchema = z
  .object({
    nick: z.string().optional(),
    region: z.string().optional(),
    faction: FactionSchema.nullable().optional(),
    alliance: z.string().nullable().optional(),
    clanName: z.string().nullable().optional(),
    clanRank: z.string().nullable().optional(),
    money: z.number().nullable().optional(),
    maxMoney: z.number().nullable().optional(),
    profileFetchedAt: z.string().nullable().optional(),
    arrived: z.string().nullable().optional(),
    hours: z.number().nullable().optional(),
    kd: z.number().nullable().optional(),
    accuracy: z.number().nullable().optional(),
    headshot: z.number().nullable().optional(),
    achievements: z.number().nullable().optional(),
    achievementPoints: z.null().optional(),
    stats: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  })
  .loose();
export type PayloadCharacter = z.infer<typeof PayloadCharacterSchema>;

export const PayloadMetaSchema = z.object({
  updated: z.string().nullable(),
  source: z.string(),
  items: z.number().int().optional(),
  region: z.string().nullable().optional(),
  statsFetched: z.string().nullable().optional(),
});
export type PayloadMeta = z.infer<typeof PayloadMetaSchema>;

export const CatalogMetaSchema = z.object({
  updated: z.string().nullable(),
  source: z.string(),
  items: z.number().int(),
});
export type CatalogMeta = z.infer<typeof CatalogMetaSchema>;

export const FreshnessSchema = z.object({
  dataUpdated: z.string().nullable(),
  pricesUpdatedAt: z.string().nullable(),
  pricesAgeMin: z.number().nullable(),
  sources: z.array(SourceStatusSchema),
});
export type Freshness = z.infer<typeof FreshnessSchema>;

/** `/api/v1/meta`: the freshness header without the heavy profile sections. */
export const MetaReadSchema = z.object({
  meta: PayloadMetaSchema,
  catalogMeta: CatalogMetaSchema,
  freshness: FreshnessSchema,
});
export type MetaRead = z.infer<typeof MetaReadSchema>;

const payloadRow = z.record(z.string(), z.unknown());

export const PayloadSchema = z.object({
  meta: PayloadMetaSchema,
  character: PayloadCharacterSchema,
  weapons: z.array(payloadRow),
  armor: z.array(payloadRow),
  containers: z.array(ContainerReadSchema),
  artifacts: z.array(payloadRow),
  catalog: z.object({
    weapons: z.array(CatalogItemSchema),
    armor: z.array(CatalogItemSchema),
    devices: z.array(DeviceCatalogRowSchema),
    meta: CatalogMetaSchema,
  }),
  inventory: InventoryReadSchema,
  details: z.record(z.string(), ItemCardSchema),
  icons: z.record(z.string(), z.string()),
  freshness: FreshnessSchema,
});
export type Payload = z.infer<typeof PayloadSchema>;

/** The portable export keeps the profile sections and drops display-only freshness. */
export const ProfileExportSchema = PayloadSchema.omit({ icons: true, freshness: true });
export type ProfileExport = z.infer<typeof ProfileExportSchema>;
