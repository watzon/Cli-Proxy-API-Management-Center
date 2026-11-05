/**
 * Traces Management API (`/v8/management/traces/...`).
 *
 * Types mirror the wire contract field for field (snake_case), so the spec and the code
 * stay easy to compare. Every response passes through a normalizer that fills safe
 * defaults for missing or malformed fields, so pages never see `undefined` arrays or
 * numbers.
 */

import { apiClient } from './client';
import { getConfigValue } from './configValue';
import { isRecord } from '@/utils/helpers';

// ─── Wire types ─────────────────────────────────────────────────────────────

export type TraceCaptureLevel = 'metadata' | 'full';
export type TraceStatsGroup = 'project' | 'model' | 'client' | 'key' | 'tag' | 'account' | 'machine';
export type TraceBucketSize = 'hour' | 'day' | 'week';
export type TraceTurnStatus = 'ok' | 'retried' | 'error';
export type TraceAttemptStatus = 'ok' | 'error';
export type TraceCostType = 'input' | 'cache_read' | 'cache_write_5m' | 'cache_write_1h' | 'output';
export type TraceBlockKind =
  | 'user'
  | 'assistant'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'system';
export type TracePriceOrigin = 'catalog' | 'override' | 'unpriced';
export type TraceSessionSort = 'started_at' | 'cost' | 'tokens' | 'active' | 'turns';
export type TraceSortOrder = 'asc' | 'desc';
export type TraceExportGroup = 'project' | 'session';
export type TraceExportPeriod = 'day' | 'week' | 'month';

/** Token object `T` in the spec. */
export interface TraceTokens {
  input: number;
  output: number;
  reasoning: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  total: number;
}

export interface TraceHealth {
  enabled: boolean;
  capture: TraceCaptureLevel;
  queue_depth: number;
  queue_size: number;
  dropped_events: number;
  dropped_content: number;
  db_bytes: number;
  content_bytes: number;
  last_write_at: string | null;
  oldest_turn_at: string | null;
  prices_updated_at: string | null;
  prices_source: string;
}

/** `TOT` in the spec. */
export interface TraceTotals {
  cost_usd: number | null;
  tokens: TraceTokens;
  active_ms: number;
  model_ms: number;
  sessions: number;
  subagent_sessions: number;
  turns: number;
  failed_turns: number;
  recovered_turns: number;
  unpriced_turns: number;
}

export interface TraceStatsGroupRow {
  key: string;
  label: string;
  cost_usd: number | null;
  tokens: TraceTokens;
  turns: number;
  sessions: number;
  active_ms: number;
}

export interface TraceBucketValue {
  cost_usd: number | null;
  tokens: number;
  active_ms: number;
}

export interface TraceBucket {
  start: string;
  groups: Record<string, TraceBucketValue>;
}

export interface TraceStats {
  from: string;
  to: string;
  totals: TraceTotals;
  previous: TraceTotals;
  groups: TraceStatsGroupRow[];
  buckets: TraceBucket[];
}

export interface TraceProjectDay {
  day: string;
  cost_usd: number | null;
  active_ms: number;
}

export interface TraceProject {
  id: string;
  name: string;
  key: string;
  sessions: number;
  turns: number;
  active_ms: number;
  model_ms: number;
  tokens: TraceTokens;
  cost_usd: number | null;
  top_model: string;
  last_active_at: string;
  daily: TraceProjectDay[];
}

export interface TraceProjectRule {
  match: string;
  project: string;
}

export interface TraceProjectRuleWithHits extends TraceProjectRule {
  hits: number;
}

export interface TraceProjectsResponse {
  projects: TraceProject[];
  rules: TraceProjectRuleWithHits[];
  unassigned_sessions: number;
}

export interface TraceProjectRulesResponse {
  rules: TraceProjectRule[];
}

/** `S` in the spec. */
export interface TraceSession {
  id: string;
  title: string;
  project: string;
  folder: string;
  client: string;
  client_version: string;
  model: string;
  key_label: string;
  tags: string[];
  machine: string;
  turns: number;
  tokens: TraceTokens;
  cost_usd: number | null;
  active_ms: number;
  model_ms: number;
  errors: number;
  subagents: number;
  parent_id: string | null;
  started_at: string;
  last_at: string;
}

