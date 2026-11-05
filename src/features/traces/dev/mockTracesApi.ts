/**
 * DEV and TEST ONLY: an in-memory implementation of the Traces API with
 * deterministic sample data. Imported by tests and by the DEV-only preview route
 * (`/#/__preview/traces`); the production bundle never reaches it.
 * Copy here is sample data, not UI text, so it is not localized.
 */

import type {
  TraceAccountLimits,
  TraceBlock,
  TraceBucket,
  TraceErrorItem,
  TraceHealth,
  TracePriceOverride,
  TracePriceRow,
  TraceProject,
  TraceProjectRule,
  TraceQueryFilters,
  TraceSession,
  TraceSessionDetail,
  TraceStats,
  TraceStatsGroup,
  TraceStatsGroupRow,
  TraceTokens,
  TraceTotals,
  TraceTurn,
  TraceTurnDetail,
  TracesApi,
} from '@/services/api/traces';

export interface MockTracesOptions {
  enabled?: boolean;
  /** Fixed "now" so tests are deterministic. */
  now?: Date;
  /** Artificial delay per call, for looking at loading states. */
  latencyMs?: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Small seeded PRNG (mulberry32) so every run produces the same data. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROJECTS = [
  { id: 'api-gateway', name: 'api-gateway', key: '~/code/api-gateway', weight: 1.2 },
  { id: 'github.com/acme/web-portal', name: 'web-portal', key: 'github.com/acme/web-portal', weight: 1 },
  { id: 'github.com/acme/billing', name: 'billing', key: 'github.com/acme/billing', weight: 0.8 },
  { id: 'docs-site', name: 'docs-site', key: '~/code/docs-site', weight: 0.4 },
  { id: 'dotfiles', name: 'dotfiles', key: '~/dotfiles', weight: 0.2 },
  { id: 'unassigned', name: 'unassigned', key: 'no folder sent', weight: 0.05 },
];
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-6.1', 'claude-haiku-5-5', 'unpriced-model'];
const CLIENTS = ['claude-code', 'codex', 'opencode', 'omp'];
const KEYS = ['personal', 'work'];
const ACCOUNTS = ['claude-personal-1', 'claude-personal-2', 'claude-work', 'chatgpt-personal'];
const TITLES = [
  'Add credential tags to client keys',
  'Fix the plugin support header on Windows',
  'Tags column in the auth files table',
  'Refund webhook retries',
  'Checkout form validation',
  'Explain the session affinity code',
  'Migrate the invoices table',
  'Speed up shell startup',
  'Dark mode tokens for the portal',
  'Rate limit spike on the dashboard',
  'Retry budget for streaming',
  '',
];

const tokens = (input: number, output: number, cacheRead: number, cacheWrite: number): TraceTokens => ({
  input,
  output,
  reasoning: Math.round(output * 0.3),
  cache_read: cacheRead,
  cache_write_5m: cacheWrite,
  cache_write_1h: 0,
  total: input + output + cacheRead + cacheWrite,
});

const addTokens = (a: TraceTokens, b: TraceTokens): TraceTokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  reasoning: a.reasoning + b.reasoning,
  cache_read: a.cache_read + b.cache_read,
  cache_write_5m: a.cache_write_5m + b.cache_write_5m,
  cache_write_1h: a.cache_write_1h + b.cache_write_1h,
  total: a.total + b.total,
});

const EMPTY_TOKENS = tokens(0, 0, 0, 0);

const iso = (time: number) => new Date(time).toISOString();

interface MockState {
  health: TraceHealth;
  sessions: TraceSession[];
  details: Map<string, TraceSessionDetail>;
  rules: TraceProjectRule[];
  prices: TracePriceRow[];
  planPrices: Map<string, number | null>;
  projectNames: Map<string, string>;
}

