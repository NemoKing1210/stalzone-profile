import { z } from 'zod';

/** Read shape of a container override; a null field falls back to the item data. */
export const ContainerOverrideSchema = z.object({
  type: z.string().nullable(),
  shield: z.number().nullable(),
  bonus: z.string().nullable(),
  protection: z.number().nullable(),
  slots: z.number().nullable(),
  eff: z.number().nullable(),
});
export type ContainerOverride = z.infer<typeof ContainerOverrideSchema>;

export const OwnedReadSchema = z.object({
  id: z.number().int(),
  itemId: z.number().int(),
  name: z.string(),
  externalId: z.string().optional(),
  kind: z.string(),
  category: z.string().nullable().optional(),
  level: z.number().int(),
  quality: z.string().nullable(),
  note: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  slot: z.string().nullable().optional(),
  qty: z.number().int(),
  skinItemId: z.number().int().nullable().optional(),
  icon: z.string().nullable().optional(),
  container: ContainerOverrideSchema.nullable(),
  updatedAt: z.string().optional(),
});
export type OwnedRead = z.infer<typeof OwnedReadSchema>;

export const ContainerFillReadSchema = z.object({
  name: z.string(),
  lvl: z.number().int(),
});
export type ContainerFillRead = z.infer<typeof ContainerFillReadSchema>;

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
});
export type ContainerRead = z.infer<typeof ContainerReadSchema>;
