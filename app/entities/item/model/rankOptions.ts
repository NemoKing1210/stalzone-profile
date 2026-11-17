import { RANK_ORDER } from '@profile/shared/ranks';

export const ALL_RANKS = 'all';

export function rankOptions(t: (key: string) => string): { label: string; value: string }[] {
  return [
    { label: t('filters.allRanks'), value: ALL_RANKS },
    ...RANK_ORDER.map((key) => ({ label: t(`ranks.${key}`), value: key })),
  ];
}
