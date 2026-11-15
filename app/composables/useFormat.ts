import { dec, fmtMoney, g1, g2, num } from '@dossier/shared/format';
import { RANK_COLOR, rankKey } from '@dossier/shared/ranks';

export function useFormat() {
  const { locale, t } = useI18n();
  const intlLocale = computed(() => (locale.value === 'ru' ? 'ru-RU' : 'en-US'));

  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(intlLocale.value, { dateStyle: 'medium' }).format(date);
  };

  const formatAge = (minutes: number | null | undefined): string => {
    if (minutes == null) return t('common.noData');
    if (minutes < 60) return t('common.age.minutes', { count: Math.max(0, Math.round(minutes)) });
    if (minutes < 60 * 24) return t('common.age.hours', { count: Math.round(minutes / 60) });
    return t('common.age.days', { count: Math.round(minutes / (60 * 24)) });
  };

  return {
    fmtMoney: (value: number | null | undefined) => fmtMoney(value, intlLocale.value),
    g1: (value: number | null | undefined) => g1(value, intlLocale.value),
    g2: (value: number | null | undefined) => g2(value, intlLocale.value),
    dec: (value: number | null | undefined) => dec(value, intlLocale.value),
    num: (value: number | null | undefined) => num(value, intlLocale.value),
    formatDate,
    formatAge,
    rankLabel: (raw: string | null | undefined) => {
      const key = rankKey(raw);
      return key ? t(`ranks.${key}`) : '—';
    },
    rankColor: (raw: string | null | undefined) => {
      const key = rankKey(raw);
      return key ? RANK_COLOR[key] : null;
    },
  };
}
