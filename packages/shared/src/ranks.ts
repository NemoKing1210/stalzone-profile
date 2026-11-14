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

export const RANK_COLOR: Record<RankKey, string> = {
  default: '#6f7767',
  newbie: '#63b356',
  stalker: '#4a9fd8',
  veteran: '#a06fc4',
  master: '#c2564f',
  legend: '#e0a63c',
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

/** Normalizes EXBO (`RANK_MASTER`) and dossier (`master`) rank spellings. */
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
