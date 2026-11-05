import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseFilterState, writeFilterState, type TraceFilterState } from './filters';

/** Parameters that point into a filtered list and must reset when a filter changes. */
const RESET_ON_FILTER_CHANGE = ['page'];

/**
 * Filter state from the URL query. Changes push a history entry (so the back button
 * undoes them), except when `replace` is set, which search typing uses.
 */
export function useTraceFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilterState(searchParams), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<TraceFilterState>, options: { replace?: boolean } = {}) => {
      setSearchParams(
        (current) =>
          writeFilterState(
            { ...parseFilterState(current), ...patch },
            current,
            RESET_ON_FILTER_CHANGE
          ),
        { replace: options.replace }
      );
    },
    [setSearchParams]
  );

  /** Sets or removes one page-owned parameter (for example `sort` or `turn`). */
  const setParam = useCallback(
    (name: string, value: string | null, options: { replace?: boolean } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === null || value === '') next.delete(name);
          else next.set(name, value);
          return next;
        },
        { replace: options.replace }
      );
    },
    [setSearchParams]
  );

  /** Applies several page-owned parameter changes as one history entry. */
  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void, options: { replace?: boolean } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutate(next);
          return next;
        },
        { replace: options.replace }
      );
    },
    [setSearchParams]
  );

  return { filters, setFilters, searchParams, setParam, updateParams };
}
