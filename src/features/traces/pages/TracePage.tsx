import { useCallback, useMemo, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconChevronLeft, IconDownload, IconTrash2 } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import type { TraceSessionDetail, TraceTurn } from '@/services/api/traces';
import { useNotificationStore } from '@/stores';
import { downloadBlob } from '@/utils/download';
import { getErrorMessage, isRecord } from '@/utils/helpers';
import { LoadError } from '../components/LoadError';
import { PageHeader } from '../components/PageHeader';
import { TraceTimeline } from '../components/TraceTimeline';
import { TurnDetail } from '../components/TurnDetail';
import { useTracePaths, useTracesEnvironment } from '../context';
import { shortId } from '../format';
import { layoutTimeline, type TimelineLayout } from '../timeline';
import { useTraceFilters } from '../useTraceFilters';
import { useTraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import styles from '../Traces.module.scss';
import pageStyles from './TracePage.module.scss';

const backSearchFrom = (state: unknown): string => {
  if (isRecord(state) && typeof state.backSearch === 'string') return state.backSearch;
  return '';
};

export function TracePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const location = useLocation();
  const { api } = useTracesEnvironment();
  const paths = useTracePaths();
  const { searchParams, setParam } = useTraceFilters();
  const resource = useTraceResource(id || null, () => api.getSession(id));
  const reload = useCallback(() => resource.reload(), [resource]);
  useHeaderRefresh(reload);

  const detail = resource.data && resource.data.session.id === id ? resource.data : null;
  const layout = useMemo(() => (detail ? layoutTimeline(detail) : null), [detail]);
  const backTo = `${paths.sessions}${backSearchFrom(location.state)}`;

  const backLink = (
    <Link className={styles.backLink} to={backTo}>
      <IconChevronLeft size={14} />
      {t('traces.trace.back')}
    </Link>
  );

  if (resource.error && !detail) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('traces.trace.title_fallback')} above={backLink} />
        <LoadError
          title={t('traces.trace.load_failed')}
          message={resource.error}
          onRetry={() => void resource.reload()}
        />
      </div>
    );
  }

  if (!detail || !layout) {
    return (
      <div className={styles.page} aria-busy="true">
        <PageHeader title={<Skeleton width={320} height={28} />} above={backLink} />
        <div className={styles.statGrid}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={70} rounded={10} />
          ))}
        </div>
        <Skeleton height={200} rounded={12} />
      </div>
    );
  }

  return (
    <TraceView
      detail={detail}
      layout={layout}
      backLink={backLink}
      selectedParam={searchParams.get('turn')}
      onSelect={(turnId) => setParam('turn', turnId, { replace: true })}
    />
  );
}

