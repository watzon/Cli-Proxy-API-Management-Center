import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TraceTurnStatus } from '@/services/api/traces';
import {
  isTimelineKey,
  stepTurn,
  type TimelineLane,
  type TimelineLayout,
  type TimelineTurnMark,
} from '../timeline';
import { useTraceFormat } from '../useTraceFormat';
import styles from './TraceTimeline.module.scss';
import traceStyles from '../Traces.module.scss';

const statusClass: Record<TraceTurnStatus, string> = {
  ok: '',
  retried: styles.retried,
  error: styles.error,
};

interface TraceTimelineProps {
  layout: TimelineLayout;
  selectedId: string | null;
  onSelect: (turnId: string) => void;
}

export function TraceTimeline({ layout, selectedId, onSelect }: TraceTimelineProps) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const focusId =
    selectedId && layout.lanes.some((lane) => lane.turns.some((turn) => turn.id === selectedId))
      ? selectedId
      : (layout.lanes.find((lane) => lane.turns.length > 0)?.turns[0]?.id ?? null);

  const laneName = (lane: TimelineLane, index: number) =>
    lane.isMain
      ? t('traces.timeline.main_lane')
      : lane.label || t('traces.timeline.subagent_lane', { n: index });

  const laneSub = (lane: TimelineLane) =>
    lane.parentSeq !== null
      ? t('traces.timeline.lane_from_turn', { count: lane.turns.length, seq: lane.parentSeq })
      : t('traces.timeline.lane_turns', { count: lane.turns.length });

  const turnLabel = (lane: TimelineLane, laneIndex: number, turn: TimelineTurnMark) =>
    t('traces.timeline.turn_label', {
      lane: laneName(lane, laneIndex),
      seq: turn.seq,
      time: fmt.clock(turn.startMs, true),
      duration: fmt.duration(turn.endMs - turn.startMs),
      status: t(`traces.status.${turn.status}`),
    });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isTimelineKey(event.key)) return;
    const next = stepTurn(layout, focusId, event.key);
    event.preventDefault();
    if (!next) return;
    onSelect(next);
    const target = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-turn-id="${CSS.escape(next)}"]`
    );
    target?.focus();
  };

  return (
    <section className={traceStyles.card} aria-labelledby="trace-timeline-title">
      <div className={traceStyles.cardHeader}>
        <h2 id="trace-timeline-title" className={traceStyles.cardTitle}>
          {t('traces.timeline.title')}
        </h2>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.okFill}`} />
            {t('traces.timeline.legend_turn')}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.retried}`} />
            {t('traces.timeline.legend_retried')}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.error}`} />
            {t('traces.timeline.legend_failed')}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.breakFill}`} />
            {t('traces.timeline.legend_break')}
          </span>
        </div>
      </div>

      <div className={styles.scroll}>
        <div
          className={styles.inner}
          ref={containerRef}
          role="group"
          aria-label={t('traces.timeline.group_label')}
          onKeyDown={handleKeyDown}
        >
          <div className={styles.row} aria-hidden="true">
            <div className={styles.laneLabel} />
            <div className={styles.ticks}>
              {layout.ticks.map((tick) => (
                <span key={tick.time} style={{ left: `${tick.left}%` }}>
                  {fmt.clock(tick.time)}
                </span>
              ))}
            </div>
          </div>
          {layout.lanes.map((lane, laneIndex) => (
            <div key={lane.sessionId} className={styles.row}>
              <div className={styles.laneLabel}>
                <span className={lane.isMain ? styles.laneMain : undefined}>
                  {laneName(lane, laneIndex)}
                </span>
                <span className={styles.laneSub}>{laneSub(lane)}</span>
              </div>
              <div className={styles.track}>
                {layout.breaks.map((gap) => (
                  <div
                    key={gap.fromMs}
                    className={`${styles.break} ${styles.breakFill}`}
                    style={{ left: `${gap.left}%`, width: `${gap.width}%` }}
                    title={t('traces.timeline.break_label', { duration: fmt.duration(gap.durationMs) })}
                    aria-hidden="true"
                  >
                    {lane.isMain && gap.width >= 6 ? (
                      <span>
                        {t('traces.timeline.break_label', { duration: fmt.duration(gap.durationMs) })}
                      </span>
                    ) : null}
                  </div>
                ))}
                {lane.turns.map((turn) => (
                  <button
                    key={turn.id}
                    type="button"
                    data-turn-id={turn.id}
                    className={`${styles.turn} ${statusClass[turn.status]} ${
                      turn.id === selectedId ? styles.selected : ''
                    }`}
                    style={{ left: `${turn.left}%`, width: `max(5px, ${turn.width}%)` }}
                    tabIndex={turn.id === focusId ? 0 : -1}
                    aria-current={turn.id === selectedId ? 'true' : undefined}
                    aria-label={turnLabel(lane, laneIndex, turn)}
                    title={turnLabel(lane, laneIndex, turn)}
                    onClick={() => onSelect(turn.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className={styles.hint}>{t('traces.timeline.hint')}</span>
    </section>
  );
}
