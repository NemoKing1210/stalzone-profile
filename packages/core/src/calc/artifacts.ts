export interface ArtifactStat {
  key: string;
  label: string;
  min: number;
  max: number;
  mid: number;
  pos: boolean;
  pct: boolean;
  additional?: boolean;
}

export interface ArtifactSource {
  exboId: string;
  name: string;
  type: string;
  stats: ArtifactStat[];
  additional: ArtifactStat[];
}

export interface PriceQuote {
  price: number | null;
  quality: string | null;
  lots: number | null;
  source: string | null;
  updated?: string | null;
}

export interface PlanEffect {
  key: string;
  w?: number;
}

export type ArtifactPreset =
  | 'speed'
  | 'sprint'
  | 'stamina'
  | 'carry'
  | 'hp'
  | 'heal'
  | 'bullet'
  | 'recoil'
  | 'loot';

export const PRESETS: Record<ArtifactPreset, PlanEffect[]> = {
  speed: [
    { key: 'sprint_speed_modifier', w: 1 },
    { key: 'speed_modifier', w: 1 },
  ],
  sprint: [{ key: 'sprint_speed_modifier', w: 1 }],
  stamina: [
    { key: 'stamina_bonus', w: 1 },
    { key: 'stamina_regeneration_bonus', w: 1 },
  ],
  carry: [{ key: 'max_weight_bonus', w: 1 }],
  hp: [
    { key: 'health_bonus', w: 1 },
    { key: 'regeneration_bonus', w: 1 },
  ],
  heal: [
    { key: 'heal_efficiency', w: 1 },
    { key: 'regeneration_bonus', w: 1 },
  ],
  bullet: [{ key: 'bullet_dmg_factor', w: 1 }],
  recoil: [{ key: 'recoil_bonus', w: 1 }],
  loot: [
    { key: 'max_weight_bonus', w: 1 },
    { key: 'sprint_speed_modifier', w: 0.5 },
  ],
};

export interface PlanInput {
  preset?: ArtifactPreset;
  effects?: PlanEffect[];
  slots?: number;
  budget?: number;
  mode?: 'value' | 'max';
  quality?: string | null;
  unique?: boolean;
  requireLot?: boolean;
}

export interface PlanDeps {
  artifacts: ArtifactSource[];
  price: (name: string, quality?: string | null) => PriceQuote | null;
  pricesAgeMin?: () => number;
}

export interface PlanPick {
  item: ArtifactSource;
  name: string;
  score: number;
  price: number;
  quality: string | null;
  lots: number | null;
  src: string | null;
  perMln: number;
}

export interface PlanResult {
  effects: PlanEffect[];
  slots: number;
  budget: number;
  mode: 'value' | 'max';
  picked: PlanPick[];
  spent: number;
  left: number | null;
  totalScore: number;
  debuffs: Record<string, number>;
  pricesAgeMin: number;
}

export function artifactEffects(item: ArtifactSource): ArtifactStat[] {
  return item.stats;
}

export function artifactStat(item: ArtifactSource, key: string): ArtifactStat | null {
  return item.stats.find((s) => s.key === key) ?? item.additional.find((s) => s.key === key) ?? null;
}

export function artifactScore(item: ArtifactSource, effects: PlanEffect[]): number {
  let score = 0;
  for (const effect of effects) {
    const stat = artifactStat(item, effect.key);
    if (!stat || stat.mid == null) continue;
    score += stat.mid * (effect.w ?? 1);
  }
  return score;
}

export function planArtifactBuild(input: PlanInput, deps: PlanDeps): PlanResult {
  const effects = input.effects ?? PRESETS[input.preset ?? 'speed'];
  const slots = input.slots ?? 5;
  const budget = input.budget && input.budget > 0 ? input.budget : Number.POSITIVE_INFINITY;
  const unique = input.unique !== false;
  const mode = input.mode ?? 'value';
  const requireLot = input.requireLot === true;

  const candidates: PlanPick[] = [];
  for (const item of deps.artifacts) {
    const score = artifactScore(item, effects);
    if (!(score > 0)) continue;
    const quote = deps.price(item.name, input.quality ?? null);
    if (!quote?.price) continue;
    if (requireLot && quote.lots == null) continue;
    candidates.push({
      item,
      name: item.name,
      score,
      price: quote.price,
      quality: quote.quality,
      lots: quote.lots,
      src: quote.source,
      perMln: score / (quote.price / 1e6),
    });
  }

  candidates.sort((a, b) => (mode === 'max' ? b.score - a.score : b.perMln - a.perMln));

  const picked: PlanPick[] = [];
  let spent = 0;
  const used = new Set<string>();
  for (const candidate of candidates) {
    if (picked.length >= slots) break;
    if (unique && used.has(candidate.name)) continue;
    if (spent + candidate.price > budget) continue;
    picked.push(candidate);
    used.add(candidate.name);
    spent += candidate.price;
  }

  const totalScore = picked.reduce((sum, c) => sum + c.score, 0);
  const debuffs: Record<string, number> = {};
  for (const c of picked) {
    for (const stat of artifactEffects(c.item)) {
      if (!stat.pos) debuffs[stat.label] = (debuffs[stat.label] ?? 0) + stat.mid;
    }
  }

  return {
    effects,
    slots,
    budget,
    mode,
    picked,
    spent,
    left: Number.isFinite(budget) ? budget - spent : null,
    totalScore,
    debuffs,
    pricesAgeMin: deps.pricesAgeMin?.() ?? 0,
  };
}
