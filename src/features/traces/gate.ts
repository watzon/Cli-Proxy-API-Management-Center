/**
 * Decides what a Traces page shows before its own data: loading, a load error, the
 * "traces are off" empty state, or the page itself.
 */

import type { TraceHealth } from '@/services/api/traces';

export type HealthLoadStatus = 'loading' | 'error' | 'ready';

export type TracesGateState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'disabled'; health: TraceHealth }
  | { kind: 'ready'; health: TraceHealth };

/** The config key that turns traces on. Shown in the disabled state. */
export const TRACES_ENABLED_CONFIG_KEY = 'traces.enabled';

export function resolveTracesGate(input: {
  status: HealthLoadStatus;
  health: TraceHealth | null;
  error: string;
}): TracesGateState {
  // Keep showing a known health while a refresh runs or fails, so the page does not flash.
  if (input.health) {
    return input.health.enabled
      ? { kind: 'ready', health: input.health }
      : { kind: 'disabled', health: input.health };
  }
  if (input.status === 'error') return { kind: 'error', message: input.error };
  return { kind: 'loading' };
}
