import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { IconInfo } from '@/components/ui/icons';
import type { TFunction } from 'i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import type { TraceStats, TraceStatsGroupRow, TraceTotals } from '@/services/api/traces';
import {
  buildStackedChart,
  CHART_GROUPS,
  CHART_METRICS,
  OTHER_GROUP_KEY,
  SERIES_COLOR_COUNT,
  seriesColor,
  type ChartGroup,
  type ChartMetric,
} from '../chart';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { FilterBar } from '../components/FilterBar';
import { LoadError } from '../components/LoadError';
import { PageHeader } from '../components/PageHeader';
import { RecorderStatus } from '../components/RecorderStatus';
import { SegmentedControl } from '../components/SegmentedControl';
import { StackedBarChart } from '../components/StackedBarChart';
import { PlanLimitsCard } from '../components/PlanLimitsCard';
import { useTracePaths, useTracesEnvironment } from '../context';
import { filterStateKey, pickBucket, resolveRange, toQueryFilters } from '../filters';
import { relativeChange } from '../format';
import { useTraceFilters } from '../useTraceFilters';
import { useTraceFormat, type TraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import styles from '../Traces.module.scss';

const isMetric = (value: string | null): value is ChartMetric =>
  (CHART_METRICS as readonly (string | null)[]).includes(value);
const isGroup = (value: string | null): value is ChartGroup =>
  (CHART_GROUPS as readonly (string | null)[]).includes(value);

interface OverviewData {
  byGroup: Record<ChartGroup, TraceStats | null>;
}

export function OverviewPage() {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { api } = useTracesEnvironment();
  const paths = useTracePaths();
  const { filters, searchParams, setParam } = useTraceFilters();
  const metric: ChartMetric = isMetric(searchParams.get('metric'))
    ? (searchParams.get('metric') as ChartMetric)
    : 'cost';
  const group: ChartGroup = isGroup(searchParams.get('group'))
    ? (searchParams.get('group') as ChartGroup)
    : 'project';

  const filterKey = filterStateKey(filters);
  const bucket = pickBucket(resolveRange(filters, new Date()));

  const stats = useTraceResource<OverviewData>(`${filterKey}|${group}`, async () => {
    const query = toQueryFilters(filters, new Date());
    const load = (name: ChartGroup) => api.getStats(query, { group: name, bucket });
    const [project, model, client, extra] = await Promise.all([
      load('project'),
      load('model'),
      load('client'),
      group === 'key' ? load('key') : Promise.resolve(null),
    ]);
    return { byGroup: { project, model, client, key: extra } };
  });

  const limits = useTraceResource(filterKey, () =>
    api.getLimits(toQueryFilters(filters, new Date()))
  );

  const reloadAll = useCallback(async () => {
    await Promise.all([stats.reload(), limits.reload()]);
  }, [stats, limits]);
  useHeaderRefresh(reloadAll);

  const projectStats = stats.data?.byGroup.project ?? null;
  const chartStats = stats.data?.byGroup[group] ?? null;
  const chart = useMemo(
    () => (chartStats ? buildStackedChart(chartStats, metric) : null),
    [chartStats, metric]
  );

  const metricOptions = CHART_METRICS.map((value) => ({
    value,
    label: t(`traces.overview.metric_${value}`),
  }));
  const groupOptions = CHART_GROUPS.map((value) => ({
    value,
    label: t(`traces.overview.group_${value}`),
  }));

  const formatValue = (value: number) =>
    metric === 'cost' ? fmt.money(value) : metric === 'tokens' ? fmt.compact(value) : fmt.duration(value);
  const formatTick = (value: number) =>
    metric === 'cost' ? fmt.moneyTick(value) : metric === 'tokens' ? fmt.compact(value) : fmt.hours(value);
  const formatBucket = (start: string) =>
    bucket === 'hour' ? `${fmt.day(start)} ${fmt.clock(start)}` : fmt.day(start);

  const exportFilters = () => toQueryFilters(filters, new Date());

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('traces.overview.title')}
        actions={
          <>
            <RecorderStatus />
            <ExportCsvButton
              label={t('traces.export.csv')}
              group="project"
              period={bucket === 'week' ? 'week' : 'day'}
              getFilters={exportFilters}
            />
          </>
        }
      />

      <FilterBar
        fields={['range', 'project', 'folder', 'client', 'model', 'key', 'account', 'machine', 'status']}
        searchPlaceholder={t('traces.filters.search_titles')}
      />

      {stats.error && !stats.data ? (
        <LoadError
          title={t('traces.overview.load_failed')}
          message={stats.error}
          onRetry={() => void stats.reload()}
        />
      ) : !projectStats || !chart ? (
        <div className={styles.skeletonStack} aria-busy="true" aria-label={t('traces.common.loading')}>
          <div className={styles.kpiGrid}>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} height={104} rounded={12} />
            ))}
          </div>
          <Skeleton height={360} rounded={12} />
        </div>
      ) : (
        <div className={`${styles.page} ${stats.loading ? styles.loadingOverlay : ''}`} aria-busy={stats.loading}>
          <KpiRow totals={projectStats.totals} previous={projectStats.previous} fmt={fmt} />

          {projectStats.totals.unpriced_turns > 0 ? (
            <div className={styles.notice} role="note">
              <IconInfo size={18} className={styles.noticeIcon} />
              <div className={styles.noticeBody}>
                <span>
                  {t('traces.overview.unpriced', {
                    count: projectStats.totals.unpriced_turns,
                    formatted: fmt.count(projectStats.totals.unpriced_turns),
                  })}{' '}
                  <Link className={styles.link} to={paths.settings}>
                    {t('traces.overview.open_prices')}
                  </Link>
                </span>
              </div>
            </div>
          ) : null}

          <section className={styles.card} aria-labelledby="overview-chart-title">
            <div className={styles.cardHeader}>
              <div className={styles.headerText}>
                <h2 id="overview-chart-title" className={styles.cardTitle}>
                  {t(`traces.overview.chart_title_${metric}`, {
                    bucket: t(`traces.overview.bucket_${bucket}`),
                  })}
                </h2>
                <span className={styles.cardSub}>{t(`traces.overview.chart_sub_${group}`)}</span>
              </div>
              <div className={styles.headerActions}>
                <SegmentedControl
                  label={t('traces.overview.metric_label')}
                  value={metric}
                  options={metricOptions}
                  onChange={(value) => setParam('metric', value === 'cost' ? null : value, { replace: true })}
                />
                <SegmentedControl
                  label={t('traces.overview.group_label')}
                  value={group}
                  options={groupOptions}
                  onChange={(value) => setParam('group', value === 'project' ? null : value, { replace: true })}
                />
              </div>
            </div>
            <StackedBarChart
              chart={chart}
              description={t(`traces.overview.chart_title_${metric}`, {
                bucket: t(`traces.overview.bucket_${bucket}`),
              })}
              formatValue={formatValue}
              formatTick={formatTick}
              formatBucket={formatBucket}
            />
            <div className={styles.legend}>
              {chart.series.map((series) => (
                <span key={series.key} className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: seriesColor(series.colorSlot) }} />
                  {seriesLabel(series.key, series.label, t)}{' '}
                  <span className={styles.muted}>{formatValue(series.total)}</span>
                </span>
              ))}
            </div>
            {metric === 'cost' && chart.hasUnknownCost ? (
              <span className={styles.note}>{t('traces.overview.chart_unknown_cost')}</span>
            ) : null}
          </section>

          <div className={styles.grid2}>
            <TopProjects stats={projectStats} fmt={fmt} />
            <ByModel stats={stats.data?.byGroup.model ?? null} fmt={fmt} />
            <ByClient stats={stats.data?.byGroup.client ?? null} fmt={fmt} />
            <PlanLimitsCard resource={limits} />
          </div>
        </div>
      )}
    </div>
  );
}

