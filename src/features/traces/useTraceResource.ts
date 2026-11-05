import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/utils/helpers';

export interface TraceResource<T> {
  data: T | null;
  error: string | null;
  /** True while a request runs. Old data stays visible during a reload. */
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Loads data when `key` changes. A response is applied only if no newer request has
 * started and the component is still mounted, so a slow old response never replaces
 * newer data. Pass `null` as the key to skip loading.
 */
export function useTraceResource<T>(key: string | null, load: () => Promise<T>): TraceResource<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>(
    { data: null, error: null, loading: key !== null }
  );
  const loadRef = useRef(load);
  const requestRef = useRef(0);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    []
  );

  const run = useCallback(async () => {
    const request = ++requestRef.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loadRef.current();
      if (request !== requestRef.current) return;
      setState({ data, error: null, loading: false });
    } catch (error) {
      if (request !== requestRef.current) return;
      setState((current) => ({
        ...current,
        error: getErrorMessage(error, 'Request failed'),
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    if (key === null) return;
    void run();
  }, [key, run]);

  return { ...state, reload: run };
}
