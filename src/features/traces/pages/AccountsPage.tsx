import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconAlertTriangle } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useNow } from '@/hooks/useNow';
import type { TraceAccountLimits } from '@/services/api/traces';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { FilterBar } from '../components/FilterBar';
import { LimitBar } from '../components/LimitBar';
import { useWindowLabel } from '../useWindowLabel';
import { LoadError } from '../components/LoadError';
import { PageHeader } from '../components/PageHeader';
import { useTracesEnvironment } from '../context';
import { filterStateKey, rangeDays, resolveRange, toQueryFilters } from '../filters';
import { formatDecimal, formatResetTime, parseTime } from '../format';
import {
  limitLevel,
  limitWarnings,
  parsePriceInput,
  pickTrendWindow,
  trendPoints,
  valueRatio,
} from '../limits';
import { useTraceFilters } from '../useTraceFilters';
import { useTraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import styles from '../Traces.module.scss';
import pageStyles from './AccountsPage.module.scss';

export function AccountsPage() {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const windowLabel = useWindowLabel();
  const now = useNow();
  const { api } = useTracesEnvironment();
  const { filters } = useTraceFilters();
  const resource = useTraceResource(filterStateKey(filters), () =>
    api.getLimits(toQueryFilters(filters, new Date()))
  );
  const reload = useCallback(() => resource.reload(), [resource]);
  useHeaderRefresh(reload);
  const days = rangeDays(resolveRange(filters, new Date()));

  const data = resource.data;
  const warnings = data ? limitWarnings(data.accounts) : [];
  const lastSample = data
    ? data.accounts
        .flatMap((account) => account.history.map((sample) => parseTime(sample.at) ?? 0))
        .reduce((max, time) => Math.max(max, time), 0)
    : 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('traces.accounts.title')}
        actions={
          lastSample > 0 ? (
            <span className={styles.recorder}>
              {t('traces.accounts.last_update', { time: fmt.dateTime(new Date(lastSample).toISOString()) })}
            </span>
          ) : null
        }
      />
      <FilterBar fields={['range']} />

      {warnings.map((warning) => (
        <div
          key={`${warning.account.account_id}-${warning.windowName}`}
          className={`${styles.notice} ${styles.noticeDanger}`}
          role="status"
        >
          <IconAlertTriangle size={18} className={styles.noticeIcon} />
          <div className={styles.noticeBody}>
            <strong className={styles.noticeTitle}>
              {t('traces.accounts.warning_title', {
                account: warning.account.label,
                percent: fmt.percent(warning.usedPct),
                window: windowLabel(warning.windowName),
              })}
            </strong>
            <span>
              {[
                warning.account.overage_status
                  ? t('traces.accounts.warning_overage', { status: warning.account.overage_status })
                  : null,
                warning.resetsAt
                  ? t('traces.accounts.warning_reset', {
                      time: formatResetTime(warning.resetsAt, fmt.locale, now) ?? '',
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </span>
          </div>
        </div>
      ))}

      {resource.error && !data ? (
        <LoadError
          title={t('traces.accounts.load_failed')}
          message={resource.error}
          onRetry={() => void resource.reload()}
        />
      ) : !data ? (
        <div className={pageStyles.grid} aria-busy="true" aria-label={t('traces.common.loading')}>
          <Skeleton height={320} rounded={12} />
          <Skeleton height={320} rounded={12} />
        </div>
      ) : data.accounts.length === 0 ? (
        <div className={styles.card}>
          <span className={styles.muted}>{t('traces.accounts.empty')}</span>
        </div>
      ) : (
        <div className={`${pageStyles.grid} ${resource.loading ? styles.loadingOverlay : ''}`}>
          {data.accounts.map((account) => (
            <AccountCard key={account.account_id} account={account} days={days} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  account,
  days,
  now,
}: {
  account: TraceAccountLimits;
  days: number;
  now: number;
}) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const windowLabel = useWindowLabel();
  const { api } = useTracesEnvironment();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const inputId = useId();
  const errorId = useId();
  const [saved, setSaved] = useState<number | null>(account.plan_price_usd);
  const [text, setText] = useState(account.plan_price_usd === null ? '' : String(account.plan_price_usd));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trendWindow = pickTrendWindow(account);
  const trendWindowState = account.windows.find((window) => window.name === trendWindow) ?? null;
  const points = trendWindow ? trendPoints(account.history, trendWindow) : '';
  const trendLevel = limitLevel(trendWindowState?.used_pct ?? null);
  const ratio = valueRatio(account.usage.cost_usd, saved, days);

  const savePrice = async () => {
    const parsed = parsePriceInput(text);
    if (!parsed.ok) {
      setError(t('traces.accounts.price_invalid'));
      return;
    }
    setError(null);
    if (parsed.value === saved) return;
    setSaving(true);
    try {
      await api.putPlanPrice(account.account_id, parsed.value);
      setSaved(parsed.value);
      setText(parsed.value === null ? '' : String(parsed.value));
      showNotification(t('traces.accounts.price_saved', { account: account.label }), 'success');
    } catch (err) {
      setError(t('traces.accounts.price_failed', { message: getErrorMessage(err, t('traces.common.unknown')) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby={`${inputId}-title`}>
      <div className={pageStyles.cardTop}>
        <div className={styles.headerText}>
          <h2 id={`${inputId}-title`} className={styles.cardTitle}>
            {account.label}
          </h2>
          <span className={styles.cardSub}>
            {[account.plan ?? account.provider, account.email].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className={pageStyles.tags}>
          {account.tags.map((tag) => (
            <span key={tag} className={styles.pill}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {account.windows.length === 0 ? (
        <span className={styles.note}>{t('traces.accounts.no_windows')}</span>
      ) : (
        <div className={pageStyles.windows}>
          {account.windows.map((window) => (
            <LimitBar
              key={window.name}
              window={window}
              caption={
                window.resets_at
                  ? t('traces.accounts.resets', {
                      time: formatResetTime(window.resets_at, fmt.locale, now) ?? '',
                    })
                  : window.status || null
              }
            />
          ))}
        </div>
      )}

      {trendWindow && points ? (
        <div className={pageStyles.trend}>
          <span className={styles.note}>
            {t('traces.accounts.trend_label', { window: windowLabel(trendWindow) })}
          </span>
          <svg
            viewBox="0 0 400 60"
            width="100%"
            height="60"
            preserveAspectRatio="none"
            role="img"
            aria-label={t('traces.accounts.trend_aria', {
              window: windowLabel(trendWindow),
              percent: fmt.percent(trendWindowState?.used_pct ?? null),
            })}
          >
            <line x1="0" y1="6" x2="400" y2="6" className={pageStyles.limitLine} />
            <polyline
              points={points}
              fill="none"
              className={pageStyles.trendLine}
              style={{
                stroke:
                  trendLevel === 'critical'
                    ? 'var(--trace-level-critical)'
                    : trendLevel === 'high'
                      ? 'var(--trace-level-high)'
                      : 'var(--trace-level-normal)',
              }}
            />
          </svg>
        </div>
      ) : null}

      <div className={pageStyles.usage}>
        <div>
          <span className={styles.note}>{t('traces.accounts.turns')}</span>
          <span className={pageStyles.usageValue}>{fmt.count(account.usage.turns)}</span>
        </div>
        <div>
          <span className={styles.note}>{t('traces.columns.tokens')}</span>
          <span className={pageStyles.usageValue}>{fmt.compact(account.usage.tokens)}</span>
        </div>
        <div>
          <span className={styles.note}>{t('traces.trace.cost')}</span>
          <span className={pageStyles.usageValue}>{fmt.money(account.usage.cost_usd)}</span>
        </div>
      </div>

      <div className={pageStyles.priceRow}>
        <label htmlFor={inputId} className={styles.muted}>
          {t('traces.accounts.plan_price')}
        </label>
        <span className={pageStyles.priceInput}>
          <span aria-hidden="true">$</span>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={text}
            placeholder="0"
            disabled={saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => void savePrice()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </span>
        <span className={pageStyles.ratio}>
          {ratio === null
            ? saved === null
              ? t('traces.accounts.ratio_missing_price')
              : t('traces.accounts.ratio_unknown')
            : t('traces.accounts.ratio', { ratio: formatDecimal(ratio, fmt.locale, 1) })}
        </span>
        {error ? (
          <span id={errorId} className={styles.fieldError} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </section>
  );
}
