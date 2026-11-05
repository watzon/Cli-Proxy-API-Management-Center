import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { IconChevronDown, IconChevronUp } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import type { TraceSessionSort, TraceSortOrder } from '@/services/api/traces';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { FilterBar } from '../components/FilterBar';
import { LoadError } from '../components/LoadError';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { SessionStatusBadge } from '../components/StatusBadge';
import { useTracePaths, useTracesEnvironment } from '../context';
import { activeFilterCount, filterStateKey, toQueryFilters } from '../filters';
import { shortId } from '../format';
import { useTraceFilters } from '../useTraceFilters';
import { useTraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import styles from '../Traces.module.scss';

const SESSIONS_PAGE_SIZE = 25;

const SORTS: readonly TraceSessionSort[] = ['started_at', 'cost', 'tokens', 'active', 'turns'];

export function SessionsPage() {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const location = useLocation();
  const { api } = useTracesEnvironment();
  const paths = useTracePaths();
  const { filters, setFilters, searchParams, setParam, updateParams } = useTraceFilters();

  const rawSort = searchParams.get('sort');
  const sort: TraceSessionSort = SORTS.includes(rawSort as TraceSessionSort)
    ? (rawSort as TraceSessionSort)
    : 'started_at';
  const order: TraceSortOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const key = `${filterStateKey(filters)}|${sort}|${order}|${page}`;
  const resource = useTraceResource(key, () =>
    api.getSessions(toQueryFilters(filters, new Date()), {
      sort,
      order,
      limit: SESSIONS_PAGE_SIZE,
      offset: (page - 1) * SESSIONS_PAGE_SIZE,
    })
  );
  const reload = useCallback(() => resource.reload(), [resource]);
  useHeaderRefresh(reload);

  const setSort = (next: TraceSessionSort) => {
    const nextOrder: TraceSortOrder = next === sort && order === 'desc' ? 'asc' : 'desc';
    updateParams((params) => {
      if (next === 'started_at') params.delete('sort');
      else params.set('sort', next);
      if (nextOrder === 'desc') params.delete('order');
      else params.set('order', nextOrder);
      params.delete('page');
    });
  };

  const data = resource.data;
  const hasFilters = activeFilterCount(filters) > 0 || filters.q !== '';

  const sortableHead = (column: TraceSessionSort, label: string, alignRight = true) => {
    const active = sort === column;
    return (
      <TableHead
        scope="col"
        alignRight={alignRight}
        aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className={styles.sortButton} onClick={() => setSort(column)}>
          {label}
          <span className={`${styles.sortIcon} ${active ? styles.sortIconActive : ''}`} aria-hidden="true">
            {active && order === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
          </span>
        </button>
      </TableHead>
    );
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('traces.sessions.title')}
        actions={
          <ExportCsvButton
            label={t('traces.export.csv')}
            group="session"
            period="day"
            getFilters={() => toQueryFilters(filters, new Date())}
          />
        }
      />

      <FilterBar
        fields={['range', 'project', 'client', 'model', 'key', 'status']}
        searchPlaceholder={t('traces.filters.search_sessions')}
      />

      {data ? (
        <div className={styles.summaryLine}>
          <span>
            {t('traces.sessions.shown', {
              shown: fmt.count(data.sessions.length),
              total: fmt.count(data.total),
            })}
          </span>
          <span>
            <strong>{fmt.count(data.summary.turns)}</strong> {t('traces.sessions.turns_label')}
          </span>
          <span>
            <strong>{fmt.hours(data.summary.active_ms)}</strong> {t('traces.sessions.active_label')}
          </span>
          <span>
            <strong>{fmt.money(data.summary.cost_usd)}</strong> {t('traces.sessions.cost_label')}
          </span>
        </div>
      ) : null}

      {resource.error && !data ? (
        <LoadError
          title={t('traces.sessions.load_failed')}
          message={resource.error}
          onRetry={() => void resource.reload()}
        />
      ) : !data ? (
        <div className={styles.skeletonStack} aria-busy="true" aria-label={t('traces.common.loading')}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={44} rounded={8} />
          ))}
        </div>
      ) : (
        <section
          className={`${styles.card} ${styles.cardFlush} ${resource.loading ? styles.loadingOverlay : ''}`}
          aria-busy={resource.loading}
          aria-label={t('traces.sessions.title')}
        >
          {data.sessions.length === 0 ? (
            <div className={styles.emptyBlock}>
              {hasFilters
                ? filters.q
                  ? t('traces.sessions.empty_search', { q: filters.q })
                  : t('traces.sessions.empty_filtered')
                : t('traces.sessions.empty')}
              {hasFilters ? (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() =>
                      setFilters({
                        q: '',
                        project: '',
                        client: '',
                        model: '',
                        key: '',
                        status: '',
                      })
                    }
                  >
                    <span className={styles.link}>{t('traces.sessions.clear_all')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Table className={`${styles.table} ${styles.tableInCard}`}>
              <TableHeader>
                <tr>
                  <TableHead scope="col">{t('traces.columns.session')}</TableHead>
                  <TableHead scope="col">{t('traces.columns.project')}</TableHead>
                  <TableHead scope="col">{t('traces.columns.client')}</TableHead>
                  <TableHead scope="col">{t('traces.columns.model')}</TableHead>
                  <TableHead scope="col">{t('traces.columns.key')}</TableHead>
                  {sortableHead('turns', t('traces.columns.turns'))}
                  {sortableHead('tokens', t('traces.columns.tokens'))}
                  {sortableHead('cost', t('traces.columns.cost'))}
                  {sortableHead('active', t('traces.columns.active'))}
                  <TableHead scope="col">{t('traces.columns.status')}</TableHead>
                  {sortableHead('started_at', t('traces.columns.started'), false)}
                </tr>
              </TableHeader>
              <TableBody>
                {data.sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className={styles.wrapCell}>
                      <Link
                        className={styles.rowTitle}
                        to={paths.session(session.id)}
                        state={{ backSearch: location.search }}
                      >
                        {session.title || t('traces.sessions.untitled')}
                      </Link>
                      <div className={styles.rowMeta}>
                        <span className={styles.mono} title={session.id}>
                          {shortId(session.id)}
                        </span>
                        {session.subagents > 0 ? (
                          <span>{t('traces.sessions.subagents', { count: session.subagents })}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {session.project || t('traces.common.none')}
                      {session.project_source ? (
                        <div className={styles.rowMeta} title={session.folder || undefined}>
                          <span>{t(`traces.project_source.${session.project_source}`)}</span>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {session.client
                        ? `${session.client}${session.client_version ? ` ${session.client_version}` : ''}`
                        : t('traces.common.none')}
                    </TableCell>
                    <TableCell className={styles.mono}>{session.model || t('traces.common.none')}</TableCell>
                    <TableCell>
                      {session.key_label ? <span className={styles.pill}>{session.key_label}</span> : t('traces.common.none')}
                    </TableCell>
                    <TableCell className={styles.num}>{fmt.count(session.turns)}</TableCell>
                    <TableCell className={styles.num}>{fmt.compact(session.tokens.total)}</TableCell>
                    <TableCell className={styles.num}>{fmt.money(session.cost_usd)}</TableCell>
                    <TableCell className={styles.num}>{fmt.duration(session.active_ms)}</TableCell>
                    <TableCell>
                      <SessionStatusBadge errors={session.errors} />
                    </TableCell>
                    <TableCell className={styles.muted}>{fmt.dateTime(session.started_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination
            page={page}
            pageSize={SESSIONS_PAGE_SIZE}
            total={data.total}
            onPage={(next) => setParam('page', next > 1 ? String(next) : null)}
          />
        </section>
      )}
    </div>
  );
}
