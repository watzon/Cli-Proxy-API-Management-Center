/**
 * Filter state for the Traces pages, kept in the URL query so links and the back
 * button work. Only non-default values are written to the URL.
 */

import type { TraceBucketSize, TraceQueryFilters } from '@/services/api/traces';

export const RANGE_PRESETS = ['today', '7d', '30d', 'week', 'month', '90d', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const DEFAULT_RANGE: RangePreset = '30d';

/** Text filters, in the order the filter bar shows them. */
export const TEXT_FILTER_FIELDS = [
  'project',
  'folder',
  'client',
  'model',
  'key',
  'tag',
  'account',
  'machine',
] as const;
export type TextFilterField = (typeof TEXT_FILTER_FIELDS)[number];

export type StatusFilter = '' | 'ok' | 'error';

export interface TraceFilterState {
  range: RangePreset;
  /** Custom range start, `YYYY-MM-DD` in local time. Used only when `range` is `custom`. */
  from: string;
  /** Custom range end (inclusive), `YYYY-MM-DD` in local time. */
  to: string;
  project: string;
  folder: string;
  client: string;
  model: string;
  key: string;
  tag: string;
  account: string;
  machine: string;
  status: StatusFilter;
  q: string;
}

export const DEFAULT_FILTERS: TraceFilterState = {
  range: DEFAULT_RANGE,
  from: '',
  to: '',
  project: '',
  folder: '',
  client: '',
  model: '',
  key: '',
  tag: '',
  account: '',
  machine: '',
  status: '',
  q: '',
};

/** All URL parameters owned by the filter state. */
export const FILTER_PARAM_NAMES: ReadonlyArray<keyof TraceFilterState> = [
  'range',
  'from',
  'to',
  ...TEXT_FILTER_FIELDS,
  'status',
  'q',
];

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD` as local midnight. Returns null for anything else. */
export function parseLocalDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Formats a date as local `YYYY-MM-DD`. */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const isRangePreset = (value: string): value is RangePreset =>
  (RANGE_PRESETS as readonly string[]).includes(value);

export function parseFilterState(search: string | URLSearchParams): TraceFilterState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const read = (name: string) => (params.get(name) ?? '').trim();

  const rawRange = read('range');
  let range: RangePreset = isRangePreset(rawRange) ? rawRange : DEFAULT_RANGE;
  let from = read('from');
  let to = read('to');
  if (range === 'custom') {
    if (!parseLocalDate(from) || !parseLocalDate(to)) {
      range = DEFAULT_RANGE;
      from = '';
      to = '';
    } else if (from > to) {
      [from, to] = [to, from];
    }
  } else {
    from = '';
    to = '';
  }

  const status = read('status');
  return {
    range,
    from,
    to,
    project: read('project'),
    folder: read('folder'),
    client: read('client'),
    model: read('model'),
    key: read('key'),
    tag: read('tag'),
    account: read('account'),
    machine: read('machine'),
    status: status === 'ok' || status === 'error' ? status : '',
    // Search text keeps inner spaces; only trim the ends.
    q: (params.get('q') ?? '').trim(),
  };
}

/**
 * Writes the filter state into a copy of `base`, keeping parameters the filter state
 * does not own (for example `turn`, `sort`). Names in `reset` are removed, which pages
 * use to go back to the first page when a filter changes.
 */
export function writeFilterState(
  state: TraceFilterState,
  base: URLSearchParams = new URLSearchParams(),
  reset: readonly string[] = []
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const name of [...FILTER_PARAM_NAMES, ...reset]) next.delete(name);

  if (state.range !== DEFAULT_RANGE) next.set('range', state.range);
  if (state.range === 'custom') {
    if (state.from) next.set('from', state.from);
    if (state.to) next.set('to', state.to);
  }
  for (const field of TEXT_FILTER_FIELDS) {
    const value = state[field].trim();
    if (value) next.set(field, value);
  }
  if (state.status) next.set('status', state.status);
  if (state.q.trim()) next.set('q', state.q.trim());
  return next;
}

/** Stable string for effect dependencies: equal states give equal keys. */
export const filterStateKey = (state: TraceFilterState): string =>
  writeFilterState(state).toString();

const DAY_MS = 86_400_000;

const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Resolves the filter range to concrete instants. `to` is exclusive. */
export function resolveRange(state: TraceFilterState, now: Date): { from: Date; to: Date } {
  switch (state.range) {
    case 'today':
      return { from: startOfLocalDay(now), to: now };
    case '7d':
      return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
    case '30d':
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
    case '90d':
      return { from: new Date(now.getTime() - 90 * DAY_MS), to: now };
    case 'week': {
      const today = startOfLocalDay(now);
      const daysSinceMonday = (today.getDay() + 6) % 7;
      return {
        from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday),
        to: now,
      };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'custom': {
      const from = parseLocalDate(state.from);
      const to = parseLocalDate(state.to);
      if (from && to) {
        return { from, to: new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) };
      }
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
    }
    default: {
      const exhaustive: never = state.range;
      return exhaustive;
    }
  }
}

/** Number of days the range covers, at least one. */
export function rangeDays(range: { from: Date; to: Date }): number {
  return Math.max(1, (range.to.getTime() - range.from.getTime()) / DAY_MS);
}

/** Chart bucket size for a range: hours up to two days, weeks above 120 days. */
export function pickBucket(range: { from: Date; to: Date }): TraceBucketSize {
  const days = rangeDays(range);
  if (days <= 2) return 'hour';
  if (days > 120) return 'week';
  return 'day';
}

/** Filter state to API query parameters (RFC 3339 UTC instants). */
export function toQueryFilters(state: TraceFilterState, now: Date): TraceQueryFilters {
  const range = resolveRange(state, now);
  const query: TraceQueryFilters = {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };
  for (const field of TEXT_FILTER_FIELDS) {
    const value = state[field].trim();
    if (value) query[field] = value;
  }
  if (state.status) query.status = state.status;
  if (state.q.trim()) query.q = state.q.trim();
  return query;
}

/** Number of active filters besides the range and search, for the "Clear filters" action. */
export function activeFilterCount(state: TraceFilterState): number {
  return (
    TEXT_FILTER_FIELDS.filter((field) => state[field].trim() !== '').length +
    (state.status ? 1 : 0)
  );
}