function buildSessions(now: number): { sessions: TraceSession[]; details: Map<string, TraceSessionDetail> } {
  const random = createRandom(42);
  const sessions: TraceSession[] = [];
  const details = new Map<string, TraceSessionDetail>();
  for (let index = 0; index < 64; index += 1) {
    const project = PROJECTS[Math.floor(random() * random() * PROJECTS.length)];
    const model = MODELS[index % 9 === 4 ? 4 : Math.floor(random() * 4)];
    const startedAt = now - Math.floor(random() * 40 * DAY) - HOUR;
    const id = `${(0x1000_0000 + index * 7919).toString(16)}${index.toString(16).padStart(4, '0')}`;
    const subagentCount = index % 3 === 0 ? 2 : index % 5 === 0 ? 1 : 0;
    const timeline = buildTimeline({ id, startedAt, model, index, subagentCount, random });
    const main = timeline.turns.filter((turn) => turn.session_id === id);
    const all = timeline.turns;
    const sessionTokens = all.reduce((sum, turn) => addTokens(sum, turn.tokens), EMPTY_TOKENS);
    const unpriced = all.some((turn) => turn.cost_usd === null);
    const session: TraceSession = {
      id,
      title: TITLES[index % TITLES.length],
      project: project.name,
      folder: project.key.startsWith('~') ? project.key : `~/code/${project.name}`,
      client: CLIENTS[index % CLIENTS.length],
      client_version: index % CLIENTS.length === 0 ? '2.1.318' : '1.4.0',
      model,
      key_label: KEYS[index % 2],
      tags: index % 2 === 0 ? ['personal'] : ['work'],
      machine: index % 3 === 0 ? 'desk' : 'laptop',
      turns: main.length,
      tokens: sessionTokens,
      cost_usd: unpriced ? null : all.reduce((sum, turn) => sum + (turn.cost_usd ?? 0), 0),
      active_ms: main.length * 95_000,
      model_ms: all.reduce((sum, turn) => sum + turn.latency_ms, 0),
      errors: all.filter((turn) => turn.status === 'error').length,
      subagents: subagentCount,
      parent_id: null,
      started_at: iso(startedAt),
      last_at: iso(Date.parse(all[all.length - 1].ended_at)),
    };
    sessions.push(session);
    details.set(id, {
      ...timeline,
      session: {
        ...session,
        device_id: index % 4 === 0 ? 'device-1' : null,
        files_changed: 3 + (index % 5),
        lines_added: 40 + index * 3,
        lines_removed: 5 + index,
      },
    });
  }
  sessions.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  return { sessions, details };
}

function buildTimeline(input: {
  id: string;
  startedAt: number;
  model: string;
  index: number;
  subagentCount: number;
  random: () => number;
}): Omit<TraceSessionDetail, 'session'> {
  const { id, startedAt, model, index, subagentCount, random } = input;
  const turns: TraceTurn[] = [];
  const mainTurns = 8 + (index % 7) * 3;
  let time = startedAt;
  const breakAfter = mainTurns > 12 ? Math.floor(mainTurns / 2) : -1;
  let breakRange: { from: string; to: string } | null = null;
  const priced = model !== 'unpriced-model';

  const makeTurn = (sessionId: string, seq: number, start: number, latency: number): TraceTurn => {
    const status = seq === 5 && sessionId === id ? 'retried' : seq === 9 && sessionId === id && index % 2 === 0 ? 'error' : 'ok';
    const turnTokens = tokens(400 + Math.round(random() * 1500), 300 + Math.round(random() * 1800), 40_000 + Math.round(random() * 40_000), Math.round(random() * 3000));
    return {
      id: `${sessionId}-t${seq}`,
      seq,
      session_id: sessionId,
      started_at: iso(start),
      ended_at: iso(start + latency),
      latency_ms: latency,
      ttft_ms: Math.round(latency * 0.15),
      model,
      served_model: model,
      provider: model.startsWith('gpt') ? 'codex' : 'claude',
      account: ACCOUNTS[(index + seq) % ACCOUNTS.length],
      status,
      http_status: status === 'error' ? 529 : 200,
      error: status === 'error' ? 'upstream overloaded' : null,
      attempts: status === 'retried' ? 2 : 1,
      tokens: turnTokens,
      cost_usd: priced ? Number(((turnTokens.input * 5 + turnTokens.output * 25 + turnTokens.cache_read * 0.5 + turnTokens.cache_write_5m * 6.25) / 1e6).toFixed(4)) : null,
      tool_names: seq % 2 === 0 ? ['Edit'] : ['Bash'],
    };
  };

  for (let seq = 1; seq <= mainTurns; seq += 1) {
    const latency = 4_000 + Math.round(random() * 30_000);
    turns.push(makeTurn(id, seq, time, latency));
    time += latency + 20_000 + Math.round(random() * 60_000);
    if (seq === breakAfter) {
      breakRange = { from: iso(time), to: iso(time + 40 * 60_000) };
      time += 40 * 60_000;
    }
  }

  const lanes: TraceSessionDetail['lanes'] = [{ session_id: id, label: '', parent_turn_id: null, turns: mainTurns }];
  for (let sub = 1; sub <= subagentCount; sub += 1) {
    const parent = turns[Math.min(turns.length - 1, sub * 3)];
    const subId = `${id}-sub${sub}`;
    let subTime = Date.parse(parent.ended_at) + 2_000;
    const count = sub === 1 ? 5 : 2;
    for (let seq = 1; seq <= count; seq += 1) {
      const latency = 2_000 + Math.round(random() * 6_000);
      turns.push(makeTurn(subId, seq, subTime, latency));
      subTime += latency + 4_000;
    }
    lanes.push({ session_id: subId, label: sub === 1 ? 'Explore subagent' : 'Test runner subagent', parent_turn_id: parent.id, turns: count });
  }

  return { turns, lanes, breaks: breakRange ? [breakRange] : [] };
}