export interface TraceSessionsResponse {
  total: number;
  summary: { turns: number; active_ms: number; cost_usd: number | null };
  sessions: TraceSession[];
}

export interface TraceSessionDetailSession extends TraceSession {
  device_id: string | null;
  files_changed: number;
  lines_added: number;
  lines_removed: number;
}

/** `TURN` in the spec. */
export interface TraceTurn {
  id: string;
  seq: number;
  session_id: string;
  started_at: string;
  ended_at: string;
  latency_ms: number;
  ttft_ms: number | null;
  model: string;
  served_model: string;
  provider: string;
  account: string;
  status: TraceTurnStatus;
  http_status: number;
  error: string | null;
  attempts: number;
  tokens: TraceTokens;
  cost_usd: number | null;
  tool_names: string[];
}

export interface TraceLane {
  session_id: string;
  label: string;
  parent_turn_id: string | null;
  turns: number;
}

export interface TraceBreak {
  from: string;
  to: string;
}

export interface TraceSessionDetail {
  session: TraceSessionDetailSession;
  turns: TraceTurn[];
  lanes: TraceLane[];
  breaks: TraceBreak[];
}

export interface TraceAttempt {
  n: number;
  account: string;
  http_status: number;
  status: TraceAttemptStatus;
  error: string | null;
  latency_ms: number;
}

export interface TraceCostLine {
  type: TraceCostType;
  tokens: number;
  cost_usd: number | null;
}

export interface TraceTurnFacts {
  request_id: string;
  folder: string;
  client: string;
  machine: string;
  stop_reason: string | null;
  parent_turn_id: string | null;
}

export type TraceBlockDiff = { file: string; old: string; new: string } | { file: string; patch: string };

/** `BLOCK` in the spec. */
export interface TraceBlock {
  kind: TraceBlockKind;
  text: string;
  tool_name: string | null;
  tool_call_id: string | null;
  is_error: boolean;
  truncated: boolean;
  full_size: number;
  diff: TraceBlockDiff | null;
}

export interface TraceTurnDetail {
  turn: TraceTurn;
  attempts: TraceAttempt[];
  cost_breakdown: TraceCostLine[];
  facts: TraceTurnFacts;
  content_available: boolean;
  blocks: TraceBlock[];
}

export interface TraceErrorGroup {
  type: string;
  account: string;
  count: number;
  last_at: string;
}

export interface TraceErrorItem {
  turn_id: string;
  session_id: string;
  title: string;
  project: string;
  at: string;
  account: string;
  http_status: number;
  error: string;
  recovered: boolean;
}

export interface TraceErrorsResponse {
  total: number;
  groups: TraceErrorGroup[];
  items: TraceErrorItem[];
}

export interface TraceLimitWindow {
  name: string;
  used_pct: number | null;
  status: string;
  resets_at: string | null;
}

export interface TraceLimitSample {
  at: string;
  window: string;
  used_pct: number | null;
}

export interface TraceAccountLimits {
  account_id: string;
  label: string;
  email: string;
  provider: string;
  plan: string | null;
  tags: string[];
  windows: TraceLimitWindow[];
  overage_status: string | null;
  history: TraceLimitSample[];
  usage: { turns: number; tokens: number; cost_usd: number | null };
  plan_price_usd: number | null;
}

export interface TraceLimitsResponse {
  accounts: TraceAccountLimits[];
}

export interface TracePriceRow {
  model: string;
  input: number | null;
  output: number | null;
  cache_read: number | null;
  cache_write_5m: number | null;
  cache_write_1h: number | null;
  origin: TracePriceOrigin;
}

export interface TracePricesResponse {
  source: string;
  updated_at: string | null;
  rows: TracePriceRow[];
}

/** One `traces.prices.overrides` entry, in the UI's field names. */
export type TracePriceOverride = Omit<TracePriceRow, 'origin'>;

export interface TraceDeleteResult {
  deleted_sessions: number;
  deleted_turns: number;
}

/** Common query filters on data endpoints. Empty values are not sent. */
export interface TraceQueryFilters {
  from?: string;
  to?: string;
  project?: string;
  folder?: string;
  client?: string;
  model?: string;
  key?: string;
  tag?: string;
  account?: string;
  machine?: string;
  status?: 'ok' | 'error';
  q?: string;
}

