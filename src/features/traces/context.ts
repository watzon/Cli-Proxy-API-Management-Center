import { createContext, useContext, useMemo } from 'react';
import { tracesApi, type TraceHealth, type TracesApi } from '@/services/api/traces';

/**
 * Where the Traces pages get their data and how they build links. The app uses the
 * real API under `/traces`; the dev preview swaps in a mock API and its own base path.
 */
export interface TracesEnvironment {
  api: TracesApi;
  basePath: string;
  configPath: string;
}

export const DEFAULT_TRACES_ENVIRONMENT: TracesEnvironment = {
  api: tracesApi,
  basePath: '/traces',
  configPath: '/config',
};

export const TracesEnvironmentContext = createContext<TracesEnvironment>(
  DEFAULT_TRACES_ENVIRONMENT
);

export const useTracesEnvironment = (): TracesEnvironment => useContext(TracesEnvironmentContext);

export interface TracesHealthValue {
  health: TraceHealth;
  reloadHealth: () => Promise<void>;
}

export const TracesHealthContext = createContext<TracesHealthValue | null>(null);

export function useTracesHealth(): TracesHealthValue {
  const value = useContext(TracesHealthContext);
  if (!value) throw new Error('useTracesHealth must be used inside the Traces shell');
  return value;
}

export interface TracePaths {
  overview: string;
  projects: string;
  sessions: string;
  errors: string;
  accounts: string;
  settings: string;
  session: (id: string, turnId?: string | null) => string;
}

export function tracePaths(basePath: string): TracePaths {
  return {
    overview: basePath,
    projects: `${basePath}/projects`,
    sessions: `${basePath}/sessions`,
    errors: `${basePath}/errors`,
    accounts: `${basePath}/accounts`,
    settings: `${basePath}/settings`,
    session: (id, turnId) =>
      `${basePath}/sessions/${encodeURIComponent(id)}${
        turnId ? `?turn=${encodeURIComponent(turnId)}` : ''
      }`,
  };
}

export function useTracePaths(): TracePaths {
  const { basePath } = useTracesEnvironment();
  return useMemo(() => tracePaths(basePath), [basePath]);
}
