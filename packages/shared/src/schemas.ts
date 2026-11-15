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

/** Options shared by every write request coming from the site or the API. */
export const WriteOptionsSchema = z.object({
  dryRun: z.boolean().default(false),
});

/* ------------------------------------------------------------------ */
/* Site/API write schemas (camelCase, dryRun defaults to false)        */
/* ------------------------------------------------------------------ */

export const OwnedCreateSchema = WriteOptionsSchema.extend({
  name: z.string().min(1).max(200),
  kind: ItemKindSchema.default('weapon'),
  level: z.number().int().min(0).max(15).default(0),
  skin: z.string().min(1).max(200).nullish(),
  quality: z.string().min(1).max(100).nullish(),
  note: z.string().max(2000).nullish(),
  role: z.string().max(200).nullish(),
  slot: z.string().max(100).nullish(),
  qty: z.number().int().min(1).max(99).default(1),
});

export type OwnedCreate = z.infer<typeof OwnedCreateSchema>;

export const OwnedPatchSchema = WriteOptionsSchema.extend({
  level: z.number().int().min(0).max(15).optional(),
  skin: z.string().min(1).max(200).nullish(),
  quality: z.string().min(1).max(100).nullish(),
  note: z.string().max(2000).nullish(),
  role: z.string().max(200).nullish(),
  slot: z.string().max(100).nullish(),
  qty: z.number().int().min(1).max(99).optional(),
  displayName: z.string().min(1).max(200).nullish(),
}).refine((value) => Object.keys(value).some((key) => key !== 'dryRun'), {
  message: 'At least one field must be changed',
});

export type OwnedPatch = z.infer<typeof OwnedPatchSchema>;

export const CharacterPatchSchema = WriteOptionsSchema.extend({
  nick: z.string().min(1).max(64).optional(),
  faction: z.string().max(100).nullish(),
  alliance: z.string().max(100).nullish(),
  clan: z.string().max(100).nullish(),
  arrived: z.string().max(100).nullish(),
  hours: z.number().int().min(0).max(1_000_000).nullish(),
  kd: z.number().min(0).max(100).nullish(),
  accuracy: z.number().min(0).max(100).nullish(),
  headshot: z.number().min(0).max(100).nullish(),
  achievements: z.number().int().min(0).nullish(),
  achievementPoints: z.number().int().min(0).nullish(),
  money: z.number().int().min(0).nullish(),
  maxMoney: z.number().int().min(0).nullish(),
  stash: z.string().max(500).nullish(),
  playstyle: z.string().max(500).nullish(),
}).refine((value) => Object.keys(value).some((key) => key !== 'dryRun'), {
  message: 'At least one field must be changed',
});

export type CharacterPatch = z.infer<typeof CharacterPatchSchema>;

export const ContainerFillSchema = WriteOptionsSchema.extend({
  artifacts: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        level: z.number().int().min(0).max(15).default(0),
        quality: z.string().max(100).nullish(),
      }),
    )
    .max(20),
  asOf: z.string().min(1).nullish(),
});

export type ContainerFill = z.infer<typeof ContainerFillSchema>;

export const BuildSlotSchema = z.object({
  name: z.string().nullish(),
  label: z.string().nullish(),
  quality: z.string().nullish(),
  rank: z.string().nullish(),
  price: z.number().int().nonnegative().nullish(),
  lots: z.number().int().nonnegative().nullish(),
  eff: z.string().nullish(),
  bonus: z.string().nullish(),
  minus: z.string().nullish(),
  why: z.string().nullish(),
});

export const BuildInputSchema = WriteOptionsSchema.extend({
  slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/i, 'slug: latin letters, digits, hyphen'),
  title: z.string().min(1).max(200),
  short: z.string().max(100).nullish(),
  tag: z.string().max(100).nullish(),
  goal: z.string().max(1000).nullish(),
  container: z.string().max(200).nullish(),
  slots: z.number().int().nonnegative().nullish(),
  eff: z.number().nullish(),
  budget: z.number().int().nonnegative().nullish(),
  total: z.number().int().nonnegative().nullish(),
  metrics: z.array(z.object({ l: z.string(), v: z.string(), s: z.string().nullish() })).nullish(),
  verdict: z.string().max(2000).nullish(),
  rows: z.array(BuildSlotSchema).default([]),
});

export type BuildInput = z.infer<typeof BuildInputSchema>;

export const ContentBlockInputSchema = WriteOptionsSchema.extend({
  kind: z.enum(['recs', 'earnings', 'notes', 'builds_meta', 'catalog_meta']),
  slug: z.string().max(200).nullish(),
  title: z.string().max(200).nullish(),
  lead: z.string().max(2000).nullish(),
  payload: z.unknown(),
  position: z.number().int().nonnegative().default(0),
});

export type ContentBlockInput = z.infer<typeof ContentBlockInputSchema>;

export const LoginSchema = z.object({
  password: z.string().min(1).max(256),
});

/* ------------------------------------------------------------------ */
/* MCP tool schemas (snake_case, dry_run defaults to true)            */
/* ------------------------------------------------------------------ */

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

export const SyncSourceSchema = z.enum(['exbo_base', 'wiki', 'motifs', 'profile', 'scpmodel', 'all']);

export const SyncRequestSchema = z.object({
  source: SyncSourceSchema.default('all'),
  force: z.boolean().default(false),
});

export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const RollbackInputSchema = z.object({
  event_id: z.number().int().positive(),
  confirm: z.boolean().default(false),
});
