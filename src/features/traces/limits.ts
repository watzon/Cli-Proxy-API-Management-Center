/**
 * Plan limit helpers for the Accounts page and the Overview "Plan limits now" card.
 */

import type { TraceAccountLimits, TraceLimitSample } from '@/services/api/traces';
import { parseTime } from './format';

/** A window at or above this percent gets the warning banner and the critical color. */
export const LIMIT_WARN_PCT = 85;
/** A window at or above this percent gets the high color. */
export const LIMIT_HIGH_PCT = 70;

export type LimitLevel = 'normal' | 'high' | 'critical' | 'unknown';

export function limitLevel(usedPct: number | null): LimitLevel {
  if (usedPct === null) return 'unknown';
  if (usedPct >= LIMIT_WARN_PCT) return 'critical';
  if (usedPct >= LIMIT_HIGH_PCT) return 'high';
  return 'normal';
}

const KNOWN_WINDOWS = ['5h', '7d', '7d_oi', '7d_opus', '7d_sonnet', 'primary', 'secondary'];

/** i18n key suffix for a known window name, or null to show the raw name. */
export function windowLabelKey(name: string): string | null {
  return KNOWN_WINDOWS.includes(name) ? `traces.limits.window_${name}` : null;
}

/**
 * The window drawn in the 14-day trend: the weekly window when present (it moves
 * slowly enough to read as a trend), else the window with the most samples.
 */
export function pickTrendWindow(account: TraceAccountLimits): string | null {
  const names = account.windows.map((window) => window.name);
  for (const preferred of ['7d', 'secondary']) {
    if (names.includes(preferred)) return preferred;
  }
  const counts = new Map<string, number>();
  for (const sample of account.history) {
    counts.set(sample.window, (counts.get(sample.window) ?? 0) + 1);
  }
  let best: string | null = names[0] ?? null;
  let bestCount = -1;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/**
 * SVG polyline points for one window's samples, placed by time. The top 6 units of the
 * box are left free so the dashed 100% line stays visible.
 */
export function trendPoints(
  history: TraceLimitSample[],
  windowName: string,
  width = 400,
  height = 60
): string {
  const samples = history
    .filter((sample) => sample.window === windowName && sample.used_pct !== null)
    .map((sample) => ({ time: parseTime(sample.at), pct: sample.used_pct ?? 0 }))
    .filter((sample): sample is { time: number; pct: number } => sample.time !== null)
    .sort((a, b) => a.time - b.time);
  if (samples.length === 0) return '';
  const first = samples[0].time;
  const span = samples[samples.length - 1].time - first;
  const y = (pct: number) =>
    (height - (Math.min(100, Math.max(0, pct)) / 100) * (height - 6)).toFixed(1);
  if (span <= 0) return `0,${y(samples[0].pct)} ${width},${y(samples[0].pct)}`;
  return samples
    .map((sample) => `${(((sample.time - first) / span) * width).toFixed(1)},${y(sample.pct)}`)
    .join(' ');
}

export interface LimitWarning {
  account: TraceAccountLimits;
  windowName: string;
  usedPct: number;
  resetsAt: string | null;
}

/** Windows at or above the warning level, highest first. */
export function limitWarnings(accounts: TraceAccountLimits[]): LimitWarning[] {
  return accounts
    .flatMap((account) =>
      account.windows
        .filter((window) => window.used_pct !== null && window.used_pct >= LIMIT_WARN_PCT)
        .map((window) => ({
          account,
          windowName: window.name,
          usedPct: window.used_pct ?? 0,
          resetsAt: window.resets_at,
        }))
    )
    .sort((a, b) => b.usedPct - a.usedPct);
}

/**
 * API-equivalent cost over the range divided by the plan price for the same length of
 * time (the price is per month). Null when either side is unknown or the price is 0.
 */
export function valueRatio(
  costUsd: number | null,
  planPriceUsd: number | null,
  days: number
): number | null {
  if (costUsd === null || planPriceUsd === null || planPriceUsd <= 0 || days <= 0) return null;
  const priceForRange = planPriceUsd * (days / 30.4375);
  return costUsd / priceForRange;
}

export type PriceInput = { ok: true; value: number | null } | { ok: false };

/** Parses a user-typed USD amount. Empty means "no price". Accepts "1,234.50" and "$20". */
export function parsePriceInput(text: string): PriceInput {
  const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (cleaned === '') return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { ok: false };
  const value = Number(cleaned);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}
