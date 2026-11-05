import { describe, expect, test } from 'bun:test';
import type { TraceSessionDetail, TraceTurn } from '../src/services/api/traces';
import { layoutTimeline, stepTurn } from '../src/features/traces/timeline';
import { createMockTracesApi } from '../src/features/traces/dev/mockTracesApi';

const T0 = Date.parse('2026-11-04T14:00:00Z');
const MIN = 60_000;

const turn = (
  id: string,
  sessionId: string,
  seq: number,
  startMin: number,
  durationMin: number,
  status: TraceTurn['status'] = 'ok'
): TraceTurn => ({
  id,
  seq,
  session_id: sessionId,
  started_at: new Date(T0 + startMin * MIN).toISOString(),
  ended_at: new Date(T0 + (startMin + durationMin) * MIN).toISOString(),
  latency_ms: durationMin * MIN,
  ttft_ms: null,
  model: 'm',
  served_model: 'm',
  provider: 'p',
  account: 'a',
  status,
  http_status: 200,
  error: null,
  attempts: 1,
  tokens: { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, total: 0 },
  cost_usd: 0,
  tool_names: [],
});

const detail = (overrides: Partial<TraceSessionDetail> = {}): TraceSessionDetail => ({
  session: {
    id: 'main',
    title: '',
    project: '',
    folder: '',
    client: '',
    client_version: '',
    model: '',
    key_label: '',
    tags: [],
    machine: '',
    turns: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, total: 0 },
    cost_usd: null,
    active_ms: 0,
    model_ms: 0,
    errors: 0,
    subagents: 0,
    parent_id: null,
    started_at: '',
    last_at: '',
    device_id: null,
    files_changed: 0,
    lines_added: 0,
    lines_removed: 0,
  },
  // Main: turns at 0, 10, 20 and (after a 60 minute break) 90. Subagent from turn 2.
  turns: [
    turn('m1', 'main', 1, 0, 2),
    turn('m2', 'main', 2, 10, 2, 'retried'),
    turn('s1', 'sub', 1, 13, 1),
    turn('s2', 'sub', 2, 15, 1),
    turn('m3', 'main', 3, 20, 2, 'error'),
    turn('m4', 'main', 4, 90, 10),
  ],
  lanes: [
    { session_id: 'main', label: '', parent_turn_id: null, turns: 4 },
    { session_id: 'sub', label: 'Explore subagent', parent_turn_id: 'm2', turns: 2 },
  ],
  breaks: [
    { from: new Date(T0 + 22 * MIN).toISOString(), to: new Date(T0 + 90 * MIN).toISOString() },
  ],
  ...overrides,
});