export interface TraceSessionsQuery {
  sort?: TraceSessionSort;
  order?: TraceSortOrder;
  limit?: number;
  offset?: number;
  include_subagents?: boolean;
}

export interface TraceDeleteScope {
  session?: string;
  project?: string;
  key?: string;
  from?: string;
  to?: string;
}

/** The read-only part of the `traces:` config block shown on the Settings page. */
export interface TraceConfigSummary {
  capture: string | null;
  idle_gap: string | null;
  content_max_age: string | null;
  content_max_size: string | null;
  redact_secrets: boolean | null;
  prices_source: string | null;
  prices_refresh: string | null;
}

export interface TraceCsvExport {
  blob: Blob;
  filename: string;
}

// ─── Normalizers ────────────────────────────────────────────────────────────

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const strOrNull = (value: unknown): string | null => {
  const text = str(value);
  return text ? text : null;
};

const bool = (value: unknown): boolean => value === true;

const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const list = <T>(value: unknown, map: (item: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.map(map).filter((item): item is T => item !== null) : [];

const strings = (value: unknown): string[] => list(value, (item) => strOrNull(item));

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  const text = str(value);
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
};

const TURN_STATUSES = ['ok', 'retried', 'error'] as const;
const BLOCK_KINDS = ['user', 'assistant', 'thinking', 'tool_call', 'tool_result', 'system'] as const;
const COST_TYPES = ['input', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'output'] as const;

export const normalizeTokens = (value: unknown): TraceTokens => {
  const raw = record(value);
  return {
    input: num(raw.input),
    output: num(raw.output),
    reasoning: num(raw.reasoning),
    cache_read: num(raw.cache_read),
    cache_write_5m: num(raw.cache_write_5m),
    cache_write_1h: num(raw.cache_write_1h),
    total: num(raw.total),
  };
};

export const normalizeHealth = (value: unknown): TraceHealth => {
  const raw = record(value);
  return {
    enabled: bool(raw.enabled),
    capture: oneOf(raw.capture, ['metadata', 'full'] as const, 'metadata'),
    queue_depth: num(raw.queue_depth),
    queue_size: num(raw.queue_size),
    dropped_events: num(raw.dropped_events),
    dropped_content: num(raw.dropped_content),
    db_bytes: num(raw.db_bytes),
    content_bytes: num(raw.content_bytes),
    last_write_at: strOrNull(raw.last_write_at),
    oldest_turn_at: strOrNull(raw.oldest_turn_at),
    prices_updated_at: strOrNull(raw.prices_updated_at),
    prices_source: str(raw.prices_source),
  };
};

const normalizeTotals = (value: unknown): TraceTotals => {
  const raw = record(value);
  return {
    cost_usd: numOrNull(raw.cost_usd),
    tokens: normalizeTokens(raw.tokens),
    active_ms: num(raw.active_ms),
    model_ms: num(raw.model_ms),
    sessions: num(raw.sessions),
    subagent_sessions: num(raw.subagent_sessions),
    turns: num(raw.turns),
    failed_turns: num(raw.failed_turns),
    recovered_turns: num(raw.recovered_turns),
    unpriced_turns: num(raw.unpriced_turns),
  };
};

export const normalizeStats = (value: unknown): TraceStats => {
  const raw = record(value);
  return {
    from: str(raw.from),
    to: str(raw.to),
    totals: normalizeTotals(raw.totals),
    previous: normalizeTotals(raw.previous),
    groups: list(raw.groups, (item) => {
      const group = record(item);
      const key = str(group.key);
      if (!key) return null;
      return {
        key,
        label: str(group.label) || key,
        cost_usd: numOrNull(group.cost_usd),
        tokens: normalizeTokens(group.tokens),
        turns: num(group.turns),
        sessions: num(group.sessions),
        active_ms: num(group.active_ms),
      };
    }),
    buckets: list(raw.buckets, (item) => {
      const bucket = record(item);
      const start = str(bucket.start);
      if (!start) return null;
      const groups: Record<string, TraceBucketValue> = {};
      for (const [key, entry] of Object.entries(record(bucket.groups))) {
        const cell = record(entry);
        groups[key] = {
          cost_usd: numOrNull(cell.cost_usd),
          tokens: num(cell.tokens),
          active_ms: num(cell.active_ms),
        };
      }
      return { start, groups };
    }),
  };
};

export const normalizeProjects = (value: unknown): TraceProjectsResponse => {
  const raw = record(value);
  return {
    projects: list(raw.projects, (item) => {
      const project = record(item);
      const id = str(project.id);
      if (!id) return null;
      return {
        id,
        name: str(project.name) || id,
        key: str(project.key),
        sessions: num(project.sessions),
        turns: num(project.turns),
        active_ms: num(project.active_ms),
        model_ms: num(project.model_ms),
        tokens: normalizeTokens(project.tokens),
        cost_usd: numOrNull(project.cost_usd),
        top_model: str(project.top_model),
        last_active_at: str(project.last_active_at),
        daily: list(project.daily, (entry) => {
          const day = record(entry);
          const date = str(day.day);
          if (!date) return null;
          return { day: date, cost_usd: numOrNull(day.cost_usd), active_ms: num(day.active_ms) };
        }),
      };
    }),
    rules: list(raw.rules, (item) => {
      const rule = record(item);
      const match = str(rule.match);
      if (!match) return null;
      return { match, project: str(rule.project), hits: num(rule.hits) };
    }),
    unassigned_sessions: num(raw.unassigned_sessions),
  };
};

export const normalizeProjectRules = (value: unknown): TraceProjectRulesResponse => ({
  rules: list(record(value).rules, (item) => {
    const rule = record(item);
    const match = str(rule.match);
    if (!match) return null;
    return { match, project: str(rule.project) };
  }),
});

export const normalizeSession = (value: unknown): TraceSession | null => {
  const raw = record(value);
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    title: str(raw.title),
    project: str(raw.project),
    folder: str(raw.folder),
    client: str(raw.client),
    client_version: str(raw.client_version),
    model: str(raw.model),
    key_label: str(raw.key_label),
    tags: strings(raw.tags),
    machine: str(raw.machine),
    turns: num(raw.turns),
    tokens: normalizeTokens(raw.tokens),
    cost_usd: numOrNull(raw.cost_usd),
    active_ms: num(raw.active_ms),
    model_ms: num(raw.model_ms),
    errors: num(raw.errors),
    subagents: num(raw.subagents),
    parent_id: strOrNull(raw.parent_id),
    started_at: str(raw.started_at),
    last_at: str(raw.last_at),
  };
};

