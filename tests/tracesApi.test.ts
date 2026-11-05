import { describe, expect, test } from 'bun:test';
import {
  buildTraceParams,
  normalizeBlock,
  normalizeErrors,
  normalizeLimits,
  normalizePrices,
  normalizeProjects,
  normalizeSessionDetail,
  normalizeSessions,
  normalizeStats,
  normalizeTracesConfig,
  normalizeTurnDetail,
  serializePriceOverrides,
} from '../src/services/api/traces';
import { createMockTracesApi } from '../src/features/traces/dev/mockTracesApi';

describe('traces API normalizers', () => {
  test('fill safe defaults for missing fields', () => {
    const stats = normalizeStats({ groups: [{ key: 'p' }, { label: 'no key' }], buckets: [{ start: 's' }] });
    expect(stats.totals.cost_usd).toBeNull();
    expect(stats.totals.tokens.total).toBe(0);
    expect(stats.groups).toEqual([
      {
        key: 'p',
        label: 'p',
        cost_usd: null,
        tokens: { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, total: 0 },
        turns: 0,
        sessions: 0,
        active_ms: 0,
      },
    ]);
    expect(stats.buckets).toEqual([{ start: 's', groups: {} }]);
    expect(normalizeSessions(undefined)).toEqual({
      total: 0,
      summary: { turns: 0, active_ms: 0, cost_usd: null },
      sessions: [],
    });
  });

  test('keep null cost as unknown, never zero', () => {
    const sessions = normalizeSessions({ sessions: [{ id: 'a', cost_usd: null }, { id: 'b', cost_usd: 0 }] });
    expect(sessions.sessions.map((session) => session.cost_usd)).toEqual([null, 0]);
  });

  test('keep known project sources and blank out unknown or missing ones', () => {
    const sessions = normalizeSessions({
      sessions: [
        { id: 'a', project_source: 'remote' },
        { id: 'b', project_source: 'guess' },
        { id: 'c' },
      ],
    });
    expect(sessions.sessions.map((session) => session.project_source)).toEqual(['remote', '', '']);
  });

  test('read both diff shapes and reject unknown block kinds', () => {
    expect(normalizeBlock({ kind: 'tool_call', diff: { file: 'a.go', old: 'x', new: 'y' } })?.diff).toEqual({
      file: 'a.go',
      old: 'x',
      new: 'y',
    });
    expect(normalizeBlock({ kind: 'tool_call', diff: { file: 'a.go', patch: '+x' } })?.diff).toEqual({
      file: 'a.go',
      patch: '+x',
    });
    expect(normalizeBlock({ kind: 'nonsense', text: 't' })?.kind).toBe('system');
    expect(() => normalizeTurnDetail({})).toThrow();
    expect(() => normalizeSessionDetail({ session: {} })).toThrow();
  });

  test('read the traces config block with its kebab-case keys', () => {
    expect(
      normalizeTracesConfig({
        capture: 'full',
        'idle-gap': '10m',
        retention: { 'content-max-age': '365d', 'content-max-size': '20GB' },
        'redact-secrets': true,
        prices: { source: '', refresh: '24h' },
      })
    ).toEqual({
      capture: 'full',
      idle_gap: '10m',
      content_max_age: '365d',
      content_max_size: '20GB',
      redact_secrets: true,
      prices_source: '',
      prices_refresh: '24h',
    });
    expect(normalizeTracesConfig(null).capture).toBeNull();
  });

  test('price overrides are written with the config field names', () => {
    expect(
      serializePriceOverrides([
        { model: ' claude-* ', input: 3, output: 15, cache_read: 0.3, cache_write_5m: null, cache_write_1h: 6 },
      ])
    ).toEqual([{ model: 'claude-*', input: 3, output: 15, 'cache-read': 0.3, 'cache-write-1h': 6 }]);
  });

  test('query params drop empty filters', () => {
    expect(
      buildTraceParams({ from: 'f', project: [], q: undefined }, { limit: 25, include_subagents: false }).toString()
    ).toBe('from=f&limit=25&include_subagents=false');
  });

  test('query params repeat list filters', () => {
    expect(buildTraceParams({ tag: ['a', 'b c'], project: ['p'] }).toString()).toBe('tag=a&tag=b+c&project=p');
  });
});

describe('traces mock API matches the wire contract', () => {
  // Every mock response must survive the normalizer unchanged: then the mock has
  // exactly the spec's fields and types, and the normalizers keep all of them.
  const api = createMockTracesApi();
  const filters = { from: '2026-10-05T16:00:00.000Z', to: '2026-11-04T16:00:00.000Z' };

  test('stats, projects, sessions and errors', async () => {
    const stats = await api.getStats(filters, { group: 'project', bucket: 'day' });
    expect(normalizeStats(stats)).toEqual(stats);
    // 30 days that start mid-day touch 31 calendar-day buckets.
    expect(stats.buckets.length).toBe(31);
    const projects = await api.getProjects(filters);
    expect(normalizeProjects(projects)).toEqual(projects);
    const sessions = await api.getSessions(filters, { limit: 10, sort: 'cost', order: 'desc' });
    expect(normalizeSessions(sessions)).toEqual(sessions);
    expect(sessions.sessions).toHaveLength(10);
    const errors = await api.getErrors(filters, { limit: 50, offset: 0 });
    expect(normalizeErrors(errors)).toEqual(errors);
    expect(errors.items.some((item) => item.recovered)).toBe(true);
  });

  test('session, turn, limits and prices', async () => {
    const { sessions } = await api.getSessions(filters, { limit: 1 });
    const session = await api.getSession(sessions[0].id);
    expect(normalizeSessionDetail(session)).toEqual(session);
    const turn = await api.getTurn(session.turns[1].id);
    expect(normalizeTurnDetail(turn)).toEqual(turn);
    const limits = await api.getLimits(filters);
    expect(normalizeLimits(limits)).toEqual(limits);
    const prices = await api.getPrices();
    expect(normalizePrices(prices)).toEqual(prices);
  });

  test('stats groups stop at eight plus Other', async () => {
    const stats = await api.getStats(filters, { group: 'project', bucket: 'day' });
    expect(stats.groups.length).toBeLessThanOrEqual(9);
    const costs = stats.groups.filter((group) => group.key !== '__other__').map((group) => group.cost_usd ?? 0);
    expect([...costs].sort((a, b) => b - a)).toEqual(costs);
  });
});