function buildPrices(): TracePriceRow[] {
  return [
    { model: 'claude-opus-5-5', input: 5, output: 25, cache_read: 0.5, cache_write_5m: 6.25, cache_write_1h: 10, origin: 'catalog' },
    { model: 'claude-sonnet-5-5', input: 3, output: 15, cache_read: 0.3, cache_write_5m: 3.75, cache_write_1h: 6, origin: 'catalog' },
    { model: 'claude-haiku-5-5', input: 1, output: 5, cache_read: 0.1, cache_write_5m: 1.25, cache_write_1h: 2, origin: 'catalog' },
    { model: 'gpt-6.1', input: 1.25, output: 10, cache_read: 0.125, cache_write_5m: null, cache_write_1h: null, origin: 'catalog' },
    { model: 'grok-*', input: 3, output: 15, cache_read: 0.75, cache_write_5m: null, cache_write_1h: null, origin: 'override' },
  ];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Builds the mock API. Each call gets its own state, so tests do not leak into each other. */
export function createMockTracesApi(options: MockTracesOptions = {}): TracesApi {
  const enabled = options.enabled ?? true;
  const nowMs = (options.now ?? new Date('2026-11-04T16:00:00Z')).getTime();
  const { sessions, details } = buildSessions(nowMs);
  const state: MockState = {
    health: {
      enabled,
      capture: 'full',
      queue_depth: 3,
      queue_size: 10_000,
      dropped_events: 0,
      dropped_content: 0,
      db_bytes: 184_320_000,
      content_bytes: 151_000_000,
      last_write_at: iso(nowMs - 40_000),
      oldest_turn_at: iso(nowMs - 40 * DAY),
      prices_updated_at: iso(nowMs - 5 * HOUR),
      prices_source: 'https://models.dev/api.json',
    },
    sessions,
    details,
    rules: [
      { match: '~/code/docs-site', project: 'docs-site' },
      { match: '~/code/{name}', project: '{name}' },
    ],
    prices: buildPrices(),
    planPrices: new Map([['claude-work', 200]]),
    projectNames: new Map(),
  };

  const delay = async () => {
    if (options.latencyMs) await sleep(options.latencyMs);
  };

  const inRange = (time: string, filters: TraceQueryFilters) => {
    const value = Date.parse(time);
    const from = filters.from ? Date.parse(filters.from) : nowMs - 30 * DAY;
    const to = filters.to ? Date.parse(filters.to) : nowMs;
    return value >= from && value < to;
  };

  const projectName = (name: string) => state.projectNames.get(name) ?? name;

  const matches = (session: TraceSession, filters: TraceQueryFilters) =>
    (!filters.project || projectName(session.project) === filters.project || session.project === filters.project) &&
    (!filters.client || session.client === filters.client) &&
    (!filters.model || session.model === filters.model) &&
    (!filters.key || session.key_label === filters.key) &&
    (!filters.folder || session.folder.startsWith(filters.folder)) &&
    (!filters.machine || session.machine === filters.machine) &&
    (!filters.tag || session.tags.includes(filters.tag)) &&
    (!filters.status || (filters.status === 'error' ? session.errors > 0 : session.errors === 0)) &&
    (!filters.q || session.title.toLowerCase().includes(filters.q.toLowerCase()));

  const visible = (filters: TraceQueryFilters) =>
    enabled ? state.sessions.filter((session) => inRange(session.started_at, filters) && matches(session, filters)) : [];

  const totalsOf = (list: TraceSession[]): TraceTotals => {
    const turns = list.flatMap((session) => state.details.get(session.id)?.turns ?? []);
    const unpriced = turns.filter((turn) => turn.cost_usd === null).length;
    return {
      cost_usd: list.length === 0 ? null : turns.reduce((sum, turn) => sum + (turn.cost_usd ?? 0), 0),
      tokens: list.reduce((sum, session) => addTokens(sum, session.tokens), EMPTY_TOKENS),
      active_ms: list.reduce((sum, session) => sum + session.active_ms, 0),
      model_ms: list.reduce((sum, session) => sum + session.model_ms, 0),
      sessions: list.length,
      subagent_sessions: list.reduce((sum, session) => sum + session.subagents, 0),
      turns: turns.length,
      failed_turns: turns.filter((turn) => turn.status === 'error').length,
      recovered_turns: turns.filter((turn) => turn.status === 'retried').length,
      unpriced_turns: unpriced,
    };
  };

  const groupKey = (session: TraceSession, group: TraceStatsGroup): string => {
    switch (group) {
      case 'project':
        return projectName(session.project);
      case 'model':
        return session.model;
      case 'client':
        return session.client;
      case 'key':
        return session.key_label;
      case 'tag':
        return session.tags[0] ?? '';
      case 'machine':
        return session.machine;
      case 'account':
        return ACCOUNTS[session.turns % ACCOUNTS.length];
      default: {
        const exhaustive: never = group;
        return exhaustive;
      }
    }
  };

  const groupRows = (list: TraceSession[], group: TraceStatsGroup): { rows: TraceStatsGroupRow[]; keyOf: (s: TraceSession) => string } => {
    const buckets = new Map<string, TraceSession[]>();
    for (const session of list) {
      const key = groupKey(session, group);
      buckets.set(key, [...(buckets.get(key) ?? []), session]);
    }
    const rows = [...buckets.entries()].map(([key, members]) => {
      const totals = totalsOf(members);
      return { key, label: key, cost_usd: totals.cost_usd, tokens: totals.tokens, turns: totals.turns, sessions: members.length, active_ms: totals.active_ms };
    });
    rows.sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0));
    const top = rows.slice(0, 8);
    const topKeys = new Set(top.map((row) => row.key));
    const rest = rows.slice(8);
    if (rest.length > 0) {
      top.push({
        key: '__other__',
        label: `Other (${rest.length})`,
        cost_usd: rest.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0),
        tokens: rest.reduce((sum, row) => addTokens(sum, row.tokens), EMPTY_TOKENS),
        turns: rest.reduce((sum, row) => sum + row.turns, 0),
        sessions: rest.reduce((sum, row) => sum + row.sessions, 0),
        active_ms: rest.reduce((sum, row) => sum + row.active_ms, 0),
      });
    }
    return { rows: top, keyOf: (session) => (topKeys.has(groupKey(session, group)) ? groupKey(session, group) : '__other__') };
  };

  const api: TracesApi = {
    async getHealth() {
      await delay();
      return { ...state.health };
    },

    async getStats(filters, { group, bucket }): Promise<TraceStats> {
      await delay();
      const from = filters.from ? Date.parse(filters.from) : nowMs - 30 * DAY;
      const to = filters.to ? Date.parse(filters.to) : nowMs;
      const list = visible(filters);
      const previousFilters = { ...filters, from: iso(from - (to - from)), to: iso(from) };
      const { rows, keyOf } = groupRows(list, group);
      const step = bucket === 'hour' ? HOUR : bucket === 'week' ? 7 * DAY : DAY;
      const first = Math.floor(from / step) * step;
      const buckets: TraceBucket[] = [];
      for (let start = first; start < to; start += step) {
        const groups: TraceBucket['groups'] = {};
        for (const session of list) {
          const time = Date.parse(session.started_at);
          if (time < start || time >= start + step) continue;
          const key = keyOf(session);
          const cell = groups[key] ?? { cost_usd: 0, tokens: 0, active_ms: 0 };
          groups[key] = {
            cost_usd: session.cost_usd === null ? null : (cell.cost_usd ?? 0) + session.cost_usd,
            tokens: cell.tokens + session.tokens.total,
            active_ms: cell.active_ms + session.active_ms,
          };
        }
        buckets.push({ start: iso(start), groups });
      }
      return { from: iso(from), to: iso(to), totals: totalsOf(list), previous: totalsOf(visible(previousFilters)), groups: rows, buckets };
    },

    async getProjects(filters) {
      await delay();
      const list = visible(filters);
      const from = filters.from ? Date.parse(filters.from) : nowMs - 30 * DAY;
      const days = Math.min(90, Math.max(1, Math.ceil(((filters.to ? Date.parse(filters.to) : nowMs) - from) / DAY)));
      const byProject = new Map<string, TraceSession[]>();
      for (const session of list) {
        const name = projectName(session.project);
        byProject.set(name, [...(byProject.get(name) ?? []), session]);
      }
      const projects: TraceProject[] = [...byProject.entries()].map(([name, members]) => {
        const totals = totalsOf(members);
        const source = PROJECTS.find((project) => project.name === name);
        return {
          id: source?.id ?? name,
          name,
          key: source?.key ?? name,
          sessions: members.length,
          turns: totals.turns,
          active_ms: totals.active_ms,
          model_ms: totals.model_ms,
          tokens: totals.tokens,
          cost_usd: totals.cost_usd,
          top_model: members[0]?.model ?? '',
          last_active_at: members.map((session) => session.last_at).sort().pop() ?? '',
          daily: Array.from({ length: days }, (_, day) => {
            const start = from + day * DAY;
            const inDay = members.filter((session) => {
              const time = Date.parse(session.started_at);
              return time >= start && time < start + DAY;
            });
            return {
              day: iso(start).slice(0, 10),
              cost_usd: inDay.reduce((sum, session) => sum + (session.cost_usd ?? 0), 0),
              active_ms: inDay.reduce((sum, session) => sum + session.active_ms, 0),
            };
          }),
        };
      });
      projects.sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0));
      return {
        projects,
        rules: state.rules.map((rule, index) => ({ ...rule, hits: 11 + index * 17 })),
        unassigned_sessions: list.filter((session) => session.project === 'unassigned').length,
      };
    },

    async renameProject(id, name) {
      await delay();
      const source = PROJECTS.find((project) => project.id === id);
      state.projectNames.set(source?.name ?? id, name);
    },

    async mergeProject(id, mergeInto) {
      await delay();
      const from = PROJECTS.find((project) => project.id === id)?.name ?? id;
      const into = PROJECTS.find((project) => project.id === mergeInto)?.name ?? mergeInto;
      state.projectNames.set(from, projectName(into));
    },

    async getProjectRules() {
      await delay();
      return { rules: state.rules.map((rule) => ({ ...rule })) };
    },

    async putProjectRules(rules) {
      await delay();
      state.rules = rules.map((rule) => ({ ...rule }));
    },

    async getSessions(filters, query) {
      await delay();
      const list = visible(filters);
      const value = (session: TraceSession): number => {
        switch (query.sort ?? 'started_at') {
          case 'cost':
            return session.cost_usd ?? -1;
          case 'tokens':
            return session.tokens.total;
          case 'active':
            return session.active_ms;
          case 'turns':
            return session.turns;
          default:
            return Date.parse(session.started_at);
        }
      };
      const sorted = [...list].sort((a, b) => (query.order === 'asc' ? value(a) - value(b) : value(b) - value(a)));
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 25;
      const totals = totalsOf(list);
      return {
        total: list.length,
        summary: { turns: totals.turns, active_ms: totals.active_ms, cost_usd: totals.cost_usd },
        sessions: sorted.slice(offset, offset + limit).map((session) => ({ ...session, project: projectName(session.project) })),
      };
    },

    async getSession(id) {
      await delay();
      const detail = state.details.get(id);
      if (!detail) throw Object.assign(new Error('Session not found'), { status: 404 });
      return detail;
    },

    async getTurn(id): Promise<TraceTurnDetail> {
      await delay();
      const turn = [...state.details.values()].flatMap((detail) => detail.turns).find((entry) => entry.id === id);
      if (!turn) throw Object.assign(new Error('Turn not found'), { status: 404 });
      const priced = turn.cost_usd !== null;
      const price = (count: number, perMillion: number) => (priced ? Number(((count * perMillion) / 1e6).toFixed(4)) : null);
      return {
        turn,
        attempts:
          turn.status === 'retried'
            ? [
                { n: 1, account: 'claude-personal-1', http_status: 429, status: 'error', error: 'rate limited, 5-hour window at 100%', latency_ms: 1_400 },
                { n: 2, account: turn.account, http_status: 200, status: 'ok', error: null, latency_ms: turn.latency_ms - 1_400 },
              ]
            : [{ n: 1, account: turn.account, http_status: turn.http_status, status: turn.status === 'error' ? 'error' : 'ok', error: turn.error, latency_ms: turn.latency_ms }],
        cost_breakdown: [
          { type: 'input', tokens: turn.tokens.input, cost_usd: price(turn.tokens.input, 5) },
          { type: 'cache_read', tokens: turn.tokens.cache_read, cost_usd: price(turn.tokens.cache_read, 0.5) },
          { type: 'cache_write_5m', tokens: turn.tokens.cache_write_5m, cost_usd: price(turn.tokens.cache_write_5m, 6.25) },
          { type: 'output', tokens: turn.tokens.output, cost_usd: price(turn.tokens.output, 25) },
        ],
        facts: {
          request_id: `req_${turn.id.slice(-8)}`,
          folder: '~/code/api-gateway',
          client: 'claude-code 2.1.318',
          machine: 'laptop (100.64.0.12)',
          stop_reason: turn.status === 'error' ? null : 'tool_use',
          parent_turn_id: null,
        },
        content_available: turn.seq !== 3,
        blocks: mockBlocks(turn),
      };
    },

    async getTurnBlock(id, index) {
      await delay();
      const detail = await api.getTurn(id);
      const block = detail.blocks[index];
      if (!block) throw Object.assign(new Error('Block not found'), { status: 404 });
      return { ...block, text: block.truncated ? `${block.text}\n${'more output\n'.repeat(40)}` : block.text, truncated: false };
    },

    async getErrors(filters, query) {
      await delay();
      const list = visible(filters);
      const items: TraceErrorItem[] = list.flatMap((session) =>
        (state.details.get(session.id)?.turns ?? [])
          .filter((turn) => turn.status !== 'ok')
          .map((turn) => ({
            turn_id: turn.id,
            session_id: session.id,
            title: session.title,
            project: projectName(session.project),
            at: turn.started_at,
            account: turn.account,
            http_status: turn.status === 'retried' ? 429 : turn.http_status,
            error: turn.status === 'retried' ? 'rate limited, 5-hour window at 100%' : (turn.error ?? 'error'),
            recovered: turn.status === 'retried',
          }))
      );
      items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const groups = new Map<string, { type: string; account: string; count: number; last_at: string }>();
      for (const item of items) {
        const type = item.http_status === 429 ? 'rate_limited' : 'overloaded';
        const key = `${type}|${item.account}`;
        const group = groups.get(key) ?? { type, account: item.account, count: 0, last_at: item.at };
        group.count += 1;
        if (item.at > group.last_at) group.last_at = item.at;
        groups.set(key, group);
      }
      return {
        total: items.length,
        groups: [...groups.values()].sort((a, b) => b.count - a.count),
        items: items.slice(query.offset, query.offset + query.limit),
      };
    },

    async getLimits(filters) {
      await delay();
      const list = visible(filters);
      const accounts: TraceAccountLimits[] = [
        { account_id: 'claude-work', label: 'Claude, work', email: 'you@company.example', provider: 'claude', plan: 'Team plan', tags: ['work'], used: [18, 87], names: ['5h', '7d'], overage: 'allowed' },
        { account_id: 'claude-personal-1', label: 'Claude, personal (account 1)', email: 'you@example.com', provider: 'claude', plan: 'Max plan', tags: ['personal'], used: [42, 61], names: ['5h', '7d'], overage: null },
        { account_id: 'claude-personal-2', label: 'Claude, personal (account 2)', email: 'you+2@example.com', provider: 'claude', plan: 'Max plan', tags: ['personal'], used: [9, 33], names: ['5h', '7d'], overage: null },
        { account_id: 'chatgpt-personal', label: 'ChatGPT, personal', email: 'you@example.com', provider: 'codex', plan: 'Pro plan', tags: ['personal'], used: [23, 74], names: ['primary', 'secondary'], overage: null },
      ].map((account, index) => ({
        account_id: account.account_id,
        label: account.label,
        email: account.email,
        provider: account.provider,
        plan: account.plan,
        tags: account.tags,
        windows: account.names.map((name, windowIndex) => ({
          name,
          used_pct: account.used[windowIndex],
          status: account.used[windowIndex] >= 100 ? 'rejected' : 'allowed',
          resets_at: iso(nowMs + (windowIndex === 0 ? 3 * HOUR : (2 + index) * DAY)),
        })),
        overage_status: account.overage,
        history: Array.from({ length: 14 }, (_, day) => ({
          at: iso(nowMs - (13 - day) * DAY),
          window: account.names[1],
          used_pct: Math.round((account.used[1] * (day + 1)) / 14),
        })),
        usage: {
          turns: list.length * (4 - index),
          tokens: list.reduce((sum, session) => sum + session.tokens.total, 0) / (index + 2),
          cost_usd: list.reduce((sum, session) => sum + (session.cost_usd ?? 0), 0) / (index + 2),
        },
        plan_price_usd: state.planPrices.get(account.account_id) ?? null,
      }));
      return { accounts: enabled ? accounts : [] };
    },

    async putPlanPrice(accountId, planPriceUsd) {
      await delay();
      state.planPrices.set(accountId, planPriceUsd);
    },

    async getPrices() {
      await delay();
      return { source: state.health.prices_source, updated_at: state.health.prices_updated_at, rows: state.prices.map((row) => ({ ...row })) };
    },

    async putPriceOverrides(overrides: TracePriceOverride[]) {
      await delay();
      const catalog = buildPrices().filter((row) => row.origin === 'catalog');
      state.prices = [...catalog, ...overrides.map((override) => ({ ...override, origin: 'override' as const }))];
    },

    async exportCsv(filters, { group, period }) {
      await delay();
      const header =
        group === 'project'
          ? 'period_start,project,sessions,turns,active_hours,model_hours,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd'
          : 'session_id,started_at,project,client,model,key,turns,active_hours,tokens,cost_usd,title';
      const rows = visible(filters).map((session) =>
        group === 'project'
          ? [session.started_at.slice(0, 10), session.project, 1, session.turns, (session.active_ms / HOUR).toFixed(2), (session.model_ms / HOUR).toFixed(2), session.tokens.input, session.tokens.output, session.tokens.cache_read, session.tokens.cache_write_5m, session.cost_usd ?? ''].join(',')
          : [session.id, session.started_at, session.project, session.client, session.model, session.key_label, session.turns, (session.active_ms / HOUR).toFixed(2), session.tokens.total, session.cost_usd ?? '', JSON.stringify(session.title)].join(',')
      );
      return { blob: new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }), filename: `traces-${group}-${period}.csv` };
    },

    async getTracesConfig() {
      await delay();
      return {
        capture: 'full',
        idle_gap: '10m',
        content_max_age: '365d',
        content_max_size: '20GB',
        redact_secrets: true,
        prices_source: state.health.prices_source,
        prices_refresh: '24h',
      };
    },

    async deleteTraces(scope) {
      await delay();
      if (!scope.session) return { deleted_sessions: 0, deleted_turns: 0 };
      const detail = state.details.get(scope.session);
      state.sessions = state.sessions.filter((session) => session.id !== scope.session);
      state.details.delete(scope.session);
      return { deleted_sessions: detail ? 1 : 0, deleted_turns: detail?.turns.length ?? 0 };
    },
  };

  return api;
}

