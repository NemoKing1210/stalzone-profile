export type RankKey = 'default' | 'newbie' | 'stalker' | 'veteran' | 'master' | 'legend';

export const RANK_ORDER: RankKey[] = ['default', 'newbie', 'stalker', 'veteran', 'master', 'legend'];

export const RANK_RU: Record<RankKey, string> = {
  default: 'Отмычка',
  newbie: 'Новичок',
  stalker: 'Сталкер',
  veteran: 'Ветеран',
  master: 'Мастер',
  legend: 'Легенда',
};

/** CSS tokens, so a rank border follows the active light/dark theme. */
export const RANK_COLOR: Record<RankKey, string> = {
  default: 'var(--sz-rank-default)',
  newbie: 'var(--sz-rank-newbie)',
  stalker: 'var(--sz-rank-stalker)',
  veteran: 'var(--sz-rank-veteran)',
  master: 'var(--sz-rank-master)',
  legend: 'var(--sz-rank-legend)',
};

export const QUALITY_ORDER = ['Обычный', 'Необычный', 'Особый', 'Редкий', 'Исключительный', 'Легендарный'];

export const CAT_RU: Record<string, string> = {
  'weapon/pistol': 'Пистолеты',
  'weapon/submachine_gun': 'ПП',
  'weapon/assault_rifle': 'Автоматы',
  'weapon/machine_gun': 'Пулемёты',
  'weapon/sniper_rifle': 'Снайперские',
  'weapon/shotgun_rifle': 'Дробовики',
  'weapon/melee': 'Ближний бой',
  'weapon/heavy': 'Тяжёлое',
  'weapon/device': 'Устройства',
  'armor/combat': 'боевая',
  'armor/combined': 'комбинированная',
  'armor/scientific': 'научная',
  'artefact/gravity': 'гравитационный',
  'artefact/electrophysical': 'электрофизический',
  'artefact/biochemical': 'биохимический',
  'artefact/thermal': 'термический',
  'artefact/other': 'прочий',
};

export const TYPE_ORDER = [
  'Автоматы',
  'Пулемёты',
  'Снайперские винтовки',
  'Дробовики',
  'ПП',
  'Пистолеты',
  'Ближний бой',
  'Тяжёлое',
  'Устройства',
  'Прочее',
];

export const ARMOR_ORDER = ['боевая', 'комбинированная', 'научная', 'прочее'];

export const ART_ORDER = ['гравитационный', 'электрофизический', 'биохимический', 'термический', 'прочий'];

const RANK_ALIASES: Record<string, RankKey> = {
  default: 'default',
  rank_default: 'default',
  newbie: 'newbie',
  rank_newbie: 'newbie',
  stalker: 'stalker',
  rank_stalker: 'stalker',
  veteran: 'veteran',
  rank_veteran: 'veteran',
  master: 'master',
  rank_master: 'master',
  legend: 'legend',
  legendary: 'legend',
  rank_legend: 'legend',
};

/** Normalizes EXBO (`RANK_MASTER`) and profile (`master`) rank spellings. */
export function rankKey(raw: string | null | undefined): RankKey | null {
  if (!raw) return null;
  return RANK_ALIASES[String(raw).trim().toLowerCase()] ?? null;
}

export function rankRu(raw: string | null | undefined): string {
  const key = rankKey(raw);
  return key ? RANK_RU[key] : '—';
}

export function rankColor(raw: string | null | undefined): string | null {
  const key = rankKey(raw);
  return key ? RANK_COLOR[key] : null;
}

export function qualityKey(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const i = QUALITY_ORDER.findIndex((q) => q.toLowerCase() === String(raw).trim().toLowerCase());
  return i === -1 ? null : i;
}

/** Artifact rarity tiers, ordered from the common roll to the best one. */
export const RARITY_TIERS = [
  'ordinary',
  'unordinary',
  'special',
  'rare',
  'exclusive',
  'legendary',
  'unique',
] as const;
export type RarityTierKey = (typeof RARITY_TIERS)[number];

/**
 * The tier an artifact's rarity percentage belongs to. The roll boundaries are the game's:
 * 100 / 115 / 130 / 145 / 160 / 175, with 175 itself reading as the top tier. A missing
 * percentage has no tier; the caller must not invent one.
 */
export function rarityTierForPct(pct: number | null | undefined): RarityTierKey | null {
  if (pct == null || !Number.isFinite(pct) || pct < 0) return null;
  if (pct <= 100) return 'ordinary';
  if (pct <= 115) return 'unordinary';
  if (pct <= 130) return 'special';
  if (pct <= 145) return 'rare';
  if (pct <= 160) return 'exclusive';
  if (pct < 175) return 'legendary';
  return 'unique';
}
