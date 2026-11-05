import { describe, expect, test } from 'bun:test';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filterStateKey,
  parseFilterState,
  parseLocalDate,
  pickBucket,
  resolveRange,
  toQueryFilters,
  writeFilterState,
  type TraceFilterState,
} from '../src/features/traces/filters';

const sample: TraceFilterState = {
  ...DEFAULT_FILTERS,
  range: 'custom',
  from: '2026-10-01',
  to: '2026-10-31',
  project: ['api-gateway'],
  folder: ['~/code'],
  model: ['claude-opus-5-5'],
  tag: ['client-a', 'oss'],
  status: 'error',
  q: 'refund webhook',
};

describe('traces URL filter state', () => {
  test('an empty query gives the defaults (last 30 days, nothing else)', () => {
    expect(parseFilterState('')).toEqual(DEFAULT_FILTERS);
    expect(writeFilterState(DEFAULT_FILTERS).toString()).toBe('');
  });

  test('round trips through the URL', () => {
    const query = writeFilterState(sample).toString();
    expect(parseFilterState(query)).toEqual(sample);
    expect(parseFilterState(new URLSearchParams(query))).toEqual(sample);
  });

  test('round trips every preset and leaves out the default range', () => {
    for (const range of ['today', '7d', 'week', 'month', '90d'] as const) {
      const state = { ...DEFAULT_FILTERS, range };
      expect(parseFilterState(writeFilterState(state).toString())).toEqual(state);
    }
    expect(writeFilterState({ ...DEFAULT_FILTERS, range: '30d' }).has('range')).toBe(false);
  });

  test('keeps parameters it does not own and resets the ones asked for', () => {
    const base = new URLSearchParams('turn=t-14&page=3&sort=cost&project=old');
    const next = writeFilterState({ ...DEFAULT_FILTERS, project: ['new'] }, base, ['page']);
    expect(next.get('turn')).toBe('t-14');
    expect(next.get('sort')).toBe('cost');
    expect(next.getAll('project')).toEqual(['new']);
    expect(next.has('page')).toBe(false);
  });

  test('list filters repeat in the URL and drop blanks and repeats', () => {
    expect(writeFilterState({ ...DEFAULT_FILTERS, tag: ['a', 'b'] }).toString()).toBe('tag=a&tag=b');
    const state = parseFilterState('tag=a&tag=+b+&tag=&tag=a&project=x');
    expect(state.tag).toEqual(['a', 'b']);
    expect(state.project).toEqual(['x']);
    expect(state.client).toEqual([]);
  });

  test('keeps at most the server limit of values per field', () => {
    const many = Array.from({ length: 60 }, (_, i) => `tag=t${i}`).join('&');
    expect(parseFilterState(many).tag).toHaveLength(50);
  });

  test('rejects bad values instead of guessing', () => {
    expect(parseFilterState('range=forever').range).toBe('30d');
    expect(parseFilterState('status=maybe').status).toBe('');
    const badCustom = parseFilterState('range=custom&from=2026-13-01&to=2026-10-31');
    expect(badCustom.range).toBe('30d');
    expect(badCustom.from).toBe('');
    // Dates outside a custom range are ignored.
    expect(parseFilterState('range=7d&from=2026-10-01').from).toBe('');
  });

  test('swaps a reversed custom range', () => {
    const state = parseFilterState('range=custom&from=2026-10-31&to=2026-10-01');
    expect(state.from).toBe('2026-10-01');
    expect(state.to).toBe('2026-10-31');
  });

  test('equal states give equal keys', () => {
    expect(filterStateKey({ ...sample })).toBe(filterStateKey(sample));
    expect(filterStateKey({ ...sample, q: 'other' })).not.toBe(filterStateKey(sample));
  });

  test('counts active filters besides range and search', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    // One per value: project, folder, model, two tags and the status.
    expect(activeFilterCount(sample)).toBe(6);
  });
});

describe('traces range resolution', () => {
  const now = new Date(2026, 10, 4, 16, 0, 0); // Wednesday, local time

  test('presets resolve against now', () => {
    const last7 = resolveRange({ ...DEFAULT_FILTERS, range: '7d' }, now);
    expect(now.getTime() - last7.from.getTime()).toBe(7 * 86_400_000);
    expect(last7.to).toEqual(now);
    expect(resolveRange({ ...DEFAULT_FILTERS, range: 'today' }, now).from).toEqual(
      new Date(2026, 10, 4)
    );
    expect(resolveRange({ ...DEFAULT_FILTERS, range: 'week' }, now).from).toEqual(
      new Date(2026, 10, 2)
    );
    expect(resolveRange({ ...DEFAULT_FILTERS, range: 'month' }, now).from).toEqual(
      new Date(2026, 10, 1)
    );
  });

  test('a custom range includes its last day', () => {
    const range = resolveRange(sample, now);
    expect(range.from).toEqual(new Date(2026, 9, 1));
    expect(range.to).toEqual(new Date(2026, 10, 1));
  });

  test('query filters carry RFC 3339 instants and only set values', () => {
    const query = toQueryFilters(sample, now);
    expect(query.from).toBe(new Date(2026, 9, 1).toISOString());
    expect(query.to).toBe(new Date(2026, 10, 1).toISOString());
    expect(query).toMatchObject({
      project: ['api-gateway'],
      folder: ['~/code'],
      model: ['claude-opus-5-5'],
      tag: ['client-a', 'oss'],
      status: 'error',
      q: 'refund webhook',
    });
    expect('client' in query).toBe(false);
  });

  test('bucket size follows the range length', () => {
    expect(pickBucket(resolveRange({ ...DEFAULT_FILTERS, range: 'today' }, now))).toBe('hour');
    expect(pickBucket(resolveRange(DEFAULT_FILTERS, now))).toBe('day');
    expect(pickBucket({ from: new Date(2026, 0, 1), to: new Date(2026, 9, 1) })).toBe('week');
  });

  test('parses only real local dates', () => {
    expect(parseLocalDate('2026-02-29')).toBeNull();
    expect(parseLocalDate('2028-02-29')).toEqual(new Date(2028, 1, 29));
    expect(parseLocalDate('yesterday')).toBeNull();
  });
});
