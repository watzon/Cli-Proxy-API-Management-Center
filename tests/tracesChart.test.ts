import { describe, expect, test } from 'bun:test';
import type { TraceStats, TraceTotals } from '../src/services/api/traces';
import {
  axisTicks,
  buildStackedChart,
  niceCeil,
  OTHER_GROUP_KEY,
  peakIndex,
  xLabelIndexes,
} from '../src/features/traces/chart';

const totals: TraceTotals = {
  cost_usd: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, total: 0 },
  active_ms: 0,
  model_ms: 0,
  sessions: 0,
  subagent_sessions: 0,
  turns: 0,
  failed_turns: 0,
  recovered_turns: 0,
  unpriced_turns: 0,
};

const group = (key: string, label = key, cost: number | null = 1) => ({
  key,
  label,
  cost_usd: cost,
  tokens: totals.tokens,
  turns: 1,
  sessions: 1,
  active_ms: 1,
});

const stats = (overrides: Partial<TraceStats>): TraceStats => ({
  from: '2026-11-01T00:00:00Z',
  to: '2026-11-04T00:00:00Z',
  totals,
  previous: totals,
  groups: [],
  buckets: [],
  ...overrides,
});

describe('traces stacked chart mapping', () => {
  const input = stats({
    groups: [group('api', 'API'), group('web', 'Web'), group(OTHER_GROUP_KEY, 'Other (3)')],
    buckets: [
      {
        start: '2026-11-01T00:00:00Z',
        groups: {
          api: { cost_usd: 10, tokens: 1000, active_ms: 60_000 },
          web: { cost_usd: 5, tokens: 500, active_ms: 30_000 },
          [OTHER_GROUP_KEY]: { cost_usd: 1, tokens: 100, active_ms: 1000 },
        },
      },
      {
        start: '2026-11-02T00:00:00Z',
        groups: {
          web: { cost_usd: 7, tokens: 700, active_ms: 0 },
          // Not in `groups`: must be folded into "Other".
          stray: { cost_usd: 2, tokens: 200, active_ms: 0 },
        },
      },
      { start: '2026-11-03T00:00:00Z', groups: {} },
    ],
  });

  test('keeps series order, puts Other last with the neutral color', () => {
    const chart = buildStackedChart(input, 'cost');
    expect(chart.series.map((series) => series.key)).toEqual(['api', 'web', OTHER_GROUP_KEY]);
    expect(chart.series.map((series) => series.colorSlot)).toEqual([1, 2, 0]);
    expect(chart.series.find((series) => series.key === OTHER_GROUP_KEY)?.label).toBe('Other (3)');
  });

  test('stacks segments bottom first and folds unknown keys into Other', () => {
    const chart = buildStackedChart(input, 'cost');
    expect(chart.bars[0].segments).toEqual([
      { key: 'api', value: 10 },
      { key: 'web', value: 5 },
      { key: OTHER_GROUP_KEY, value: 1 },
    ]);
    expect(chart.bars[1].segments).toEqual([
      { key: 'web', value: 7 },
      { key: OTHER_GROUP_KEY, value: 2 },
    ]);
    expect(chart.bars[2]).toEqual({ start: '2026-11-03T00:00:00Z', total: 0, segments: [] });
    expect(chart.series.map((series) => series.total)).toEqual([10, 12, 3]);
  });

  test('scales the axis to a round number above the tallest bar', () => {
    const chart = buildStackedChart(input, 'cost');
    expect(chart.max).toBe(20);
    expect(chart.ticks).toEqual([20, 15, 10, 5, 0]);
    expect(peakIndex(chart)).toBe(0);
  });

  test('switches the measured value with the metric', () => {
    expect(buildStackedChart(input, 'tokens').bars[0].total).toBe(1600);
    expect(buildStackedChart(input, 'active').bars[0].total).toBe(91_000);
  });

  test('adds an Other series when only a bucket has an unknown key', () => {
    const chart = buildStackedChart(
      stats({
        groups: [group('api')],
        buckets: [{ start: 'b1', groups: { lost: { cost_usd: 3, tokens: 0, active_ms: 0 } } }],
      }),
      'cost'
    );
    expect(chart.series.map((series) => series.key)).toEqual(['api', OTHER_GROUP_KEY]);
    expect(chart.series[1].label).toBe(OTHER_GROUP_KEY);
  });

  test('flags unknown cost so the view can say the bars are a lower bound', () => {
    const chart = buildStackedChart(
      stats({
        groups: [group('api', 'API', null)],
        buckets: [{ start: 'b1', groups: { api: { cost_usd: null, tokens: 5, active_ms: 0 } } }],
      }),
      'cost'
    );
    expect(chart.hasUnknownCost).toBe(true);
    expect(chart.bars[0].total).toBe(0);
    expect(buildStackedChart(input, 'cost').hasUnknownCost).toBe(false);
  });

  test('cycles palette slots after eight series', () => {
    const many = stats({ groups: Array.from({ length: 9 }, (_, index) => group(`g${index}`)) });
    expect(buildStackedChart(many, 'cost').series.map((series) => series.colorSlot)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 1,
    ]);
  });
});

describe('traces chart axis helpers', () => {
  test('nice ceilings', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(0.7)).toBe(1);
    expect(niceCeil(13)).toBe(20);
    expect(niceCeil(230)).toBe(250);
    expect(niceCeil(250)).toBe(250);
    expect(niceCeil(4100)).toBe(5000);
    expect(axisTicks(100)).toEqual([100, 75, 50, 25, 0]);
  });

  test('x labels are spread out and always include the last bar', () => {
    expect([...xLabelIndexes(0)]).toEqual([]);
    expect([...xLabelIndexes(1)]).toEqual([0]);
    const thirty = [...xLabelIndexes(30)].sort((a, b) => a - b);
    expect(thirty[0]).toBe(0);
    expect(thirty[thirty.length - 1]).toBe(29);
    expect(thirty.length).toBeLessThanOrEqual(7);
    for (let index = 1; index < thirty.length; index += 1) {
      expect(thirty[index] - thirty[index - 1]).toBeGreaterThanOrEqual(3);
    }
  });
});
