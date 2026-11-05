/**
 * Number, money, duration and date formatting for the Traces pages.
 * Pure functions: the locale is always passed in, so tests are deterministic.
 */

const numberFormatters = new Map<string, Intl.NumberFormat>();

const getNumberFormat = (locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat => {
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  let formatter = numberFormatters.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, options);
    } catch {
      formatter = new Intl.NumberFormat('en', options);
    }
    numberFormatters.set(cacheKey, formatter);
  }
  return formatter;
};

/**
 * USD amount. Amounts of 100 and more drop the cents; tiny non-zero amounts show as
 * "<$0.01" so they never read as free.
 */
export function formatUsd(value: number, locale: string): string {
  if (!Number.isFinite(value)) return getNumberFormat(locale, usdOptions(2)).format(0);
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) {
    return `<${getNumberFormat(locale, usdOptions(2)).format(value < 0 ? -0.01 : 0.01)}`;
  }
  return getNumberFormat(locale, usdOptions(abs >= 100 ? 0 : 2)).format(value);
}

const usdOptions = (digits: number): Intl.NumberFormatOptions => ({
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

/** USD price per 1M tokens: at least two and up to four decimals ($0.125, $3.00). */
export function formatUsdPrice(value: number, locale: string): string {
  return getNumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(value) ? value : 0);
}

/** USD amount for axis ticks: compact and without cents above $10. */
export function formatUsdTick(value: number, locale: string): string {
  const abs = Math.abs(value);
  if (abs >= 10_000) {
    return getNumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return getNumberFormat(locale, usdOptions(abs >= 10 || value === 0 ? 0 : 2)).format(value);
}

/** Plain count with locale grouping: 1,942. */
export function formatCount(value: number, locale: string): string {
  return getNumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  );
}

/** Compact count for token totals: 684.2M (localized, for example 6.8억 in Korean). */
export function formatCompact(value: number, locale: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 1000) return formatCount(safe, locale);
  return getNumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(safe);
}

/**
 * Share as a percentage: `ratio` is 0..1. Shares under 10% keep one decimal so small
 * values such as output share (1.9%) stay visible.
 */
export function formatShare(ratio: number, locale: string): string {
  const safe = Number.isFinite(ratio) ? ratio : 0;
  const digits = safe !== 0 && Math.abs(safe) < 0.1 ? 1 : 0;
  return getNumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(safe);
}

/** A percent value that is already 0..100 (plan limit windows). */
export function formatPercentValue(value: number, locale: string): string {
  return getNumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    (Number.isFinite(value) ? value : 0) / 100
  );
}

/** Decimal number with up to `digits` fraction digits. */
export function formatDecimal(value: number, locale: string, digits = 1): string {
  return getNumberFormat(locale, { maximumFractionDigits: digits }).format(
    Number.isFinite(value) ? value : 0
  );
}

export function formatBytes(bytes: number, locale: string): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let scaled = safe;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${formatDecimal(scaled, locale, unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Duration split into the parts a translated template needs. */
export type DurationParts =
  | { kind: 'hours_minutes'; h: string; m: string }
  | { kind: 'minutes'; m: string }
  | { kind: 'seconds'; s: string };

/**
 * Splits a duration for display: "1 h 12 m", "34 m", "18 s", "4.2 s".
 * Minutes are padded when shown after hours ("1 h 05 m").
 */
export function durationParts(ms: number, locale: string): DurationParts {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (safe < 60_000) {
    const seconds = safe / 1000;
    return { kind: 'seconds', s: formatDecimal(seconds, locale, seconds < 10 ? 1 : 0) };
  }
  const totalMinutes = Math.round(safe / 60_000);
  if (totalMinutes < 60) return { kind: 'minutes', m: formatCount(totalMinutes, locale) };
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    kind: 'hours_minutes',
    h: formatCount(hours, locale),
    m: String(minutes).padStart(2, '0'),
  };
}

/** Hours with one decimal for totals: 63.5. Returns the number part only. */
export function hoursValue(ms: number, locale: string): string {
  const hours = (Number.isFinite(ms) && ms > 0 ? ms : 0) / 3_600_000;
  return formatDecimal(hours, locale, hours < 100 ? 1 : 0);
}

/**
 * Relative change against the previous period, as a signed ratio, or null when the
 * previous value is zero or unknown (no comparison is possible).
 */
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / previous;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

const getDateFormat = (locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale, options);
    } catch {
      formatter = new Intl.DateTimeFormat('en', options);
    }
    dateFormatters.set(cacheKey, formatter);
  }
  return formatter;
};

export const parseTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** "Nov 4, 14:02" in the local time zone. */
export function formatDateTime(
  value: string | null,
  locale: string,
  timeZone?: string
): string | null {
  const time = parseTime(value);
  if (time === null) return null;
  return getDateFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(time);
}

/** "Nov 4" in the local time zone. */
export function formatDay(value: string | number | null, locale: string, timeZone?: string) {
  const time = typeof value === 'number' ? value : parseTime(value);
  if (time === null) return null;
  return getDateFormat(locale, { month: 'short', day: 'numeric', timeZone }).format(time);
}

/** "14:27" or "14:27:41" in the local time zone. */
export function formatClock(
  value: string | number | null,
  locale: string,
  options: { seconds?: boolean; timeZone?: string } = {}
): string | null {
  const time = typeof value === 'number' ? value : parseTime(value);
  if (time === null) return null;
  return getDateFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: options.seconds ? '2-digit' : undefined,
    hour12: false,
    timeZone: options.timeZone,
  }).format(time);
}

/** "Saturday, 09:00" for a reset time within a week, else "Nov 12, 09:00". */
export function formatResetTime(
  value: string | null,
  locale: string,
  now: number,
  timeZone?: string
): string | null {
  const time = parseTime(value);
  if (time === null) return null;
  const sameWeek = time - now < 6 * 86_400_000 && time >= now;
  return getDateFormat(locale, {
    weekday: sameWeek ? 'long' : undefined,
    month: sameWeek ? undefined : 'short',
    day: sameWeek ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(time);
}

/** Shortens a long ID for table display: first 8 characters. */
/** First 8 characters of an ID, after any `provider:` prefix (for example `claude:<uuid>`). */
export const shortId = (id: string): string => {
  const bare = id.slice(id.lastIndexOf(':') + 1) || id;
  return bare.length > 8 ? bare.slice(0, 8) : bare;
};