function TraceView({
  detail,
  layout,
  backLink,
  selectedParam,
  onSelect,
}: {
  detail: TraceSessionDetail;
  layout: TimelineLayout;
  backLink: ReactNode;
  selectedParam: string | null;
  onSelect: (turnId: string) => void;
}) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const navigate = useNavigate();
  const { api } = useTracesEnvironment();
  const paths = useTracePaths();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const { session } = detail;

  const turnsById = useMemo(() => new Map(detail.turns.map((turn) => [turn.id, turn])), [detail]);
  const firstTurnId = layout.lanes.find((lane) => lane.turns.length > 0)?.turns[0]?.id ?? null;
  const selectedId = selectedParam && turnsById.has(selectedParam) ? selectedParam : firstTurnId;
  const selectedTurn = selectedId ? (turnsById.get(selectedId) ?? null) : null;

  const laneIndex = layout.lanes.findIndex((lane) => lane.turns.some((turn) => turn.id === selectedId));
  const lane = laneIndex >= 0 ? layout.lanes[laneIndex] : null;
  const heading = !selectedTurn
    ? ''
    : !lane || lane.isMain
      ? t('traces.trace.turn_heading', { seq: selectedTurn.seq })
      : t('traces.trace.subagent_turn_heading', {
          lane: lane.label || t('traces.timeline.subagent_lane', { n: laneIndex }),
          seq: selectedTurn.seq,
        });
  const parentTurn: TraceTurn | null =
    lane && lane.parentTurnId ? (turnsById.get(lane.parentTurnId) ?? null) : null;

  const chips: Array<[string, string]> = [
    [t('traces.columns.project'), session.project],
    [t('traces.project_source.label'), session.project_source ? t(`traces.project_source.${session.project_source}`) : ''],
    [t('traces.facts.folder'), session.folder],
    [
      t('traces.columns.client'),
      session.client ? `${session.client}${session.client_version ? ` ${session.client_version}` : ''}` : '',
    ],
    [t('traces.columns.model'), session.model],
    [t('traces.columns.key'), session.key_label],
    [t('traces.trace.machine'), session.machine],
    [t('traces.columns.started'), fmt.dateTime(session.started_at)],
    [t('traces.columns.session'), shortId(session.id)],
  ];
  const visibleChips = chips.filter(([, value]) => value);

  const stats: Array<[string, string]> = [
    [t('traces.columns.turns'), fmt.count(session.turns)],
    [t('traces.kpi.active'), fmt.duration(session.active_ms)],
    [t('traces.trace.model_time'), fmt.duration(session.model_ms)],
    [t('traces.columns.tokens'), fmt.compact(session.tokens.total)],
    [t('traces.trace.cost'), fmt.money(session.cost_usd)],
    [
      t('traces.trace.files_changed'),
      t('traces.trace.files_value', {
        files: fmt.count(session.files_changed),
        added: fmt.count(session.lines_added),
        removed: fmt.count(session.lines_removed),
      }),
    ],
  ];

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
    downloadBlob({ filename: `trace-${session.id}.json`, blob });
  };

  const confirmDelete = () => {
    showConfirmation({
      title: t('traces.trace.delete_title'),
      message: t('traces.trace.delete_message', { title: session.title || shortId(session.id) }),
      confirmText: t('traces.trace.delete_confirm'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          const result = await api.deleteTraces({ session: session.id });
          showNotification(
            t('traces.trace.deleted', { count: result.deleted_turns }),
            'success'
          );
          navigate(paths.sessions);
        } catch (error) {
          showNotification(
            t('traces.trace.delete_failed', { message: getErrorMessage(error, t('traces.common.unknown')) }),
            'error'
          );
        }
      },
    });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        above={backLink}
        title={session.title || t('traces.sessions.untitled')}
        below={
          <ul className={pageStyles.chips} aria-label={t('traces.trace.chips_label')}>
            {visibleChips.map(([label, value]) => (
              <li key={label} className={pageStyles.chip}>
                <span className={styles.muted}>{label}</span>
                <span className={pageStyles.chipValue}>{value}</span>
              </li>
            ))}
            {session.tags.map((tag) => (
              <li key={`tag-${tag}`} className={pageStyles.chip}>
                <span className={styles.muted}>{t('traces.trace.tag')}</span>
                <span className={pageStyles.chipValue}>{tag}</span>
              </li>
            ))}
          </ul>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportJson}>
              <IconDownload size={14} aria-hidden="true" /> {t('traces.trace.export_json')}
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete}>
              <IconTrash2 size={14} aria-hidden="true" /> {t('traces.trace.delete')}
            </Button>
          </>
        }
      />

      <div className={styles.statGrid}>
        {stats.map(([label, value]) => (
          <div key={label} className={styles.stat}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue}>{value}</span>
          </div>
        ))}
      </div>

      {detail.turns.length === 0 ? (
        <div className={styles.card}>
          <span className={styles.muted}>{t('traces.trace.no_turns')}</span>
        </div>
      ) : (
        <>
          <TraceTimeline layout={layout} selectedId={selectedId} onSelect={onSelect} />
          {selectedId ? (
            <TurnDetail
              turnId={selectedId}
              summary={selectedTurn}
              heading={heading}
              parentTurn={parentTurn}
              onSelectTurn={onSelect}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
