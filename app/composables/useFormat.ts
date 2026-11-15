import { fmtMoney, g1, g2, num } from '@dossier/shared/format';
import { RANK_COLOR, RANK_RU, rankKey } from '@dossier/shared/ranks';

export function useFormat() {
  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(date);
  };

  const formatAge = (minutes: number | null | undefined): string => {
    if (minutes == null) return 'нет данных';
    if (minutes < 60) return `${Math.max(0, Math.round(minutes))} мин`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)} ч`;
    return `${Math.round(minutes / (60 * 24))} дн`;
  };

  return {
    fmtMoney,
    g1,
    g2,
    num,
    formatDate,
    formatAge,
    rankRu: (raw: string | null | undefined) => (rankKey(raw) ? RANK_RU[rankKey(raw)!] : '—'),
    rankColor: (raw: string | null | undefined) => (rankKey(raw) ? RANK_COLOR[rankKey(raw)!] : null),
  };
}