function mockBlocks(turn: TraceTurn): TraceBlock[] {
  const block = (partial: Partial<TraceBlock> & Pick<TraceBlock, 'kind' | 'text'>): TraceBlock => ({
    tool_name: null,
    tool_call_id: null,
    is_error: false,
    truncated: false,
    full_size: partial.text.length,
    diff: null,
    ...partial,
  });
  if (turn.status === 'error') {
    return [block({ kind: 'user', text: 'Run the tests again.' })];
  }
  if (turn.seq % 2 === 0) {
    return [
      block({ kind: 'tool_result', tool_name: 'Read', text: 'sdk/auth/selector.go (412 lines)\nShown: lines 190 to 240' }),
      block({ kind: 'thinking', text: 'The selector picks candidates for every request, so the tag check belongs there.' }),
      block({ kind: 'assistant', text: 'The selector is the narrowest place to enforce tags. I will filter on the key tags before the usual checks.' }),
      block({
        kind: 'tool_call',
        tool_name: 'Edit',
        tool_call_id: `${turn.id}-edit`,
        text: '',
        diff: {
          file: 'sdk/auth/selector.go',
          old: 'func candidates(auths []*Auth) []*Auth {\n\tout := make([]*Auth, 0, len(auths))\n\tfor _, a := range auths {\n\t\tif a.Disabled {\n\t\t\tcontinue\n\t\t}\n\t\tout = append(out, a)\n\t}\n\treturn out\n}',
          new: 'func candidates(auths []*Auth, keyTags []string) []*Auth {\n\tout := make([]*Auth, 0, len(auths))\n\tfor _, a := range auths {\n\t\tif a.Disabled || !tagsAllow(keyTags, a.Tags) {\n\t\t\tcontinue\n\t\t}\n\t\tout = append(out, a)\n\t}\n\treturn out\n}',
        },
      }),
    ];
  }
  return [
    block({ kind: 'user', text: 'Add credential tags to client keys, and keep untagged keys on untagged accounts.' }),
    block({ kind: 'tool_call', tool_name: 'Bash', text: 'go test ./sdk/auth/...' }),
    block({
      kind: 'tool_result',
      tool_name: 'Bash',
      is_error: turn.seq === 1,
      truncated: turn.seq === 1,
      full_size: 48_210,
      text: '--- FAIL: TestSelectorTagsFailClosed (0.00s)\n    selector_tags_test.go:48: untagged key reached tagged account "work-1"\nFAIL',
    }),
    block({
      kind: 'tool_call',
      tool_name: 'apply_patch',
      text: '',
      diff: { file: 'sdk/auth/request.go', patch: '*** Begin Patch\n*** Update File: sdk/auth/request.go\n@@ type Request struct {\n \tModel string\n+\tKeyTags []string\n }\n*** End Patch' },
    }),
  ];
}
