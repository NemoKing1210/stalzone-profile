import { dec, fmtMoney, g1, g2, num } from '@profile/shared/format';
import { RANK_COLOR, rankKey } from '@profile/shared/ranks';
import { formatDateValue } from '../lib/formatDateValue';
import { rankTextColor as rankTextColorValue } from '../lib/rankText';

export function useFormat() {
  const { locale, t } = useI18n();
  const intlLocale = computed(() => (locale.value === 'ru' ? 'ru-RU' : 'en-US'));

  const formatDate = (iso: string | null | undefined): string => formatDateValue(iso, intlLocale.value);

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
    rankTextColor: (raw: string | null | undefined) => rankTextColorValue(raw),
  };
}
