import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/services/api/client';
import type { TraceHealth, TracesApi } from '@/services/api/traces';
import { getErrorMessage } from '@/utils/helpers';
import { LoadError } from './components/LoadError';
import { PageHeader } from './components/PageHeader';
import { TracesHealthContext, useTracesEnvironment } from './context';
import { resolveTracesGate, TRACES_ENABLED_CONFIG_KEY, type HealthLoadStatus } from './gate';
import styles from './Traces.module.scss';

const HEALTH_CACHE_MS = 60_000;

interface CachedHealth {
  revision: number;
  health: TraceHealth;
  at: number;
}

// Last health per API object, so moving between Traces pages does not flash a loader.
// The connection revision makes a cache from an old login unusable.
const healthCache = new WeakMap<TracesApi, CachedHealth>();

const readCache = (api: TracesApi): TraceHealth | null => {
  const cached = healthCache.get(api);
  if (!cached) return null;
  if (cached.revision !== apiClient.getConnectionRevision()) return null;
  if (Date.now() - cached.at > HEALTH_CACHE_MS) return null;
  return cached.health;
};

interface HealthState {
  status: HealthLoadStatus;
  health: TraceHealth | null;
  error: string;
}

/**
 * Route element for every Traces page. Loads `/traces/health` and shows one of: a
 * loader, a load error, the "traces are off" state, or the page.
 */
export function TracesShell() {
  const { t } = useTranslation();
  const { api, configPath } = useTracesEnvironment();
  const [state, setState] = useState<HealthState>(() => {
    const cached = readCache(api);
    return { status: cached ? 'ready' : 'loading', health: cached, error: '' };
  });
  const requestRef = useRef(0);

  const loadHealth = useCallback(async () => {
    const request = ++requestRef.current;
    const revision = apiClient.getConnectionRevision();
    setState((current) => ({ ...current, status: current.health ? current.status : 'loading' }));
    try {
      const health = await api.getHealth();
      if (request !== requestRef.current || revision !== apiClient.getConnectionRevision()) return;
      healthCache.set(api, { revision, health, at: Date.now() });
      setState({ status: 'ready', health, error: '' });
    } catch (error) {
      if (request !== requestRef.current) return;
      setState((current) => ({
        ...current,
        status: 'error',
        error: getErrorMessage(error, t('traces.common.unknown')),
      }));
    }
  }, [api, t]);

  useEffect(() => {
    void loadHealth();
    return () => {
      requestRef.current += 1;
    };
  }, [loadHealth]);

  const gate = resolveTracesGate(state);
  const health = gate.kind === 'ready' ? gate.health : null;
  const contextValue = useMemo(
    () => (health ? { health, reloadHealth: loadHealth } : null),
    [health, loadHealth]
  );

  if (gate.kind === 'ready' && contextValue) {
    return (
      <TracesHealthContext.Provider value={contextValue}>
        <Outlet />
      </TracesHealthContext.Provider>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('traces.nav.traces')} />
      {gate.kind === 'loading' ? (
        <div className={styles.skeletonStack} aria-busy="true" aria-label={t('traces.common.loading')}>
          <Skeleton height={96} rounded={12} />
          <Skeleton height={240} rounded={12} />
        </div>
      ) : gate.kind === 'error' ? (
        <LoadError
          title={t('traces.gate.load_failed')}
          message={gate.message}
          onRetry={() => void loadHealth()}
        />
      ) : (
        <TracesDisabledState configPath={configPath} />
      )}
    </div>
  );
}

/** Shown on every Traces page while `traces.enabled` is false. */
export function TracesDisabledState({ configPath }: { configPath: string }) {
  const { t } = useTranslation();
  return (
    <section className={styles.stateCard} aria-labelledby="traces-disabled-title">
      <h2 id="traces-disabled-title" className={styles.stateTitle}>
        {t('traces.gate.disabled_title')}
      </h2>
      <p className={styles.stateText}>
        {t('traces.gate.disabled_before')}{' '}
        <code className={styles.code}>{TRACES_ENABLED_CONFIG_KEY}: true</code>{' '}
        {t('traces.gate.disabled_after')}
      </p>
      <Link className="btn btn-primary btn-sm" to={configPath}>
        {t('traces.gate.open_config')}
      </Link>
    </section>
  );
}
