import { RANK_ORDER, RANK_RU } from '@dossier/shared/ranks';

export const ALL_RANKS = 'all';

export function rankOptions(): { label: string; value: string }[] {
  return [
    { label: 'Все ранги', value: ALL_RANKS },
    ...RANK_ORDER.map((key) => ({ label: RANK_RU[key], value: key })),
  ];
}
