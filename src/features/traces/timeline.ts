/**
 * Layout for the Trace page timeline: one lane per session (main agent first, then
 * subagents), turn marks placed on a shared time axis, and breaks drawn as narrow
 * bands so a long pause does not squeeze all turns to one side.
 */

import type { TraceSessionDetail, TraceTurnStatus } from '@/services/api/traces';
import { parseTime } from './format';

export interface TimelineTurnMark {
  id: string;
  seq: number;
  status: TraceTurnStatus;
  startMs: number;
  endMs: number;
  /** Left edge, percent of the track width. */
  left: number;
  /** Width, percent of the track width (the view sets a minimum pixel width). */
  width: number;
  laneIndex: number;
}

export interface TimelineLane {
  sessionId: string;
  label: string;
  isMain: boolean;
  parentTurnId: string | null;
  /** `seq` of the parent turn in the main session, when known. */
  parentSeq: number | null;
  turns: TimelineTurnMark[];
}

export interface TimelineBreakBand {
  fromMs: number;
  toMs: number;
  durationMs: number;
  left: number;
  width: number;
}

export interface TimelineTick {
  time: number;
  left: number;
}

export interface TimelineLayout {
  startMs: number;
  endMs: number;
  lanes: TimelineLane[];
  breaks: TimelineBreakBand[];
  ticks: TimelineTick[];
}

export interface TimelineOptions {
  /**
   * Width of each break band as a share of the active time. Default: 8%, reduced so
   * all bands together take at most 25%.
   */
  breakShare?: number;
  /** Rough number of axis ticks to aim for (default 8). */
  targetTicks?: number;
  /** Minimum distance between tick labels, percent of the width (default 7). */
  minTickGap?: number;
}

const MINUTE = 60_000;
const TICK_STEPS = [
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  60 * MINUTE,
  120 * MINUTE,
  180 * MINUTE,
  360 * MINUTE,
  720 * MINUTE,
  1440 * MINUTE,
];

interface CompressedBreak {
  fromMs: number;
  toMs: number;
  displayMs: number;
}

const EMPTY_LAYOUT: TimelineLayout = { startMs: 0, endMs: 0, lanes: [], breaks: [], ticks: [] };

/** Merges overlapping break ranges and clamps them to the session span. */
function normalizeBreaks(
  detail: TraceSessionDetail,
  startMs: number,
  endMs: number
): Array<{ fromMs: number; toMs: number }> {
  const ranges = detail.breaks
    .map((gap) => ({ fromMs: parseTime(gap.from), toMs: parseTime(gap.to) }))
    .filter(
      (gap): gap is { fromMs: number; toMs: number } => gap.fromMs !== null && gap.toMs !== null
    )
    .map((gap) => ({ fromMs: Math.max(startMs, gap.fromMs), toMs: Math.min(endMs, gap.toMs) }))
    .filter((gap) => gap.toMs > gap.fromMs)
    .sort((a, b) => a.fromMs - b.fromMs);

  const merged: Array<{ fromMs: number; toMs: number }> = [];
  for (const gap of ranges) {
    const last = merged[merged.length - 1];
    if (last && gap.fromMs <= last.toMs) last.toMs = Math.max(last.toMs, gap.toMs);
    else merged.push({ ...gap });
  }
  return merged;
}

/** Maps an instant to a percent position on the compressed axis. */
function createScale(startMs: number, endMs: number, breaks: CompressedBreak[]) {
  const breakMs = breaks.reduce((sum, gap) => sum + (gap.toMs - gap.fromMs), 0);
  const displayBreakMs = breaks.reduce((sum, gap) => sum + gap.displayMs, 0);
  const totalMs = Math.max(1, endMs - startMs - breakMs + displayBreakMs);

  return (time: number): number => {
    const clamped = Math.min(endMs, Math.max(startMs, time));
    let offset = 0;
    let cursor = startMs;
    for (const gap of breaks) {
      if (clamped <= gap.fromMs) break;
      if (clamped < gap.toMs) {
        offset += gap.fromMs - cursor;
        offset += ((clamped - gap.fromMs) / (gap.toMs - gap.fromMs)) * gap.displayMs;
        return (offset / totalMs) * 100;
      }
      offset += gap.fromMs - cursor + gap.displayMs;
      cursor = gap.toMs;
    }
    offset += clamped - cursor;
    return (offset / totalMs) * 100;
  };
}

function buildTicks(
  startMs: number,
  endMs: number,
  activeMs: number,
  breaks: CompressedBreak[],
  scale: (time: number) => number,
  options: Required<Omit<TimelineOptions, 'breakShare'>>
): TimelineTick[] {
  const step =
    TICK_STEPS.find((candidate) => activeMs / candidate <= options.targetTicks) ??
    TICK_STEPS[TICK_STEPS.length - 1];
  const dayStart = new Date(startMs);
  dayStart.setHours(0, 0, 0, 0);
  const first = dayStart.getTime() + Math.ceil((startMs - dayStart.getTime()) / step) * step;

  const ticks: TimelineTick[] = [{ time: startMs, left: 0 }];
  const insideBreak = (time: number) =>
    breaks.some((gap) => time > gap.fromMs && time < gap.toMs);
  for (let time = first; time <= endMs; time += step) {
    if (time === startMs || insideBreak(time)) continue;
    const left = scale(time);
    const previous = ticks[ticks.length - 1];
    if (left - previous.left < options.minTickGap || left > 100 - options.minTickGap / 2) continue;
    ticks.push({ time, left });
  }
  return ticks;
}

