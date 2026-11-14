import { z } from 'zod';

export const RealmSchema = z.enum(['ru', 'global', 'eu']).default('ru');

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

export const OwnedItemInputSchema = z.object({
  name: z.string().min(1),
  kind: ItemKindSchema.default('weapon'),
  level: z.number().int().min(0).max(15).default(0),
  skin: z.string().min(1).nullish(),
  quality: z.string().min(1).nullish(),
  note: z.string().nullish(),
  role: z.string().nullish(),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

export type OwnedItemInput = z.infer<typeof OwnedItemInputSchema>;

export const RemoveOwnedInputSchema = z.object({
  name: z.string().min(1),
  kind: ItemKindSchema.default('weapon'),
  level: z.number().int().min(0).max(15).nullish(),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

export type RemoveOwnedInput = z.infer<typeof RemoveOwnedInputSchema>;

export const SetContainerArtifactsInputSchema = z.object({
  container: z.string().min(1),
  artifacts: z
    .array(
      z.object({
        name: z.string().min(1),
        level: z.number().int().min(0).max(15).default(0),
        quality: z.string().nullish(),
      }),
    )
    .max(20),
  as_of: z.string().min(1).nullish(),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

export type SetContainerArtifactsInput = z.infer<typeof SetContainerArtifactsInputSchema>;

export const BuildSlotSchema = z.object({
  name: z.string().nullish(),
  label: z.string().nullish(),
  quality: z.string().nullish(),
  price: z.number().int().nonnegative().nullish(),
  lots: z.number().int().nonnegative().nullish(),
  eff: z.string().nullish(),
  bonus: z.string().nullish(),
  minus: z.string().nullish(),
  why: z.string().nullish(),
});

export const BuildInputSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/i, 'slug: латиница, цифры, дефис'),
  title: z.string().min(1),
  short: z.string().nullish(),
  tag: z.string().nullish(),
  goal: z.string().nullish(),
  container: z.string().nullish(),
  slots: z.number().int().nonnegative().nullish(),
  eff: z.number().nullish(),
  budget: z.number().int().nonnegative().nullish(),
  total: z.number().int().nonnegative().nullish(),
  metrics: z.array(z.object({ l: z.string(), v: z.string(), s: z.string().nullish() })).nullish(),
  verdict: z.string().nullish(),
  rows: z.array(BuildSlotSchema).default([]),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

export type BuildInput = z.infer<typeof BuildInputSchema>;

export const ContentBlockInputSchema = z.object({
  kind: z.enum(['recs', 'earnings', 'notes', 'builds_meta', 'catalog_meta']),
  slug: z.string().nullish(),
  title: z.string().nullish(),
  lead: z.string().nullish(),
  payload: z.unknown(),
  position: z.number().int().nonnegative().default(0),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

export type ContentBlockInput = z.infer<typeof ContentBlockInputSchema>;

export const FindItemsQuerySchema = z.object({
  q: z.string().min(1).nullish(),
  kind: ItemKindSchema.nullish(),
  rank: z.string().nullish(),
  slot: z.string().nullish(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export type FindItemsQuery = z.infer<typeof FindItemsQuerySchema>;

export const CompareItemsInputSchema = z.object({
  a: z.string().min(1),
  b: z.string().min(1),
  level: z.number().int().min(0).max(15).default(15),
});

export type CompareItemsInput = z.infer<typeof CompareItemsInputSchema>;

export const PlanArtifactBuildInputSchema = z.object({
  preset: z.enum(['speed', 'sprint', 'stamina', 'carry', 'hp', 'heal', 'bullet', 'recoil', 'loot']).default('speed'),
  effects: z.array(z.object({ key: z.string(), w: z.number().default(1) })).nullish(),
  slots: z.number().int().min(1).max(20).default(5),
  budget: z.number().int().nonnegative().nullish(),
  mode: z.enum(['value', 'max']).default('value'),
  quality: z.string().nullish(),
  unique: z.boolean().default(true),
  requireLot: z.boolean().default(false),
});

export type PlanArtifactBuildInput = z.infer<typeof PlanArtifactBuildInputSchema>;

export const SyncInputSchema = z.object({
  force: z.boolean().default(false),
});

export const RollbackInputSchema = z.object({
  event_id: z.number().int().positive(),
  confirm: z.boolean().default(false),
});
