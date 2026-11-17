import { z } from 'zod';

export const EffectiveStatSchema = z.object({
  value: z.union([z.number(), z.string()]),
  origin: z.enum(['api', 'manual']),
  fetchedAt: z.string(),
});
export type EffectiveStat = z.infer<typeof EffectiveStatSchema>;

export const DerivedCharacterFieldsSchema = z.object({
  arrived: z.string().nullable(),
  hours: z.number().nullable(),
  kd: z.number().nullable(),
  accuracy: z.number().nullable(),
  headshot: z.number().nullable(),
  achievements: z.number().nullable(),
  achievementPoints: z.null(),
});
export type DerivedCharacterFields = z.infer<typeof DerivedCharacterFieldsSchema>;

export const CharacterReadSchema = DerivedCharacterFieldsSchema.extend({
  id: z.number().int(),
  nick: z.string(),
  region: z.string(),
  faction: z.string().nullable().optional(),
  alliance: z.string().nullable().optional(),
  clanName: z.string().nullable().optional(),
  clanRank: z.string().nullable().optional(),
  money: z.number().nullable().optional(),
  maxMoney: z.number().nullable().optional(),
  stash: z.string().nullable().optional(),
  playstyle: z.string().nullable().optional(),
  stats: z.record(z.string(), z.union([z.number(), z.string()])),
});
export type CharacterRead = z.infer<typeof CharacterReadSchema>;
