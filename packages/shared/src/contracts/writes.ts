import { z } from 'zod';
import {
  FactionSchema,
  ItemKindSchema,
  OwnedKindSchema,
  SetupRegionSchema,
  SyncSourceSchema,
} from './primitives.js';

/** Options shared by every write request coming from the site or the API. */
export const WriteOptionsSchema = z.object({
  dryRun: z.boolean().default(false),
});

export const CleanupRequestSchema = z.object({
  dryRun: z.boolean().default(false),
});
export type CleanupRequest = z.infer<typeof CleanupRequestSchema>;

/* ------------------------------------------------------------------ */
/* Site/API write schemas (camelCase, dryRun defaults to false)        */
/* ------------------------------------------------------------------ */

export const OwnedContainerSchema = z.object({
  containerType: z.string().min(1).max(200).nullish(),
  shield: z.number().nullish(),
  bonus: z.string().max(500).nullish(),
  protection: z.number().nullish(),
  slots: z.number().int().nonnegative().nullish(),
  eff: z.number().nullish(),
});

export type OwnedContainerInput = z.infer<typeof OwnedContainerSchema>;

export const OwnedCreateSchema = WriteOptionsSchema.extend({
  name: z.string().min(1).max(200),
  kind: OwnedKindSchema.default('weapon'),
  level: z.number().int().min(0).max(15).default(0),
  skin: z.string().min(1).max(200).nullish(),
  quality: z.string().min(1).max(100).nullish(),
  note: z.string().max(2000).nullish(),
  role: z.string().max(200).nullish(),
  slot: z.string().max(100).nullish(),
  qty: z.number().int().min(1).max(99).default(1),
  container: OwnedContainerSchema.optional(),
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
  container: OwnedContainerSchema.nullish(),
}).refine((value) => Object.keys(value).some((key) => key !== 'dryRun'), {
  message: 'At least one field must be changed',
});

export type OwnedPatch = z.infer<typeof OwnedPatchSchema>;

export const CharacterPatchSchema = WriteOptionsSchema.extend({
  nick: z.string().min(1).max(64).optional(),
  region: z.enum(['ru', 'eu', 'na', 'sea', 'global']).optional(),
  faction: FactionSchema.nullish(),
  alliance: z.string().max(100).nullish(),
  clanName: z.string().max(100).nullish(),
  clanRank: z.string().max(100).nullish(),
  money: z.number().int().min(0).nullish(),
  maxMoney: z.number().int().min(0).nullish(),
  stash: z.string().max(500).nullish(),
  stats: z
    .record(z.string().min(1).max(200), z.union([z.number().finite(), z.string().min(1).max(500), z.null()]))
    .optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'dryRun'), {
  message: 'At least one field must be changed',
});

export type CharacterPatch = z.infer<typeof CharacterPatchSchema>;

/** First-run creation. The profile holds at most one character. */
export const CharacterCreateSchema = WriteOptionsSchema.extend({
  nick: z.string().trim().min(1).max(64),
  region: SetupRegionSchema,
  faction: FactionSchema.nullish(),
  alliance: z.string().max(100).nullish(),
  clanName: z.string().max(100).nullish(),
  clanRank: z.string().max(100).nullish(),
});

export type CharacterCreate = z.infer<typeof CharacterCreateSchema>;

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

export const LoginSchema = z.object({
  password: z.string().min(1).max(256),
});

/* ------------------------------------------------------------------ */
/* MCP tool schemas (snake_case, dry_run defaults to true)            */
/* ------------------------------------------------------------------ */

export const OwnedItemInputSchema = z.object({
  name: z.string().min(1),
  kind: OwnedKindSchema.default('weapon'),
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
  kind: OwnedKindSchema.default('weapon'),
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

export const SyncRequestSchema = z.object({
  source: SyncSourceSchema.default('all'),
  force: z.boolean().default(false),
});

export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const RollbackInputSchema = z.object({
  event_id: z.number().int().positive(),
  confirm: z.boolean().default(false),
});
