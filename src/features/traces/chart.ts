/**
 * Maps `/traces/stats` buckets to stacked bars for the Overview chart.
 */

import type { TraceStats } from '@/services/api/traces';

export const CHART_METRICS = ['cost', 'tokens', 'active'] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];

export const CHART_GROUPS = ['project', 'model', 'client', 'key'] as const;
export type ChartGroup = (typeof CHART_GROUPS)[number];

export const OTHER_GROUP_KEY = '__other__';

/** Number of categorical series colors defined in the stylesheet. */
export const SERIES_COLOR_COUNT = 8;

/** CSS color for a palette slot (see `--trace-series-*` in Traces.module.scss). */
export const seriesColor = (slot: number): string => `var(--trace-series-${slot})`;

export interface ChartSeries {
  key: string;
  label: string;
  /** 1-based palette slot, or 0 for the neutral "Other" color. */
  colorSlot: number;
  total: number;
}

export interface ChartSegment {
  key: string;
  value: number;
}

export interface ChartBar {
  start: string;
  total: number;
  /** Segments in series order, bottom first. Zero values are left out. */
  segments: ChartSegment[];
}

export interface StackedChart {
  series: ChartSeries[];
  bars: ChartBar[];
  max: number;
  ticks: number[];
  /** True when some bucket had an unknown cost, so cost bars are a lower bound. */
  hasUnknownCost: boolean;
}

const bucketValue = (
  cell: { cost_usd: number | null; tokens: number; active_ms: number },
  metric: ChartMetric
): number => {
  switch (metric) {
    case 'cost':
      return cell.cost_usd ?? 0;
    case 'tokens':
      return cell.tokens;
    case 'active':
      return cell.active_ms;
    default: {
      const exhaustive: never = metric;
      return exhaustive;
    }
  }
};

/** Rounds `value` up to 1, 2, 2.5 or 5 times a power of ten. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * base + base * 1e-9) return step * base;
  }
  return 10 * base;
}

/** Axis ticks from the top down: max, 3/4, 1/2, 1/4, 0. */
export function axisTicks(max: number): number[] {
  return [max, (max * 3) / 4, max / 2, max / 4, 0];
}

/**
 * Builds stacked bars. Series follow the order of `stats.groups` (cost descending),
 * with `__other__` always last and neutral. A bucket key that is not in `groups` is
 * added to `__other__`.
 */
export function buildStackedChart(stats: TraceStats, metric: ChartMetric): StackedChart {
  const known = stats.groups.filter((group) => group.key !== OTHER_GROUP_KEY);
  const other = stats.groups.find((group) => group.key === OTHER_GROUP_KEY);
  const knownKeys = new Set(known.map((group) => group.key));

  let needsOther = Boolean(other);
  let hasUnknownCost = false;

  const bars: ChartBar[] = stats.buckets.map((bucket) => {
    const values = new Map<string, number>();
    for (const [key, cell] of Object.entries(bucket.groups)) {
      if (metric === 'cost' && cell.cost_usd === null) hasUnknownCost = true;
      const target = knownKeys.has(key) ? key : OTHER_GROUP_KEY;
      if (target === OTHER_GROUP_KEY) needsOther = true;
      values.set(target, (values.get(target) ?? 0) + bucketValue(cell, metric));
    }
    const order = [...known.map((group) => group.key), OTHER_GROUP_KEY];
    const segments = order
      .map((key) => ({ key, value: values.get(key) ?? 0 }))
      .filter((segment) => segment.value > 0);
    return {
      start: bucket.start,
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };
  });

  const totalFor = (key: string) =>
    bars.reduce(
      (sum, bar) => sum + (bar.segments.find((segment) => segment.key === key)?.value ?? 0),
      0
    );

  const series: ChartSeries[] = known.map((group, index) => ({
    key: group.key,
    label: group.label,
    colorSlot: (index % SERIES_COLOR_COUNT) + 1,
    total: totalFor(group.key),
  }));
  if (needsOther) {
    series.push({
      key: OTHER_GROUP_KEY,
      label: other?.label ?? OTHER_GROUP_KEY,
      colorSlot: 0,
      total: totalFor(OTHER_GROUP_KEY),
    });
  }

  const peak = bars.reduce((max, bar) => Math.max(max, bar.total), 0);
  const max = niceCeil(peak);
  return { series, bars, max, ticks: axisTicks(max), hasUnknownCost };
}

/** Which bars get an x-axis label: about five evenly spaced bars, always the last one. */
export function xLabelIndexes(count: number): Set<number> {
  const indexes = new Set<number>();
  if (count === 0) return indexes;
  const step = Math.max(1, Math.round(count / 5));
  for (let index = 0; index < count; index += step) indexes.add(index);
  // Avoid a crowded pair at the right edge.
  const last = count - 1;
  for (const index of indexes) {
    if (index !== last && last - index < step / 2) indexes.delete(index);
  }
  indexes.add(last);
  return indexes;
}

/** Index of the bar with the largest total, or -1 when there are no bars. */
export function peakIndex(chart: StackedChart): number {
  let best = -1;
  let bestValue = -1;
  chart.bars.forEach((bar, index) => {
    if (bar.total > bestValue) {
      best = index;
      bestValue = bar.total;
    }
  });
  return best;
}
