import { useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconAlertTriangle, IconCheck, IconInfo } from '@/components/ui/icons';
import type {
  TraceAttempt,
  TraceBlock,
  TraceBlockKind,
  TraceTurn,
  TraceTurnDetail,
} from '@/services/api/traces';
import { getErrorMessage } from '@/utils/helpers';
import { useTracePaths, useTracesEnvironment, useTracesHealth } from '../context';
import { useTraceFormat, type TraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import { DiffBlock } from './DiffBlock';
import { LoadError } from './LoadError';
import styles from './TurnDetail.module.scss';
import traceStyles from '../Traces.module.scss';

const dotClass: Record<TraceBlockKind, string> = {
  user: styles.dotUser,
  assistant: styles.dotAssistant,
  thinking: styles.dotThinking,
  tool_call: styles.dotToolCall,
  tool_result: styles.dotToolResult,
  system: styles.dotSystem,
};

interface TurnDetailProps {
  turnId: string;
  /** The turn as listed in the session, shown while the detail loads. */
  summary: TraceTurn | null;
  /** "Turn 14" or "Explore subagent, turn 2". */
  heading: string;
  /** Parent turn of a subagent lane, so the facts can link to it. */
  parentTurn: TraceTurn | null;
  onSelectTurn: (turnId: string) => void;
}

export function TurnDetail({ turnId, summary, heading, parentTurn, onSelectTurn }: TurnDetailProps) {
  const { t } = useTranslation();
  const { api } = useTracesEnvironment();
  const resource = useTraceResource(turnId, () => api.getTurn(turnId));
  const detail = resource.data && resource.data.turn.id === turnId ? resource.data : null;
  const turn = detail?.turn ?? summary;

  return (
    <div className={traceStyles.split}>
      <section
        className={`${traceStyles.card} ${styles.panel}`}
        aria-labelledby="turn-detail-heading"
        aria-busy={resource.loading}
      >
        <div className={styles.headingRow}>
          <h2 id="turn-detail-heading" className={traceStyles.cardTitle}>
            {heading}
          </h2>
          {turn ? <TurnWhen turn={turn} /> : null}
        </div>
        {resource.error && !detail ? (
          <LoadError
            title={t('traces.turn.load_failed')}
            message={resource.error}
            onRetry={() => void resource.reload()}
          />
        ) : !detail ? (
          <div className={traceStyles.skeletonStack} aria-label={t('traces.common.loading')}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={80} />
            <Skeleton height={120} />
          </div>
        ) : (
          <TurnBlocks detail={detail} />
        )}
      </section>

      <aside className={traceStyles.splitSide} aria-label={t('traces.turn.side_label')}>
        {detail ? (
          <>
            <CostCard detail={detail} />
            <AttemptsCard attempts={detail.attempts} />
            <FactsCard detail={detail} parentTurn={parentTurn} onSelectTurn={onSelectTurn} />
          </>
        ) : (
          <Skeleton height={220} rounded={12} />
        )}
      </aside>
    </div>
  );
}

function TurnWhen({ turn }: { turn: TraceTurn }) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const base = t('traces.turn.when', {
    time: fmt.clock(turn.started_at, true),
    duration: fmt.duration(turn.latency_ms),
  });
  const ttft =
    turn.ttft_ms !== null
      ? t('traces.turn.first_token', { duration: fmt.duration(turn.ttft_ms) })
      : null;
  return <span className={styles.when}>{ttft ? `${base}, ${ttft}` : base}</span>;
}

