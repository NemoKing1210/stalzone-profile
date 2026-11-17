import { z } from 'zod';

export const BuildMetricReadSchema = z.object({
  l: z.string(),
  v: z.string().nullable(),
  s: z.string().nullable(),
});
export type BuildMetricRead = z.infer<typeof BuildMetricReadSchema>;

export const BuildSlotReadSchema = z.object({
  name: z.string(),
  q: z.string().nullable(),
  price: z.number().nullable(),
  lots: z.number().nullable(),
  eff: z.string().nullable(),
  bonus: z.string().nullable(),
  minus: z.string().nullable(),
  why: z.string().nullable(),
  rank: z.string(),
});
export type BuildSlotRead = z.infer<typeof BuildSlotReadSchema>;

export const BuildReadSchema = z.object({
  id: z.string(),
  short: z.string().nullable(),
  tag: z.string().nullable(),
  title: z.string(),
  goal: z.string().nullable(),
  container: z.string().nullable(),
  slots: z.number().nullable(),
  eff: z.number().nullable(),
  budget: z.number().nullable(),
  total: z.number().nullable(),
  metrics: z.array(BuildMetricReadSchema),
  rows: z.array(BuildSlotReadSchema),
  verdict: z.string().nullable(),
});
export type BuildRead = z.infer<typeof BuildReadSchema>;