export const normalizeSessions = (value: unknown): TraceSessionsResponse => {
  const raw = record(value);
  const summary = record(raw.summary);
  return {
    total: num(raw.total),
    summary: {
      turns: num(summary.turns),
      active_ms: num(summary.active_ms),
      cost_usd: numOrNull(summary.cost_usd),
    },
    sessions: list(raw.sessions, normalizeSession),
  };
};

export const normalizeTurn = (value: unknown): TraceTurn | null => {
  const raw = record(value);
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    seq: num(raw.seq),
    session_id: str(raw.session_id),
    started_at: str(raw.started_at),
    ended_at: str(raw.ended_at),
    latency_ms: num(raw.latency_ms),
    ttft_ms: numOrNull(raw.ttft_ms),
    model: str(raw.model),
    served_model: str(raw.served_model),
    provider: str(raw.provider),
    account: str(raw.account),
    status: oneOf(raw.status, TURN_STATUSES, 'ok'),
    http_status: num(raw.http_status),
    error: strOrNull(raw.error),
    attempts: num(raw.attempts),
    tokens: normalizeTokens(raw.tokens),
    cost_usd: numOrNull(raw.cost_usd),
    tool_names: strings(raw.tool_names),
  };
};

export const normalizeSessionDetail = (value: unknown): TraceSessionDetail => {
  const raw = record(value);
  const sessionRaw = record(raw.session);
  const base = normalizeSession(sessionRaw);
  if (!base) throw new Error('Invalid session detail');
  return {
    session: {
      ...base,
      device_id: strOrNull(sessionRaw.device_id),
      files_changed: num(sessionRaw.files_changed),
      lines_added: num(sessionRaw.lines_added),
      lines_removed: num(sessionRaw.lines_removed),
    },
    turns: list(raw.turns, normalizeTurn),
    lanes: list(raw.lanes, (item) => {
      const lane = record(item);
      const sessionId = str(lane.session_id);
      if (!sessionId) return null;
      return {
        session_id: sessionId,
        label: str(lane.label),
        parent_turn_id: strOrNull(lane.parent_turn_id),
        turns: num(lane.turns),
      };
    }),
    breaks: list(raw.breaks, (item) => {
      const gap = record(item);
      const from = str(gap.from);
      const to = str(gap.to);
      return from && to ? { from, to } : null;
    }),
  };
};

