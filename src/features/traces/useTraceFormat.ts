import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  durationParts,
  formatBytes,
  formatClock,
  formatCompact,
  formatCount,
  formatDateTime,
  formatDay,
  formatPercentValue,
  formatShare,
  formatUsd,
  formatUsdPrice,
  formatUsdTick,
  hoursValue,
} from './format';

/** Formatting bound to the current UI language. Unknown values read "Unknown". */
export function useTraceFormat() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';

  return useMemo(() => {
    const none = t('traces.common.none');
    return {
      locale,
      money: (value: number | null) =>
        value === null ? t('traces.common.unknown') : formatUsd(value, locale),
      moneyTick: (value: number) => formatUsdTick(value, locale),
      price: (value: number) => formatUsdPrice(value, locale),
      count: (value: number) => formatCount(value, locale),
      compact: (value: number) => formatCompact(value, locale),
      share: (ratio: number) => formatShare(ratio, locale),
      percent: (value: number | null) =>
        value === null ? t('traces.common.unknown') : formatPercentValue(value, locale),
      duration: (ms: number) => {
        const parts = durationParts(ms, locale);
        return t(`traces.units.${parts.kind}`, parts);
      },
      hours: (ms: number) => t('traces.units.hours', { h: hoursValue(ms, locale) }),
      bytes: (value: number) => formatBytes(value, locale),
      dateTime: (value: string | null) => formatDateTime(value, locale) ?? none,
      day: (value: string | number | null) => formatDay(value, locale) ?? none,
      clock: (value: string | number | null, seconds = false) =>
        formatClock(value, locale, { seconds }) ?? none,
    };
  }, [locale, t]);
}

export type TraceFormat = ReturnType<typeof useTraceFormat>;