const seriesLabel = (key: string, label: string, t: TFunction) =>
  key === OTHER_GROUP_KEY && label === OTHER_GROUP_KEY ? t('traces.overview.other') : label;

function KpiRow({ totals, previous, fmt }: { totals: TraceTotals; previous: TraceTotals; fmt: TraceFormat }) {
  const { t } = useTranslation();
  const costChange = relativeChange(totals.cost_usd, previous.cost_usd);
  const tokenTotal = totals.tokens.total;
  const failedShare = totals.turns > 0 ? totals.failed_turns / totals.turns : 0;
  const previousFailedShare = previous.turns > 0 ? previous.failed_turns / previous.turns : null;

  const costSub =
    costChange === null
      ? t('traces.kpi.no_previous')
      : Math.abs(costChange) < 0.005
        ? t('traces.kpi.same_as_previous')
        : t(costChange > 0 ? 'traces.kpi.up_on_previous' : 'traces.kpi.down_on_previous', {
            change: fmt.share(Math.abs(costChange)),
          });

  const kpis = [
    { label: t('traces.kpi.cost'), value: fmt.money(totals.cost_usd), sub: costSub },
    {
      label: t('traces.kpi.tokens'),
      value: fmt.compact(tokenTotal),
      sub:
        tokenTotal > 0
          ? t('traces.kpi.tokens_sub', {
              cache: fmt.share(totals.tokens.cache_read / tokenTotal),
              output: fmt.share(totals.tokens.output / tokenTotal),
            })
          : t('traces.kpi.no_tokens'),
    },
    {
      label: t('traces.kpi.active'),
      value: fmt.hours(totals.active_ms),
      sub: t('traces.kpi.model_time', { duration: fmt.hours(totals.model_ms) }),
    },
    {
      label: t('traces.kpi.sessions'),
      value: fmt.count(totals.sessions),
      sub: t('traces.kpi.sessions_sub', {
        turns: fmt.count(totals.turns),
        subagents: fmt.count(totals.subagent_sessions),
      }),
    },
    {
      label: t('traces.kpi.failed'),
      value: fmt.share(failedShare),
      sub: [
        t('traces.kpi.failed_sub', {
          failed: fmt.count(totals.failed_turns),
          turns: fmt.count(totals.turns),
          recovered: fmt.count(totals.recovered_turns),
        }),
        previousFailedShare === null
          ? null
          : t('traces.kpi.failed_previous', { share: fmt.share(previousFailedShare) }),
      ]
        .filter(Boolean)
        .join('. '),
    },
  ];

  return (
    <div className={styles.kpiGrid}>
      {kpis.map((kpi) => (
        <div key={kpi.label} className={styles.kpi}>
          <span className={styles.kpiLabel}>{kpi.label}</span>
          <span className={styles.kpiValue}>{kpi.value}</span>
          <span className={styles.kpiSub}>{kpi.sub}</span>
        </div>
      ))}
    </div>
  );
}