const normalizeDiff = (value: unknown): TraceBlockDiff | null => {
  if (!isRecord(value)) return null;
  const file = str(value.file);
  if (typeof value.patch === 'string') return { file, patch: value.patch };
  if (typeof value.old === 'string' || typeof value.new === 'string') {
    return { file, old: str(value.old), new: str(value.new) };
  }
  return null;
};

export const normalizeBlock = (value: unknown): TraceBlock | null => {
  if (!isRecord(value)) return null;
  return {
    kind: oneOf(value.kind, BLOCK_KINDS, 'system'),
    text: str(value.text),
    tool_name: strOrNull(value.tool_name),
    tool_call_id: strOrNull(value.tool_call_id),
    is_error: bool(value.is_error),
    truncated: bool(value.truncated),
    full_size: num(value.full_size),
    diff: normalizeDiff(value.diff),
  };
};

export const normalizeTurnDetail = (value: unknown): TraceTurnDetail => {
  const raw = record(value);
  const turn = normalizeTurn(raw.turn);
  if (!turn) throw new Error('Invalid turn detail');
  const facts = record(raw.facts);
  return {
    turn,
    attempts: list(raw.attempts, (item) => {
      const attempt = record(item);
      return {
        n: num(attempt.n),
        account: str(attempt.account),
        http_status: num(attempt.http_status),
        status: oneOf(attempt.status, ['ok', 'error'] as const, 'error'),
        error: strOrNull(attempt.error),
        latency_ms: num(attempt.latency_ms),
      };
    }),
    cost_breakdown: list(raw.cost_breakdown, (item) => {
      const line = record(item);
      const type = str(line.type);
      if (!(COST_TYPES as readonly string[]).includes(type)) return null;
      return {
        type: oneOf(type, COST_TYPES, 'input'),
        tokens: num(line.tokens),
        cost_usd: numOrNull(line.cost_usd),
      };
    }),
    facts: {
      request_id: str(facts.request_id),
      folder: str(facts.folder),
      client: str(facts.client),
      machine: str(facts.machine),
      stop_reason: strOrNull(facts.stop_reason),
      parent_turn_id: strOrNull(facts.parent_turn_id),
    },
    content_available: bool(raw.content_available),
    blocks: list(raw.blocks, normalizeBlock),
  };
};

export const normalizeErrors = (value: unknown): TraceErrorsResponse => {
  const raw = record(value);
  return {
    total: num(raw.total),
    groups: list(raw.groups, (item) => {
      const group = record(item);
      return {
        type: str(group.type),
        account: str(group.account),
        count: num(group.count),
        last_at: str(group.last_at),
      };
    }),
    items: list(raw.items, (item) => {
      const entry = record(item);
      const turnId = str(entry.turn_id);
      if (!turnId) return null;
      return {
        turn_id: turnId,
        session_id: str(entry.session_id),
        title: str(entry.title),
        project: str(entry.project),
        at: str(entry.at),
        account: str(entry.account),
        http_status: num(entry.http_status),
        error: str(entry.error),
        recovered: bool(entry.recovered),
      };
    }),
  };
};

