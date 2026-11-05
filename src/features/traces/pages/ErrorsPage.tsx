import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { FilterBar } from '../components/FilterBar';
import { LoadError } from '../components/LoadError';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { TurnStatusBadge } from '../components/StatusBadge';
import { useTracePaths, useTracesEnvironment } from '../context';
import { filterStateKey, toQueryFilters } from '../filters';
import { useTraceFilters } from '../useTraceFilters';
import { useTraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import styles from '../Traces.module.scss';

const ERRORS_PAGE_SIZE = 50;

export function ErrorsPage() {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { api } = useTracesEnvironment();
  const paths = useTracePaths();
  const { filters, searchParams, setParam } = useTraceFilters();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const resource = useTraceResource(`${filterStateKey(filters)}|${page}`, () =>
    api.getErrors(toQueryFilters(filters, new Date()), {
      limit: ERRORS_PAGE_SIZE,
      offset: (page - 1) * ERRORS_PAGE_SIZE,
    })
  );
  const reload = useCallback(() => resource.reload(), [resource]);
  useHeaderRefresh(reload);
  const data = resource.data;
  const maxCount = Math.max(0, ...(data?.groups ?? []).map((group) => group.count));

  return (
    <div className={styles.page}>
      <PageHeader title={t('traces.errors.title')} />
      <FilterBar fields={['range', 'project', 'client', 'model', 'key', 'account']} />

      {resource.error && !data ? (
        <LoadError
          title={t('traces.errors.load_failed')}
          message={resource.error}
          onRetry={() => void resource.reload()}
        />
      ) : !data ? (
        <div className={styles.skeletonStack} aria-busy="true" aria-label={t('traces.common.loading')}>
          <Skeleton height={160} rounded={12} />
          <Skeleton height={320} rounded={12} />
        </div>
      ) : data.total === 0 && data.groups.length === 0 ? (
        <div className={styles.card}>
          <span className={styles.muted}>{t('traces.errors.empty')}</span>
        </div>
      ) : (
        <div className={`${styles.page} ${resource.loading ? styles.loadingOverlay : ''}`} aria-busy={resource.loading}>
          <section className={`${styles.card} ${styles.cardFlush}`} aria-labelledby="error-groups-title">
            <div className={styles.cardHeader}>
              <h2 id="error-groups-title" className={styles.cardTitle}>
                {t('traces.errors.groups_title')}
              </h2>
              <span className={styles.cardSub}>
                {t('traces.errors.total', { count: data.total, formatted: fmt.count(data.total) })}
              </span>
            </div>
            <Table className={`${styles.table} ${styles.tableInCard}`}>
              <TableHeader>
                <tr>
                  <TableHead scope="col">{t('traces.errors.type')}</TableHead>
                  <TableHead scope="col">{t('traces.columns.account')}</TableHead>
                  <TableHead scope="col" alignRight>{t('traces.errors.count')}</TableHead>
                  <TableHead scope="col">
                    <span className={styles.srOnly}>{t('traces.columns.share')}</span>
                  </TableHead>
                  <TableHead scope="col">{t('traces.errors.last_seen')}</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {data.groups.map((group) => (
                  <TableRow key={`${group.type}-${group.account}`}>
                    <TableCell className={styles.mono}>{group.type || t('traces.common.unknown')}</TableCell>
                    <TableCell>{group.account || t('traces.common.none')}</TableCell>
                    <TableCell className={styles.num}>{fmt.count(group.count)}</TableCell>
                    <TableCell style={{ width: 140 }}>
                      <div className={styles.shareTrack} aria-hidden="true">
                        <div
                          className={styles.shareFill}
                          style={{
                            width: `${maxCount > 0 ? (group.count / maxCount) * 100 : 0}%`,
                            background: 'var(--trace-error)',
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className={styles.muted}>{fmt.dateTime(group.last_at || null)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className={`${styles.card} ${styles.cardFlush}`} aria-labelledby="error-list-title">
            <div className={styles.cardHeader}>
              <h2 id="error-list-title" className={styles.cardTitle}>
                {t('traces.errors.list_title')}
              </h2>
            </div>
            {data.items.length === 0 ? (
              <div className={styles.emptyBlock}>{t('traces.errors.empty_page')}</div>
            ) : (
              <Table className={`${styles.table} ${styles.tableInCard}`}>
                <TableHeader>
                  <tr>
                    <TableHead scope="col">{t('traces.errors.when')}</TableHead>
                    <TableHead scope="col">{t('traces.columns.session')}</TableHead>
                    <TableHead scope="col">{t('traces.columns.project')}</TableHead>
                    <TableHead scope="col">{t('traces.columns.account')}</TableHead>
                    <TableHead scope="col" alignRight>{t('traces.errors.http')}</TableHead>
                    <TableHead scope="col">{t('traces.errors.message')}</TableHead>
                    <TableHead scope="col">{t('traces.errors.outcome')}</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.turn_id}>
                      <TableCell className={styles.muted}>{fmt.dateTime(item.at || null)}</TableCell>
                      <TableCell className={styles.wrapCell}>
                        <Link className={styles.rowTitle} to={paths.session(item.session_id, item.turn_id)}>
                          {item.title || t('traces.sessions.untitled')}
                        </Link>
                      </TableCell>
                      <TableCell>{item.project || t('traces.common.none')}</TableCell>
                      <TableCell>{item.account || t('traces.common.none')}</TableCell>
                      <TableCell className={styles.num}>{item.http_status || t('traces.common.none')}</TableCell>
                      <TableCell className={styles.wrapCell}>
                        <span className={styles.mono}>{item.error || t('traces.common.unknown')}</span>
                      </TableCell>
                      <TableCell>
                        {item.recovered ? (
                          <TurnStatusBadge status="retried" label={t('traces.errors.recovered')} />
                        ) : (
                          <TurnStatusBadge status="error" label={t('traces.errors.not_recovered')} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pagination
              page={page}
              pageSize={ERRORS_PAGE_SIZE}
              total={data.total}
              onPage={(next) => setParam('page', next > 1 ? String(next) : null)}
            />
          </section>
        </div>
      )}
    </div>
  );
}
