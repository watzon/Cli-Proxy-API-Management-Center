import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { buildStackedChart } from '../src/features/traces/chart';
import { StackedBarChart } from '../src/features/traces/components/StackedBarChart';
import { TraceTimeline } from '../src/features/traces/components/TraceTimeline';
import { createMockTracesApi } from '../src/features/traces/dev/mockTracesApi';
import { layoutTimeline } from '../src/features/traces/timeline';

let original = '';
beforeAll(async () => {
  original = i18n.language;
  await i18n.changeLanguage('en');
});
afterAll(async () => {
  await i18n.changeLanguage(original);
});

describe('traces timeline markup', () => {
  test('turns are real buttons with labels, one tab stop, and the selection marked', async () => {
    const api = createMockTracesApi();
    const { sessions } = await api.getSessions({}, { limit: 50 });
    const detail = await api.getSession(sessions.find((session) => session.subagents > 0)?.id ?? '');
    const layout = layoutTimeline(detail);
    const selected = layout.lanes[0].turns[1].id;
    const markup = renderToStaticMarkup(
      createElement(TraceTimeline, { layout, selectedId: selected, onSelect: () => {} })
    );
    const buttons = markup.match(/<button[^>]*data-turn-id[^>]*>/g) ?? [];
    expect(buttons.length).toBe(detail.turns.length);
    const tabStops = buttons.filter((button) => button.includes('tabindex="0"'));
    expect(tabStops).toHaveLength(1);
    expect(tabStops[0]).toContain(`data-turn-id="${selected}"`);
    expect(markup).toContain('aria-current="true"');
    expect(buttons.every((button) => /aria-label="[^"]+, turn \d+, /.test(button))).toBe(true);
    // Status is in the label text, not only in the color.
    expect(markup).toMatch(/aria-label="[^"]*, Retried"/);
    expect(markup).toContain(i18n.t('traces.timeline.legend_break'));
    expect(markup).toContain(i18n.t('traces.timeline.main_lane'));
  });
});

describe('traces chart markup', () => {
  test('the chart group carries a text summary', async () => {
    const api = createMockTracesApi();
    const stats = await api.getStats(
      { from: '2026-10-05T16:00:00.000Z', to: '2026-11-04T16:00:00.000Z' },
      { group: 'project', bucket: 'day' }
    );
    const chart = buildStackedChart(stats, 'cost');
    const markup = renderToStaticMarkup(
      createElement(StackedBarChart, {
        chart,
        description: 'API-equivalent cost by day',
        formatValue: (value: number) => `$${value.toFixed(2)}`,
        formatTick: (value: number) => `$${value}`,
        formatBucket: (start: string) => start.slice(5, 10),
      })
    );
    expect(markup).toMatch(
      /role="group" aria-label="API-equivalent cost by day\. 31 bars, total \$[\d.]+\. Highest: /
    );
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-live="polite"');
  });
});