export const normalizeLimits = (value: unknown): TraceLimitsResponse => ({
  accounts: list(record(value).accounts, (item) => {
    const account = record(item);
    const accountId = str(account.account_id);
    if (!accountId) return null;
    const usage = record(account.usage);
    return {
      account_id: accountId,
      label: str(account.label) || accountId,
      email: str(account.email),
      provider: str(account.provider),
      plan: strOrNull(account.plan),
      tags: strings(account.tags),
      windows: list(account.windows, (entry) => {
        const window = record(entry);
        const name = str(window.name);
        if (!name) return null;
        return {
          name,
          used_pct: numOrNull(window.used_pct),
          status: str(window.status),
          resets_at: strOrNull(window.resets_at),
        };
      }),
      overage_status: strOrNull(account.overage_status),
      history: list(account.history, (entry) => {
        const sample = record(entry);
        const at = str(sample.at);
        if (!at) return null;
        return { at, window: str(sample.window), used_pct: numOrNull(sample.used_pct) };
      }),
      usage: {
        turns: num(usage.turns),
        tokens: num(usage.tokens),
        cost_usd: numOrNull(usage.cost_usd),
      },
      plan_price_usd: numOrNull(account.plan_price_usd),
    };
  }),
});

export const normalizePrices = (value: unknown): TracePricesResponse => {
  const raw = record(value);
  return {
    source: str(raw.source),
    updated_at: strOrNull(raw.updated_at),
    rows: list(raw.rows, (item) => {
      const row = record(item);
      const model = str(row.model);
      if (!model) return null;
      return {
        model,
        input: numOrNull(row.input),
        output: numOrNull(row.output),
        cache_read: numOrNull(row.cache_read),
        cache_write_5m: numOrNull(row.cache_write_5m),
        cache_write_1h: numOrNull(row.cache_write_1h),
        origin: oneOf(row.origin, ['catalog', 'override', 'unpriced'] as const, 'catalog'),
      };
    }),
  };
};

const textOrNull = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return strOrNull(value);
};

/** Reads the `traces:` block (kebab-case keys, as in config.yaml). */
export const normalizeTracesConfig = (value: unknown): TraceConfigSummary => {
  const raw = record(value);
  const retention = record(raw.retention);
  const prices = record(raw.prices);
  return {
    capture: textOrNull(raw.capture),
    idle_gap: textOrNull(raw['idle-gap']),
    content_max_age: textOrNull(retention['content-max-age']),
    content_max_size: textOrNull(retention['content-max-size']),
    redact_secrets: typeof raw['redact-secrets'] === 'boolean' ? raw['redact-secrets'] : null,
    prices_source: typeof prices.source === 'string' ? prices.source : null,
    prices_refresh: textOrNull(prices.refresh),
  };
};

/**
 * `PUT /traces/prices` persists `traces.prices.overrides`, so entries use the config
 * block's field names (`cache-read`, `cache-write-5m`, `cache-write-1h`). Empty prices
 * are left out so the backend keeps its defaults for them.
 */
export const serializePriceOverrides = (
  overrides: TracePriceOverride[]
): Array<Record<string, string | number>> =>
  overrides.map((override) => {
    const entry: Record<string, string | number> = { model: override.model.trim() };
    const fields: Array<[string, number | null]> = [
      ['input', override.input],
      ['output', override.output],
      ['cache-read', override.cache_read],
      ['cache-write-5m', override.cache_write_5m],
      ['cache-write-1h', override.cache_write_1h],
    ];
    for (const [name, price] of fields) {
      if (price !== null && Number.isFinite(price)) entry[name] = price;
    }
    return entry;
  });

/** Drops empty filter values so the backend applies its own defaults. */
export const buildTraceParams = (
  filters: TraceQueryFilters,
  extra: Record<string, string | number | boolean | undefined> = {}
): Record<string, string> => {
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries({ ...filters, ...extra })) {
    if (value === undefined || value === null || value === '') continue;
    params[name] = String(value);
  }
  return params;
};

const filenameFromDisposition = (header: unknown): string | null => {
  const text = str(header);
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(text);
  return match ? decodeURIComponent(match[1]) : null;
};

const segment = (value: string) => encodeURIComponent(value);

// ─── Endpoints ──────────────────────────────────────────────────────────────

