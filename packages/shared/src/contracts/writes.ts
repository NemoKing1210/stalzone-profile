import { z } from 'zod';
import {
  EquipmentSlotSchema,
  FactionSchema,
  InventoryKindSchema,
  ItemKindSchema,
  ModuleSlotSchema,
  RarityTierSchema,
  SetupRegionSchema,
  SyncSourceSchema,
  WritableStorageKindSchema,
} from './primitives.js';

/** Options shared by every write request coming from the site or the API. */
export const WriteOptionsSchema = z.object({
  dryRun: z.boolean().default(false),
});

/** Which profile data a cleanup removes. `all` also clears the journal. */
export const CleanupScopeSchema = z.enum(['inventory', 'manualStats', 'character', 'journal', 'all']);
export type CleanupScope = z.infer<typeof CleanupScopeSchema>;

export const CleanupRequestSchema = z.object({
  scope: CleanupScopeSchema.default('inventory'),
  dryRun: z.boolean().default(false),
});
export type CleanupRequest = z.infer<typeof CleanupRequestSchema>;

/* ------------------------------------------------------------------ */
/* Site/API write schemas (camelCase, dryRun defaults to false)        */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DURATION = /^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/i;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The two calendar counters have one canonical form: registration as an ISO date in
 * `value_text`, playtime as hours in `value_num`. The API accepts `PT…H` for playtime and
 * converts it, but rejects any other text so a raw value never reaches the table.
 */
function validateCharacterStats(
  stats: Record<string, number | string | null> | undefined,
  ctx: z.RefinementCtx,
): void {
  if (!stats) return;
  const registered = stats['reg-tim'];
  if (registered !== undefined && registered !== null) {
    if (typeof registered !== 'string' || !isIsoDate(registered)) {
      ctx.addIssue({ code: 'custom', path: ['stats', 'reg-tim'], message: 'Registration must be YYYY-MM-DD' });
    }
  }
  const playtime = stats['pla-tim'];
  if (playtime !== undefined && playtime !== null) {
    if (typeof playtime === 'string' && !ISO_DURATION.test(playtime)) {
      ctx.addIssue({ code: 'custom', path: ['stats', 'pla-tim'], message: 'Playtime must be PT…H or hours' });
    } else if (typeof playtime !== 'string' && (!Number.isFinite(playtime) || playtime < 0)) {
      ctx.addIssue({ code: 'custom', path: ['stats', 'pla-tim'], message: 'Playtime must be non-negative hours' });
    }
  }
}