describe('traces timeline layout', () => {
  test('one lane per session, main first, with the parent turn of each subagent', () => {
    const layout = layoutTimeline(detail());
    expect(layout.lanes.map((lane) => [lane.sessionId, lane.isMain, lane.parentSeq])).toEqual([
      ['main', true, null],
      ['sub', false, 2],
    ]);
    expect(layout.lanes[0].turns.map((mark) => mark.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(layout.lanes[1].turns.map((mark) => mark.status)).toEqual(['ok', 'ok']);
    expect(layout.lanes[0].turns.map((mark) => mark.status)).toEqual(['ok', 'retried', 'error', 'ok']);
  });

  test('compresses a break to a narrow band so turns keep their space', () => {
    const layout = layoutTimeline(detail(), { breakShare: 0.05 });
    // Active time is 100 - 68 = 32 minutes; the 68 minute break is drawn as 5% of that.
    const total = 32 + 32 * 0.05;
    expect(layout.breaks).toHaveLength(1);
    expect(layout.breaks[0].durationMs).toBe(68 * MIN);
    expect(layout.breaks[0].left).toBeCloseTo((22 / total) * 100, 5);
    expect(layout.breaks[0].width).toBeCloseTo(((32 * 0.05) / total) * 100, 5);
    const m4 = layout.lanes[0].turns[3];
    expect(m4.left).toBeCloseTo(layout.breaks[0].left + layout.breaks[0].width, 5);
    expect(m4.left + m4.width).toBeCloseTo(100, 5);
  });

  test('the default band is 8% of active time, and all bands share at most 25%', () => {
    const one = layoutTimeline(detail());
    const total = 32 + 32 * 0.08;
    expect(one.breaks[0].width).toBeCloseTo(((32 * 0.08) / total) * 100, 5);

    // Five breaks of 60 minutes between six 2-minute turns: 12 active minutes.
    const turns = Array.from({ length: 6 }, (_, index) => turn(`t${index}`, 'main', index + 1, index * 62, 2));
    const breaks = Array.from({ length: 5 }, (_, index) => ({
      from: new Date(T0 + (index * 62 + 2) * MIN).toISOString(),
      to: new Date(T0 + (index + 1) * 62 * MIN).toISOString(),
    }));
    const five = layoutTimeline(detail({ turns, breaks, lanes: [] }));
    const bandShare = five.breaks.reduce((sum, gap) => sum + gap.width, 0);
    expect(bandShare).toBeCloseTo((12 * 0.25) / (12 + 12 * 0.25) * 100, 5);
  });

  test('places turns in time order without overlap inside a lane', () => {
    const layout = layoutTimeline(detail());
    for (const lane of layout.lanes) {
      for (let index = 1; index < lane.turns.length; index += 1) {
        const previous = lane.turns[index - 1];
        expect(lane.turns[index].left).toBeGreaterThanOrEqual(previous.left + previous.width - 1e-9);
      }
    }
    expect(layout.lanes[0].turns[0].left).toBe(0);
  });

  test('a turn from a session without a lane gets its own lane at the end', () => {
    const base = detail();
    const layout = layoutTimeline({ ...base, turns: [...base.turns, turn('x1', 'orphan', 1, 5, 1)] });
    expect(layout.lanes.map((lane) => lane.sessionId)).toEqual(['main', 'sub', 'orphan']);
  });

  test('ticks start at the session start and skip the break', () => {
    const layout = layoutTimeline(detail());
    expect(layout.ticks[0]).toEqual({ time: T0, left: 0 });
    const gap = layout.breaks[0];
    for (const tick of layout.ticks) {
      expect(tick.time <= gap.fromMs || tick.time >= gap.toMs).toBe(true);
    }
  });

  test('an empty session lays out nothing', () => {
    const layout = layoutTimeline(detail({ turns: [], breaks: [] }));
    expect(layout.lanes).toEqual([]);
    expect(stepTurn(layout, null, 'ArrowRight')).toBeNull();
  });

  test('works on the mock API data', async () => {
    const api = createMockTracesApi();
    const { sessions } = await api.getSessions({}, { limit: 50 });
    const withSubagents = sessions.find((session) => session.subagents === 2);
    expect(withSubagents).toBeDefined();
    const layout = layoutTimeline(await api.getSession(withSubagents?.id ?? ''));
    expect(layout.lanes).toHaveLength(3);
    expect(layout.lanes[1].parentSeq).not.toBeNull();
  });
});

describe('traces timeline keyboard movement', () => {
  const layout = layoutTimeline(detail());

  test('left and right stay in the lane', () => {
    expect(stepTurn(layout, 'm2', 'ArrowRight')).toBe('m3');
    expect(stepTurn(layout, 'm2', 'ArrowLeft')).toBe('m1');
    expect(stepTurn(layout, 'm1', 'ArrowLeft')).toBeNull();
    expect(stepTurn(layout, 'm4', 'ArrowRight')).toBeNull();
    expect(stepTurn(layout, 's1', 'ArrowRight')).toBe('s2');
  });

  test('home and end jump within the lane', () => {
    expect(stepTurn(layout, 'm3', 'Home')).toBe('m1');
    expect(stepTurn(layout, 'm1', 'End')).toBe('m4');
  });

  test('up and down move to the closest turn in time on the next lane', () => {
    expect(stepTurn(layout, 'm2', 'ArrowDown')).toBe('s1');
    expect(stepTurn(layout, 's2', 'ArrowUp')).toBe('m2');
    expect(stepTurn(layout, 's2', 'ArrowDown')).toBeNull();
    expect(stepTurn(layout, 'm1', 'ArrowUp')).toBeNull();
  });

  test('an unknown selection starts at the first turn', () => {
    expect(stepTurn(layout, null, 'ArrowRight')).toBe('m1');
    expect(stepTurn(layout, 'gone', 'ArrowDown')).toBe('m1');
  });
});