export const tracesApi = {
  async getHealth(): Promise<TraceHealth> {
    return normalizeHealth(await apiClient.get<unknown>('/traces/health'));
  },

  async getStats(
    filters: TraceQueryFilters,
    options: { group: TraceStatsGroup; bucket: TraceBucketSize }
  ): Promise<TraceStats> {
    const params = buildTraceParams(filters, options);
    return normalizeStats(await apiClient.get<unknown>('/traces/stats', { params }));
  },

  async getProjects(filters: TraceQueryFilters): Promise<TraceProjectsResponse> {
    const params = buildTraceParams(filters);
    return normalizeProjects(await apiClient.get<unknown>('/traces/projects', { params }));
  },

  async renameProject(id: string, name: string): Promise<void> {
    await apiClient.put(`/traces/projects/${segment(id)}`, { name });
  },

  async mergeProject(id: string, mergeInto: string): Promise<void> {
    await apiClient.put(`/traces/projects/${segment(id)}`, { merge_into: mergeInto });
  },

  async getProjectRules(): Promise<TraceProjectRulesResponse> {
    return normalizeProjectRules(await apiClient.get<unknown>('/traces/project-rules'));
  },

  async putProjectRules(rules: TraceProjectRule[]): Promise<void> {
    await apiClient.put('/traces/project-rules', {
      rules: rules.map((rule) => ({ match: rule.match.trim(), project: rule.project.trim() })),
    });
  },

  async getSessions(
    filters: TraceQueryFilters,
    query: TraceSessionsQuery
  ): Promise<TraceSessionsResponse> {
    const params = buildTraceParams(filters, { ...query });
    return normalizeSessions(await apiClient.get<unknown>('/traces/sessions', { params }));
  },

  async getSession(id: string): Promise<TraceSessionDetail> {
    return normalizeSessionDetail(await apiClient.get<unknown>(`/traces/sessions/${segment(id)}`));
  },

  async getTurn(id: string): Promise<TraceTurnDetail> {
    return normalizeTurnDetail(await apiClient.get<unknown>(`/traces/turns/${segment(id)}`));
  },

  async getTurnBlock(id: string, index: number): Promise<TraceBlock> {
    const block = normalizeBlock(
      await apiClient.get<unknown>(`/traces/turns/${segment(id)}/blocks/${index}`)
    );
    if (!block) throw new Error('Invalid block');
    return block;
  },

  async getErrors(
    filters: TraceQueryFilters,
    query: { limit: number; offset: number }
  ): Promise<TraceErrorsResponse> {
    const params = buildTraceParams(filters, query);
    return normalizeErrors(await apiClient.get<unknown>('/traces/errors', { params }));
  },

  async getLimits(filters: TraceQueryFilters): Promise<TraceLimitsResponse> {
    const params = buildTraceParams(filters);
    return normalizeLimits(await apiClient.get<unknown>('/traces/limits', { params }));
  },

  async putPlanPrice(accountId: string, planPriceUsd: number | null): Promise<void> {
    await apiClient.put(`/traces/limits/${segment(accountId)}`, { plan_price_usd: planPriceUsd });
  },

  async getPrices(): Promise<TracePricesResponse> {
    return normalizePrices(await apiClient.get<unknown>('/traces/prices'));
  },

  async putPriceOverrides(overrides: TracePriceOverride[]): Promise<void> {
    await apiClient.put('/traces/prices', { overrides: serializePriceOverrides(overrides) });
  },

  async exportCsv(
    filters: TraceQueryFilters,
    options: { group: TraceExportGroup; period: TraceExportPeriod }
  ): Promise<TraceCsvExport> {
    const params = buildTraceParams(filters, options);
    const response = await apiClient.getRaw('/traces/export.csv', {
      params,
      responseType: 'blob',
    });
    const headers = record(response.headers);
    const data: unknown = response.data;
    const blob = data instanceof Blob ? data : new Blob([str(data)], { type: 'text/csv' });
    return {
      blob,
      filename:
        filenameFromDisposition(headers['content-disposition']) ??
        `traces-${options.group}-${options.period}.csv`,
    };
  },

  /** The `traces:` config block, or empty values when the block is not in the config. */
  async getTracesConfig(): Promise<TraceConfigSummary> {
    return normalizeTracesConfig(await getConfigValue<unknown>('/config/traces', null));
  },

  async deleteTraces(scope: TraceDeleteScope): Promise<TraceDeleteResult> {
    const params = buildTraceParams({}, { ...scope, confirm: true });
    const raw = record(await apiClient.delete<unknown>('/traces', { params }));
    return { deleted_sessions: num(raw.deleted_sessions), deleted_turns: num(raw.deleted_turns) };
  },
};

export type TracesApi = typeof tracesApi;