export function layoutTimeline(
  detail: TraceSessionDetail,
  options: TimelineOptions = {}
): TimelineLayout {
  const resolved: Required<Omit<TimelineOptions, 'breakShare'>> = {
    targetTicks: options.targetTicks ?? 8,
    minTickGap: options.minTickGap ?? 7,
  };

  const timed = detail.turns
    .map((turn) => {
      const startMs = parseTime(turn.started_at);
      if (startMs === null) return null;
      const endedMs = parseTime(turn.ended_at);
      const endMs = Math.max(startMs, endedMs ?? startMs + Math.max(0, turn.latency_ms));
      return { turn, startMs, endMs };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.startMs - b.startMs || a.turn.seq - b.turn.seq);

  if (timed.length === 0) return EMPTY_LAYOUT;

  const startMs = timed[0].startMs;
  const endMs = Math.max(startMs + 1, ...timed.map((entry) => entry.endMs));

  const rawBreaks = normalizeBreaks(detail, startMs, endMs);
  const breakMs = rawBreaks.reduce((sum, gap) => sum + (gap.toMs - gap.fromMs), 0);
  const activeMs = Math.max(1, endMs - startMs - breakMs);
  const breakShare = options.breakShare ?? Math.min(0.08, 0.25 / Math.max(1, rawBreaks.length));
  const cap = Math.max(1, activeMs * breakShare);
  const breaks: CompressedBreak[] = rawBreaks.map((gap) => ({
    ...gap,
    displayMs: Math.min(gap.toMs - gap.fromMs, cap),
  }));
  const scale = createScale(startMs, endMs, breaks);

  // Lanes: the API sends lanes[0] as the main session. Turns from a session without a
  // lane get their own lane at the end, so nothing is hidden.
  const laneSources = detail.lanes.length
    ? detail.lanes.map((lane) => ({ ...lane }))
    : [{ session_id: detail.session.id, label: '', parent_turn_id: null, turns: 0 }];
  const laneIndexBySession = new Map(laneSources.map((lane, index) => [lane.session_id, index]));
  for (const entry of timed) {
    if (!laneIndexBySession.has(entry.turn.session_id)) {
      laneIndexBySession.set(entry.turn.session_id, laneSources.length);
      laneSources.push({
        session_id: entry.turn.session_id,
        label: '',
        parent_turn_id: null,
        turns: 0,
      });
    }
  }

  const seqById = new Map(detail.turns.map((turn) => [turn.id, turn.seq]));
  const lanes: TimelineLane[] = laneSources.map((lane, index) => ({
    sessionId: lane.session_id,
    label: lane.label,
    isMain: index === 0,
    parentTurnId: lane.parent_turn_id,
    parentSeq: lane.parent_turn_id ? (seqById.get(lane.parent_turn_id) ?? null) : null,
    turns: [],
  }));

  for (const entry of timed) {
    const laneIndex = laneIndexBySession.get(entry.turn.session_id) ?? 0;
    const left = scale(entry.startMs);
    lanes[laneIndex].turns.push({
      id: entry.turn.id,
      seq: entry.turn.seq,
      status: entry.turn.status,
      startMs: entry.startMs,
      endMs: entry.endMs,
      left,
      width: Math.max(0, scale(entry.endMs) - left),
      laneIndex,
    });
  }

  return {
    startMs,
    endMs,
    lanes,
    breaks: breaks.map((gap) => {
      const left = scale(gap.fromMs);
      return {
        fromMs: gap.fromMs,
        toMs: gap.toMs,
        durationMs: gap.toMs - gap.fromMs,
        left,
        width: scale(gap.toMs) - left,
      };
    }),
    ticks: buildTicks(startMs, endMs, activeMs, breaks, scale, resolved),
  };
}

export type TimelineKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export const isTimelineKey = (key: string): key is TimelineKey =>
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);

/**
 * Keyboard movement between turns. Left and right move within a lane; up and down
 * move to the turn closest in time on the lane above or below (skipping empty lanes).
 * Returns the turn ID to select, or null when there is nowhere to go.
 */
export function stepTurn(
  layout: TimelineLayout,
  currentId: string | null,
  key: TimelineKey
): string | null {
  const lanes = layout.lanes;
  const firstTurn = lanes.find((lane) => lane.turns.length > 0)?.turns[0] ?? null;
  if (!firstTurn) return null;

  const laneIndex = lanes.findIndex((lane) => lane.turns.some((turn) => turn.id === currentId));
  if (laneIndex === -1) return firstTurn.id;
  const lane = lanes[laneIndex];
  const position = lane.turns.findIndex((turn) => turn.id === currentId);
  const current = lane.turns[position];

  switch (key) {
    case 'ArrowLeft':
      return lane.turns[position - 1]?.id ?? null;
    case 'ArrowRight':
      return lane.turns[position + 1]?.id ?? null;
    case 'Home':
      return lane.turns[0].id;
    case 'End':
      return lane.turns[lane.turns.length - 1].id;
    case 'ArrowUp':
    case 'ArrowDown': {
      const direction = key === 'ArrowUp' ? -1 : 1;
      for (let index = laneIndex + direction; index >= 0 && index < lanes.length; index += direction) {
        const candidates = lanes[index].turns;
        if (candidates.length === 0) continue;
        const middle = (current.startMs + current.endMs) / 2;
        let best = candidates[0];
        for (const candidate of candidates) {
          const distance = Math.abs((candidate.startMs + candidate.endMs) / 2 - middle);
          const bestDistance = Math.abs((best.startMs + best.endMs) / 2 - middle);
          if (distance < bestDistance) best = candidate;
        }
        return best.id;
      }
      return null;
    }
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}