const slotFor = (groups: TraceStatsGroupRow[], key: string) => {
  if (key === OTHER_GROUP_KEY) return 0;
  const index = groups.filter((group) => group.key !== OTHER_GROUP_KEY).findIndex((group) => group.key === key);
  return index === -1 ? 0 : (index % SERIES_COLOR_COUNT) + 1;
};

function TopProjects({ stats, fmt }: { stats: TraceStats; fmt: TraceFormat }) {
  const { t } = useTranslation();
  const paths = useTracePaths();
  const maxCost = Math.max(0, ...stats.groups.map((group) => group.cost_usd ?? 0));
  return (
    <section className={`${styles.card} ${styles.cardFlush}`} aria-labelledby="overview-projects-title">
      <div className={styles.cardHeader}>
        <h2 id="overview-projects-title" className={styles.cardTitle}>
          {t('traces.overview.top_projects')}
        </h2>
        <Link className={styles.link} to={paths.projects}>
          {t('traces.overview.all_projects')}
        </Link>
      </div>
      {stats.groups.length === 0 ? (
        <div className={styles.emptyBlock}>{t('traces.overview.no_rows')}</div>
      ) : (
        <Table className={styles.table}>
          <TableHeader>
            <tr>
              <TableHead scope="col">{t('traces.columns.project')}</TableHead>
              <TableHead scope="col" alignRight>{t('traces.columns.sessions')}</TableHead>
              <TableHead scope="col" alignRight>{t('traces.columns.active')}</TableHead>
              <TableHead scope="col" alignRight>{t('traces.columns.cost')}</TableHead>
              <TableHead scope="col">{t('traces.columns.share')}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {stats.groups.map((group) => (
              <TableRow key={group.key}>
                <TableCell>
                  <span className={styles.legendItem}>
                    <span
                      className={styles.swatch}
                      style={{ background: seriesColor(slotFor(stats.groups, group.key)) }}
                    />
                    {seriesLabel(group.key, group.label, t)}
                  </span>
                </TableCell>
                <TableCell className={styles.num}>{fmt.count(group.sessions)}</TableCell>
                <TableCell className={styles.num}>{fmt.hours(group.active_ms)}</TableCell>
                <TableCell className={styles.num}>{fmt.money(group.cost_usd)}</TableCell>
                <TableCell style={{ width: 120 }}>
                  <div className={styles.shareTrack} aria-hidden="true">
                    <div
                      className={styles.shareFill}
                      style={{
                        width: `${maxCost > 0 ? ((group.cost_usd ?? 0) / maxCost) * 100 : 0}%`,
                        background: seriesColor(slotFor(stats.groups, group.key)),
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function ByModel({ stats, fmt }: { stats: TraceStats | null; fmt: TraceFormat }) {
  const { t } = useTranslation();
  const groups = stats?.groups ?? [];
  return (
    <section className={`${styles.card} ${styles.cardFlush}`} aria-labelledby="overview-models-title">
      <div className={styles.cardHeader}>
        <h2 id="overview-models-title" className={styles.cardTitle}>
          {t('traces.overview.by_model')}
        </h2>
        <span className={styles.cardSub}>{t('traces.overview.tokens_include_cache')}</span>
      </div>
      {groups.length === 0 ? (
        <div className={styles.emptyBlock}>{t('traces.overview.no_rows')}</div>
      ) : (
        <Table className={styles.table}>
          <TableHeader>
            <tr>
              <TableHead scope="col">{t('traces.columns.model')}</TableHead>
              <TableHead scope="col" alignRight>{t('traces.columns.turns')}</TableHead>
              <TableHead scope="col" alignRight>{t('traces.columns.tokens')}</TableHead>
              <TableHead scope="col" alignRight>{t('traces.columns.cache_read')}</TableHead>
              <TableHead scope="col" alignRight>{t('traces.columns.cost')}</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.key}>
                <TableCell className={group.key === OTHER_GROUP_KEY ? undefined : styles.mono}>
                  {seriesLabel(group.key, group.label, t)}
                </TableCell>
                <TableCell className={styles.num}>{fmt.count(group.turns)}</TableCell>
                <TableCell className={styles.num}>{fmt.compact(group.tokens.total)}</TableCell>
                <TableCell className={styles.num}>
                  {group.tokens.total > 0
                    ? fmt.share(group.tokens.cache_read / group.tokens.total)
                    : t('traces.common.none')}
                </TableCell>
                <TableCell className={styles.num}>{fmt.money(group.cost_usd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function ByClient({ stats, fmt }: { stats: TraceStats | null; fmt: TraceFormat }) {
  const { t } = useTranslation();
  const groups = stats?.groups ?? [];
  const totalCost = groups.reduce((sum, group) => sum + (group.cost_usd ?? 0), 0);
  const useCost = totalCost > 0;
  const total = useCost ? totalCost : groups.reduce((sum, group) => sum + group.turns, 0);
  return (
    <section className={styles.card} aria-labelledby="overview-clients-title">
      <div className={styles.cardHeader}>
        <h2 id="overview-clients-title" className={styles.cardTitle}>
          {t('traces.overview.by_client')}
        </h2>
        <span className={styles.cardSub}>
          {useCost ? t('traces.overview.share_of_cost') : t('traces.overview.share_of_turns')}
        </span>
      </div>
      {groups.length === 0 ? (
        <span className={styles.muted}>{t('traces.overview.no_rows')}</span>
      ) : (
        groups.map((group) => {
          const share = total > 0 ? (useCost ? (group.cost_usd ?? 0) : group.turns) / total : 0;
          return (
            <div key={group.key} className={styles.barRow}>
              <span className={styles.barRowLabel} title={group.label}>
                {seriesLabel(group.key, group.label, t)}
              </span>
              <div className={styles.shareTrack} aria-hidden="true">
                <div
                  className={styles.shareFill}
                  style={{ width: `${share * 100}%`, background: 'var(--trace-level-normal)' }}
                />
              </div>
              <span className={styles.num}>{fmt.share(share)}</span>
            </div>
          );
        })
      )}
    </section>
  );
}