function TurnBlocks({ detail }: { detail: TraceTurnDetail }) {
  const { t } = useTranslation();
  const { health } = useTracesHealth();

  if (!detail.content_available) {
    return (
      <div className={traceStyles.notice} role="note">
        <IconInfo size={18} className={traceStyles.noticeIcon} />
        <div className={traceStyles.noticeBody}>
          <span className={traceStyles.noticeTitle}>{t('traces.turn.no_content_title')}</span>
          <span>
            {t('traces.turn.no_content', { capture: t(`traces.capture.${health.capture}`) })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <span className={styles.intro}>{t('traces.turn.intro')}</span>
      {detail.blocks.length === 0 ? (
        <span className={traceStyles.muted}>{t('traces.turn.no_blocks')}</span>
      ) : (
        detail.blocks.map((block, index) => (
          <BlockView key={`${detail.turn.id}-${index}`} turnId={detail.turn.id} index={index} block={block} />
        ))
      )}
    </>
  );
}

function blockTitle(block: TraceBlock, t: TFunction): string {
  const name = block.tool_name ?? '';
  switch (block.kind) {
    case 'user':
      return t('traces.blocks.user');
    case 'assistant':
      return t('traces.blocks.assistant');
    case 'thinking':
      return t('traces.blocks.thinking');
    case 'tool_call':
      return name ? t('traces.blocks.tool_call', { name }) : t('traces.blocks.tool_call_unnamed');
    case 'tool_result':
      return name
        ? t('traces.blocks.tool_result', { name })
        : t('traces.blocks.tool_result_unnamed');
    case 'system':
      return t('traces.blocks.system');
    default: {
      const exhaustive: never = block.kind;
      return exhaustive;
    }
  }
}

function BlockView({ turnId, index, block }: { turnId: string; index: number; block: TraceBlock }) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { api } = useTracesEnvironment();
  const [full, setFull] = useState<TraceBlock | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const shown = full ?? block;
  const title = blockTitle(block, t);
  const isCode = shown.kind === 'tool_call' || shown.kind === 'tool_result';

  const showAll = async () => {
    setLoadingFull(true);
    setFullError(null);
    try {
      setFull(await api.getTurnBlock(turnId, index));
    } catch (error) {
      setFullError(getErrorMessage(error, t('traces.common.unknown')));
    } finally {
      setLoadingFull(false);
    }
  };

  const body = shown.diff ? (
    <>
      {shown.text ? <pre className={styles.code}>{shown.text}</pre> : null}
      <DiffBlock diff={shown.diff} />
    </>
  ) : isCode ? (
    <pre className={`${styles.code} ${shown.is_error ? styles.codeError : ''}`}>{shown.text}</pre>
  ) : (
    <p className={styles.text}>{shown.text}</p>
  );

  const collapsible = shown.kind === 'thinking' || shown.kind === 'system';

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={`${styles.dot} ${dotClass[block.kind]}`} aria-hidden="true" />
        {title}
        {shown.is_error ? (
          <span className={`${traceStyles.pill} ${traceStyles.pillError}`}>
            <IconAlertTriangle size={12} />
            {t('traces.blocks.failed')}
          </span>
        ) : null}
      </div>
      {collapsible ? (
        <details className={styles.details}>
          <summary>
            {shown.kind === 'thinking' ? t('traces.blocks.show_thinking') : t('traces.blocks.show_system')}
          </summary>
          {shown.kind === 'system' ? (
            <pre className={styles.code}>{shown.text}</pre>
          ) : (
            <p className={styles.text}>{shown.text}</p>
          )}
        </details>
      ) : (
        body
      )}
      {shown.truncated ? (
        <div className={styles.truncated}>
          <span>{t('traces.blocks.truncated', { size: fmt.bytes(shown.full_size) })}</span>
          <Button variant="secondary" size="sm" loading={loadingFull} onClick={() => void showAll()}>
            {t('traces.blocks.show_all')}
          </Button>
          {fullError ? (
            <span role="alert">{t('traces.blocks.show_all_failed', { message: fullError })}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const COST_ROW_KEYS = {
  input: 'traces.cost.input',
  cache_read: 'traces.cost.cache_read',
  cache_write_5m: 'traces.cost.cache_write_5m',
  cache_write_1h: 'traces.cost.cache_write_1h',
  output: 'traces.cost.output',
} as const;

function CostCard({ detail }: { detail: TraceTurnDetail }) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const paths = useTracePaths();
  const { turn } = detail;
  const model = turn.served_model || turn.model;
  const reasoning = turn.tokens.reasoning;
  const outputIndex = detail.cost_breakdown.findIndex((line) => line.type === 'output');

  return (
    <section className={traceStyles.card} aria-labelledby="turn-cost-title">
      <h2 id="turn-cost-title" className={traceStyles.cardTitleSmall}>
        {t('traces.cost.title')}
      </h2>
      <table className={styles.facts}>
        <thead className={traceStyles.srOnly}>
          <tr>
            <th scope="col">{t('traces.cost.type')}</th>
            <th scope="col">{t('traces.cost.tokens')}</th>
            <th scope="col">{t('traces.cost.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {detail.cost_breakdown.map((line, index) => (
            <CostRows
              key={line.type}
              label={t(COST_ROW_KEYS[line.type])}
              tokens={fmt.count(line.tokens)}
              cost={line.cost_usd === null ? t('traces.common.unknown') : fmt.money(line.cost_usd)}
              reasoning={
                index === outputIndex && reasoning > 0 ? fmt.count(reasoning) : null
              }
              reasoningLabel={t('traces.cost.reasoning')}
            />
          ))}
          <tr className={styles.totalRow}>
            <th scope="row">{t('traces.cost.total')}</th>
            <td>{fmt.count(turn.tokens.total)}</td>
            <td>{fmt.money(turn.cost_usd)}</td>
          </tr>
        </tbody>
      </table>
      {turn.cost_usd === null ? (
        <span className={traceStyles.note}>
          {t('traces.cost.unpriced', { model })}{' '}
          <Link className={traceStyles.link} to={paths.settings}>
            {t('traces.cost.open_prices')}
          </Link>
        </span>
      ) : (
        <span className={traceStyles.note}>{t('traces.cost.list_price_note', { model })}</span>
      )}
    </section>
  );
}

function CostRows({
  label,
  tokens,
  cost,
  reasoning,
  reasoningLabel,
}: {
  label: string;
  tokens: string;
  cost: string;
  reasoning: string | null;
  reasoningLabel: string;
}) {
  return (
    <>
      <tr>
        <th scope="row">{label}</th>
        <td>{tokens}</td>
        <td>{cost}</td>
      </tr>
      {reasoning ? (
        <tr>
          <th scope="row">{reasoningLabel}</th>
          <td>{reasoning}</td>
          <td />
        </tr>
      ) : null}
    </>
  );
}

function attemptNote(attempt: TraceAttempt, single: boolean, fmt: TraceFormat, t: TFunction) {
  const duration = fmt.duration(attempt.latency_ms);
  if (attempt.status === 'ok') {
    return single
      ? t('traces.attempts.first_try', { duration })
      : t('traces.attempts.served_after', { duration });
  }
  return attempt.error
    ? t('traces.attempts.failed_with', { error: attempt.error, duration })
    : t('traces.attempts.failed_after', { duration });
}

function AttemptsCard({ attempts }: { attempts: TraceAttempt[] }) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  return (
    <section className={traceStyles.card} aria-labelledby="turn-attempts-title">
      <h2 id="turn-attempts-title" className={traceStyles.cardTitleSmall}>
        {t('traces.attempts.title')}
      </h2>
      {attempts.length === 0 ? (
        <span className={traceStyles.muted}>{t('traces.attempts.none')}</span>
      ) : (
        <ol className={traceStyles.skeletonStack} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {attempts.map((attempt) => (
            <li key={attempt.n} className={styles.attempt}>
              <span className={styles.attemptBadge} aria-hidden="true">
                {attempt.n}
              </span>
              <div className={styles.attemptBody}>
                <span>
                  <span className={traceStyles.srOnly}>
                    {t('traces.attempts.number', { n: attempt.n })}{' '}
                  </span>
                  {attempt.account || t('traces.common.none')}
                </span>
                <span>{attemptNote(attempt, attempts.length === 1, fmt, t)}</span>
              </div>
              <span
                className={`${traceStyles.pill} ${
                  attempt.status === 'ok' ? traceStyles.pillOk : traceStyles.pillError
                }`}
              >
                {attempt.status === 'ok' ? <IconCheck size={12} /> : <IconAlertTriangle size={12} />}
                {attempt.http_status || t(`traces.attempts.status_${attempt.status}`)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FactsCard({
  detail,
  parentTurn,
  onSelectTurn,
}: {
  detail: TraceTurnDetail;
  parentTurn: TraceTurn | null;
  onSelectTurn: (turnId: string) => void;
}) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { turn, facts } = detail;
  const none = t('traces.common.none');
  const model =
    turn.served_model && turn.served_model !== turn.model
      ? t('traces.facts.model_served', { model: turn.model, served: turn.served_model })
      : turn.model || none;
  const parentId = facts.parent_turn_id ?? parentTurn?.id ?? null;

  const rows: Array<[string, ReactNode]> = [
    [t('traces.facts.request_id'), facts.request_id || none],
    [t('traces.facts.model'), model],
    [t('traces.facts.provider'), turn.provider || none],
    [t('traces.facts.account'), turn.account || none],
    [t('traces.facts.client'), facts.client || none],
    [t('traces.facts.folder'), facts.folder || none],
    [t('traces.facts.machine'), facts.machine || none],
    [t('traces.facts.http_status'), turn.http_status ? String(turn.http_status) : none],
    [t('traces.facts.stop_reason'), facts.stop_reason ?? none],
    [t('traces.facts.started'), fmt.clock(turn.started_at, true)],
  ];
  if (turn.error) rows.push([t('traces.facts.error'), turn.error]);
  if (parentId) {
    rows.push([
      t('traces.facts.parent'),
      <button key="parent" type="button" className={styles.linkButton} onClick={() => onSelectTurn(parentId)}>
        {parentTurn ? t('traces.facts.parent_turn', { seq: parentTurn.seq }) : parentId}
      </button>,
    ]);
  }

  return (
    <section className={traceStyles.card} aria-labelledby="turn-facts-title">
      <h2 id="turn-facts-title" className={traceStyles.cardTitleSmall}>
        {t('traces.facts.title')}
      </h2>
      <table className={`${styles.facts} ${styles.factsLeft}`}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className={traceStyles.mono}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