export const CharacterPatchSchema = WriteOptionsSchema.extend({
  nick: z.string().min(1).max(64).optional(),
  region: z.enum(['ru', 'eu', 'na', 'sea', 'global']).optional(),
  faction: FactionSchema.nullish(),
  alliance: z.string().max(100).nullish(),
  clanName: z.string().max(100).nullish(),
  clanRank: z.string().max(100).nullish(),
  money: z.number().int().min(0).nullish(),
  maxMoney: z.number().int().min(0).nullish(),
  stats: z
    .record(z.string().min(1).max(200), z.union([z.number().finite(), z.string().min(1).max(500), z.null()]))
    .optional(),
})
  .superRefine((value, ctx) => validateCharacterStats(value.stats, ctx))
  .refine((value) => Object.keys(value).some((key) => key !== 'dryRun'), {
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

export const LoginSchema = z.object({
  password: z.string().min(1).max(256),
});

/* ------------------------------------------------------------------ */
/* Inventory instance writes (camelCase, dryRun defaults to false)     */
/* ------------------------------------------------------------------ */

export const ContainerDataWriteSchema = z.object({
  type: z.string().min(1).max(200).nullish(),
  shield: z.number().nullish(),
  bonus: z.string().max(500).nullish(),
  protection: z.number().nullish(),
  slots: z.number().int().min(0).max(20).nullish(),
  eff: z.number().nullish(),
});
export type ContainerDataWrite = z.infer<typeof ContainerDataWriteSchema>;

export const PlacementTargetSchema = z.discriminatedUnion('location', [
  z.object({
    location: z.literal('grid'),
    storageId: z.number().int().positive(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    rotated: z.boolean().default(false),
  }),
  z.object({
    location: z.literal('equipment'),
    slot: EquipmentSlotSchema,
  }),
  z.object({
    location: z.literal('container'),
    containerItemId: z.number().int().positive(),
    slot: z.number().int().nonnegative(),
  }),
  z.object({
    location: z.literal('weapon_module'),
    weaponItemId: z.number().int().positive(),
    slot: ModuleSlotSchema,
    allowUnverified: z.boolean().default(false),
  }),
]);
export type PlacementTarget = z.infer<typeof PlacementTargetSchema>;

/**
 * Dimensions are not part of the public contract: every carried grid and stash is
 * 8 cells wide, and a created stash is always 8×200. Unknown width/height keys are
 * stripped, so an older client cannot choose a size.
 */
export const StorageCreateSchema = WriteOptionsSchema.extend({
  kind: WritableStorageKindSchema.default('stash'),
  name: z.string().trim().min(1).max(200),
  maxWeight: z.number().positive().nullish(),
  sortOrder: z.number().int().optional(),
});
export type StorageCreate = z.infer<typeof StorageCreateSchema>;

export const StoragePatchSchema = WriteOptionsSchema.extend({
  name: z.string().trim().min(1).max(200).optional(),
  maxWeight: z.number().positive().nullish(),
  sortOrder: z.number().int().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'dryRun'), {
  message: 'At least one field must be changed',
});
export type StoragePatch = z.infer<typeof StoragePatchSchema>;

export const TidyOrderSchema = z.enum(['kind', 'name', 'rank', 'footprint']);
export type TidyOrder = z.infer<typeof TidyOrderSchema>;

/** Explicit tidy-up: packs the visible items of one storage by the chosen order. */
export const TidyStorageSchema = WriteOptionsSchema.extend({
  order: TidyOrderSchema.default('kind'),
});
export type TidyStorage = z.infer<typeof TidyStorageSchema>;

export const DeleteStorageSchema = WriteOptionsSchema;
export type DeleteStorage = z.infer<typeof DeleteStorageSchema>;

export const InventoryItemCreateSchema = WriteOptionsSchema.extend({
  name: z.string().min(1).max(200),
  kind: InventoryKindSchema.default('weapon'),
  /** Exact catalog row; when present the server resolves by id and never by name. */
  catalogItemId: z.number().int().positive().optional(),
  level: z.number().int().min(0).max(15).default(0),
  skin: z.string().min(1).max(200).nullish(),
  quality: z.string().min(1).max(100).nullish(),
  rarityPct: z.number().min(0).max(175).nullish(),
  rarityTier: RarityTierSchema.nullish(),
  qty: z.number().int().min(1).max(99).default(1),
  displayName: z.string().min(1).max(200).nullish(),
  container: ContainerDataWriteSchema.optional(),
  target: PlacementTargetSchema.optional(),
}).strict();
export type InventoryItemCreate = z.infer<typeof InventoryItemCreateSchema>;

export const InventoryItemPatchSchema = WriteOptionsSchema.extend({
  level: z.number().int().min(0).max(15).optional(),
  skin: z.string().min(1).max(200).nullish(),
  quality: z.string().min(1).max(100).nullish(),
  rarityPct: z.number().min(0).max(175).nullish(),
  rarityTier: RarityTierSchema.nullish(),
  qty: z.number().int().min(1).max(99).optional(),
  displayName: z.string().min(1).max(200).nullish(),
  container: ContainerDataWriteSchema.nullish(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'dryRun'), {
  message: 'At least one field must be changed',
});
export type InventoryItemPatch = z.infer<typeof InventoryItemPatchSchema>;

export const DeleteInventoryItemSchema = WriteOptionsSchema.extend({
  qty: z.number().int().min(1).max(99).optional(),
});
export type DeleteInventoryItem = z.infer<typeof DeleteInventoryItemSchema>;

export const MoveItemSchema = WriteOptionsSchema.extend({
  target: PlacementTargetSchema,
  swap: z.boolean().default(false),
  allowUnverified: z.boolean().default(false),
});
export type MoveItem = z.infer<typeof MoveItemSchema>;

export const ContainerFillWriteSchema = WriteOptionsSchema.extend({
  slots: z.array(z.number().int().positive().nullable()).max(20),
});
export type ContainerFillWrite = z.infer<typeof ContainerFillWriteSchema>;

export const AutoArrangeSchema = WriteOptionsSchema;
export type AutoArrange = z.infer<typeof AutoArrangeSchema>;

export const ItemLayoutWriteSchema = WriteOptionsSchema.extend({
  width: z.number().int().min(1).max(20),
  height: z.number().int().min(1).max(20),
  weight: z.number().nonnegative().nullish(),
});
export type ItemLayoutWrite = z.infer<typeof ItemLayoutWriteSchema>;

/** `attachmentItemId: null` removes the module from the slot. */
export const WeaponModuleWriteSchema = WriteOptionsSchema.extend({
  attachmentItemId: z.number().int().positive().nullable(),
  allowUnverified: z.boolean().default(false),
});
export type WeaponModuleWrite = z.infer<typeof WeaponModuleWriteSchema>;

/* ------------------------------------------------------------------ */
/* MCP tool schemas (snake_case, dry_run defaults to true)            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* MCP inventory tool schemas (snake_case, dry_run defaults to true)  */
/* ------------------------------------------------------------------ */

/** Options shared by every MCP write tool. A real write needs confirm: true. */
export const McpWriteOptionsSchema = z.object({
  dry_run: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

export const McpContainerDataInputSchema = z.object({
  type: z.string().min(1).max(200).nullish(),
  shield: z.number().nullish(),
  bonus: z.string().max(500).nullish(),
  protection: z.number().nullish(),
  slots: z.number().int().min(0).max(20).nullish(),
  eff: z.number().nullish(),
});
export type McpContainerDataInput = z.infer<typeof McpContainerDataInputSchema>;

/** Placement target in MCP spelling; the client maps it onto `PlacementTarget`. */
export const McpPlacementTargetSchema = z.discriminatedUnion('location', [
  z.object({
    location: z.literal('grid'),
    storage_id: z.number().int().positive(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    rotated: z.boolean().default(false),
  }),
  z.object({
    location: z.literal('equipment'),
    slot: EquipmentSlotSchema,
  }),
  z.object({
    location: z.literal('container'),
    container_item_id: z.number().int().positive(),
    slot: z.number().int().nonnegative(),
  }),
  z.object({
    location: z.literal('weapon_module'),
    weapon_item_id: z.number().int().positive(),
    slot: ModuleSlotSchema,
    allow_unverified: z.boolean().default(false),
  }),
]);
export type McpPlacementTarget = z.infer<typeof McpPlacementTargetSchema>;

export const AddInventoryItemInputSchema = McpWriteOptionsSchema.extend({
  name: z.string().min(1),
  kind: InventoryKindSchema.default('weapon'),
  catalog_item_id: z.number().int().positive().optional(),
  level: z.number().int().min(0).max(15).default(0),
  skin: z.string().min(1).nullish(),
  quality: z.string().min(1).nullish(),
  rarity_pct: z.number().min(0).max(175).nullish(),
  rarity_tier: RarityTierSchema.nullish(),
  qty: z.number().int().min(1).max(99).default(1),
  display_name: z.string().min(1).nullish(),
  container: McpContainerDataInputSchema.nullish(),
});
export type AddInventoryItemInput = z.infer<typeof AddInventoryItemInputSchema>;

export const UpdateInventoryItemInputSchema = McpWriteOptionsSchema.extend({
  item_id: z.number().int().positive(),
  level: z.number().int().min(0).max(15).optional(),
  skin: z.string().min(1).nullish(),
  quality: z.string().min(1).nullish(),
  rarity_pct: z.number().min(0).max(175).nullish(),
  rarity_tier: RarityTierSchema.nullish(),
  qty: z.number().int().min(1).max(99).optional(),
  display_name: z.string().min(1).nullish(),
  container: McpContainerDataInputSchema.nullish(),
}).refine((value) => Object.keys(value).some((key) => !['item_id', 'dry_run', 'confirm'].includes(key)), {
  message: 'At least one field must be changed',
});
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemInputSchema>;

export const RemoveInventoryItemInputSchema = McpWriteOptionsSchema.extend({
  item_id: z.number().int().positive(),
  qty: z.number().int().min(1).max(99).optional(),
});
export type RemoveInventoryItemInput = z.infer<typeof RemoveInventoryItemInputSchema>;

export const MoveInventoryItemInputSchema = McpWriteOptionsSchema.extend({
  item_id: z.number().int().positive(),
  target: McpPlacementTargetSchema,
  swap: z.boolean().default(false),
  allow_unverified: z.boolean().default(false),
});
export type MoveInventoryItemInput = z.infer<typeof MoveInventoryItemInputSchema>;

export const CreateStorageInputSchema = McpWriteOptionsSchema.extend({
  kind: WritableStorageKindSchema.default('stash'),
  name: z.string().trim().min(1).max(200),
  max_weight: z.number().positive().nullish(),
  sort_order: z.number().int().optional(),
});
export type CreateStorageInput = z.infer<typeof CreateStorageInputSchema>;

export const UpdateStorageInputSchema = McpWriteOptionsSchema.extend({
  storage_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  max_weight: z.number().positive().nullish(),
  sort_order: z.number().int().optional(),
}).refine((value) => Object.keys(value).some((key) => !['storage_id', 'dry_run', 'confirm'].includes(key)), {
  message: 'At least one field must be changed',
});
export type UpdateStorageInput = z.infer<typeof UpdateStorageInputSchema>;

export const DeleteStorageInputSchema = McpWriteOptionsSchema.extend({
  storage_id: z.number().int().positive(),
});
export type DeleteStorageInput = z.infer<typeof DeleteStorageInputSchema>;

export const AutoArrangeStorageInputSchema = McpWriteOptionsSchema.extend({
  storage_id: z.number().int().positive(),
});
export type AutoArrangeStorageInput = z.infer<typeof AutoArrangeStorageInputSchema>;

export const SetContainerArtifactsInputSchema = McpWriteOptionsSchema.extend({
  container_item_id: z.number().int().positive(),
  slots: z.array(z.number().int().positive().nullable()).max(20),
});
export type SetContainerArtifactsInput = z.infer<typeof SetContainerArtifactsInputSchema>;

export const SetWeaponModuleInputSchema = McpWriteOptionsSchema.extend({
  weapon_item_id: z.number().int().positive(),
  slot: ModuleSlotSchema,
  attachment_item_id: z.number().int().positive().nullable().default(null),
  allow_unverified: z.boolean().default(false),
});
export type SetWeaponModuleInput = z.infer<typeof SetWeaponModuleInputSchema>;

export const SetItemLayoutInputSchema = McpWriteOptionsSchema.extend({
  item_id: z.number().int().positive(),
  width: z.number().int().min(1).max(20),
  height: z.number().int().min(1).max(20),
  weight: z.number().nonnegative().nullable().default(null),
});
export type SetItemLayoutInput = z.infer<typeof SetItemLayoutInputSchema>;

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

export const SyncRequestSchema = z.object({
  source: SyncSourceSchema.default('all'),
  force: z.boolean().default(false),
});

export type SyncRequest = z.infer<typeof SyncRequestSchema>;
