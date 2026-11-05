import { describe, expect, test } from 'bun:test';
import type { TraceAccountLimits } from '../src/services/api/traces';
import { buildDiffView, collapseContext, diffTexts, parsePatch } from '../src/features/traces/diff';
import {
  limitLevel,
  limitWarnings,
  parsePriceInput,
  pickTrendWindow,
  trendPoints,
  valueRatio,
  windowLabelKey,
} from '../src/features/traces/limits';
import { emptyDraft, overridesFromDrafts } from '../src/features/traces/prices';
import { moveItem, validateRule } from '../src/features/traces/rules';

describe('traces diff view', () => {
  test('line diff keeps context and marks changes', () => {
    expect(diffTexts('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'context', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
    expect(diffTexts('', 'new file')).toEqual([{ kind: 'add', text: 'new file' }]);
    expect(diffTexts('same\n', 'same')).toEqual([{ kind: 'context', text: 'same' }]);
  });

  test('patch text is parsed as is', () => {
    expect(parsePatch('*** Begin Patch\n@@ ctx\n-old\n+new\n keep')).toEqual([
      { kind: 'header', text: '*** Begin Patch' },
      { kind: 'hunk', text: '@@ ctx' },
      { kind: 'remove', text: 'old' },
      { kind: 'add', text: 'new' },
      { kind: 'context', text: 'keep' },
    ]);
  });

  test('long unchanged stretches collapse to one skip line', () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    const after = [...before];
    after[10] = 'changed';
    const lines = collapseContext(diffTexts(before.join('\n'), after.join('\n')));
    expect(lines[0]).toEqual({ kind: 'skip', text: '', skipped: 7 });
    expect(lines.filter((line) => line.kind === 'context')).toHaveLength(6);
    expect(lines[lines.length - 1]).toEqual({ kind: 'skip', text: '', skipped: 6 });
  });

  test('counts added and removed lines', () => {
    expect(buildDiffView({ file: 'a', old: 'x\ny', new: 'x\nz\nw' })).toMatchObject({ added: 2, removed: 1 });
    expect(buildDiffView({ file: 'b', patch: '+a\n+b\n-c' })).toMatchObject({ added: 2, removed: 1 });
  });
});

const account = (windows: Array<[string, number | null]>, history: TraceAccountLimits['history'] = []) =>
  ({
    account_id: 'acct',
    label: 'Claude, work',
    email: '',
    provider: 'claude',
    plan: null,
    tags: [],
    windows: windows.map(([name, used_pct]) => ({ name, used_pct, status: '', resets_at: null })),
    overage_status: null,
    history,
    usage: { turns: 0, tokens: 0, cost_usd: null },
    plan_price_usd: null,
  }) satisfies TraceAccountLimits;

describe('traces plan limits', () => {
  test('levels change at 70% and 85%', () => {
    expect(limitLevel(null)).toBe('unknown');
    expect(limitLevel(69.9)).toBe('normal');
    expect(limitLevel(70)).toBe('high');
    expect(limitLevel(84.9)).toBe('high');
    expect(limitLevel(85)).toBe('critical');
  });

  test('warns for every window at 85% or more, highest first', () => {
    const warnings = limitWarnings([account([['5h', 90], ['7d', 85]]), account([['5h', 84]])]);
    expect(warnings.map((warning) => [warning.windowName, warning.usedPct])).toEqual([
      ['5h', 90],
      ['7d', 85],
    ]);
  });

  test('known window names get labels; others fall back to the raw name', () => {
    expect(windowLabelKey('7d_oi')).toBe('traces.limits.window_7d_oi');
    expect(windowLabelKey('mystery')).toBeNull();
  });

  test('the trend uses the weekly window and places points by time', () => {
    const history = [
      { at: '2026-11-01T00:00:00Z', window: '7d', used_pct: 0 },
      { at: '2026-11-03T00:00:00Z', window: '7d', used_pct: 100 },
      { at: '2026-11-02T00:00:00Z', window: '7d', used_pct: 50 },
      { at: '2026-11-02T00:00:00Z', window: '5h', used_pct: 10 },
    ];
    expect(pickTrendWindow(account([['5h', 1], ['7d', 2]], history))).toBe('7d');
    expect(trendPoints(history, '7d', 400, 60)).toBe('0.0,60.0 200.0,33.0 400.0,6.0');
    expect(trendPoints([], '7d')).toBe('');
  });

  test('value ratio scales the monthly price to the range length', () => {
    expect(valueRatio(400, 200, 30.4375)).toBeCloseTo(2);
    expect(valueRatio(100, 200, 7)).toBeCloseTo(100 / (200 * (7 / 30.4375)));
    expect(valueRatio(null, 200, 30)).toBeNull();
    expect(valueRatio(10, 0, 30)).toBeNull();
    expect(valueRatio(10, null, 30)).toBeNull();
  });

  test('price input accepts plain amounts and empty', () => {
    expect(parsePriceInput('')).toEqual({ ok: true, value: null });
    expect(parsePriceInput(' $1,200.50 ')).toEqual({ ok: true, value: 1200.5 });
    expect(parsePriceInput('20')).toEqual({ ok: true, value: 20 });
    expect(parsePriceInput('-5').ok).toBe(false);
    expect(parsePriceInput('abc').ok).toBe(false);
  });
});

describe('traces project rules and price overrides', () => {
  test('rules need a match and a project, and {name} on both sides', () => {
    expect(validateRule({ match: '~/code/{name}', project: '{name}' })).toEqual([]);
    expect(validateRule({ match: ' ', project: '' })).toEqual(['match_required', 'project_required']);
    expect(validateRule({ match: '~/code', project: '{name}' })).toEqual(['name_without_capture']);
  });

  test('reordering moves one item and clamps at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  test('override drafts convert to numbers or report every problem', () => {
    const good = { ...emptyDraft(), model: 'claude-*', input: '3', output: '15' };
    expect(overridesFromDrafts([good])).toEqual({
      ok: true,
      overrides: [
        { model: 'claude-*', input: 3, output: 15, cache_read: null, cache_write_5m: null, cache_write_1h: null },
      ],
    });
    const result = overridesFromDrafts([good, { ...good, input: 'x' }, emptyDraft()]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        { kind: 'model_duplicate', index: 1 },
        { kind: 'price_invalid', index: 1, field: 'input' },
        { kind: 'model_required', index: 2 },
      ]);
    }
  });
});
