import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { IconPlus, IconTrash2 } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import type { TracePricesResponse } from '@/services/api/traces';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { LoadError } from '../components/LoadError';
import { PageHeader } from '../components/PageHeader';
import { useTracePaths, useTracesEnvironment, useTracesHealth } from '../context';
import {
  draftFromRow,
  emptyDraft,
  overridesFromDrafts,
  PRICE_FIELDS,
  type PriceDraft,
  type PriceDraftError,
  type PriceField,
} from '../prices';
import { useTraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import styles from '../Traces.module.scss';
import pageStyles from './SettingsPage.module.scss';

export function SettingsPage() {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { api, configPath } = useTracesEnvironment();
  const paths = useTracePaths();
  const { health, reloadHealth } = useTracesHealth();
  const config = useTraceResource('config', () => api.getTracesConfig());
  const prices = useTraceResource('prices', () => api.getPrices());

  const reloadAll = useCallback(async () => {
    await Promise.all([reloadHealth(), config.reload(), prices.reload()]);
  }, [reloadHealth, config, prices]);
  useHeaderRefresh(reloadAll);

  const none = t('traces.common.none');
  const healthStats: Array<[string, string]> = [
    [
      t('traces.settings.queue'),
      t('traces.settings.queue_value', {
        depth: fmt.count(health.queue_depth),
        size: fmt.count(health.queue_size),
      }),
    ],
    [t('traces.settings.dropped_events'), fmt.count(health.dropped_events)],
    [t('traces.settings.dropped_content'), fmt.count(health.dropped_content)],
    [t('traces.settings.db_size'), fmt.bytes(health.db_bytes)],
    [t('traces.settings.content_size'), fmt.bytes(health.content_bytes)],
    [t('traces.settings.last_write'), fmt.dateTime(health.last_write_at)],
    [t('traces.settings.oldest_turn'), fmt.dateTime(health.oldest_turn_at)],
    [t('traces.settings.prices_updated'), fmt.dateTime(health.prices_updated_at)],
  ];

  const cfg = config.data;
  const recording: Array<[string, string]> = [
    [t('traces.settings.capture'), t(`traces.capture.${health.capture}`)],
    [t('traces.settings.retention_age'), cfg?.content_max_age ?? t('traces.settings.default_value')],
    [t('traces.settings.retention_size'), cfg?.content_max_size ?? t('traces.settings.default_value')],
    [t('traces.settings.idle_gap'), cfg?.idle_gap ?? t('traces.settings.default_value')],
    [
      t('traces.settings.redact'),
      cfg?.redact_secrets === null || cfg?.redact_secrets === undefined
        ? t('traces.settings.default_value')
        : cfg.redact_secrets
          ? t('common.yes')
          : t('common.no'),
    ],
    [t('traces.settings.prices_source'), health.prices_source || cfg?.prices_source || none],
  ];

  return (
    <div className={styles.page}>
      <PageHeader title={t('traces.settings.title')} />

      <section className={styles.card} aria-labelledby="settings-health-title">
        <div className={styles.cardHeader}>
          <h2 id="settings-health-title" className={styles.cardTitle}>
            {t('traces.settings.health_title')}
          </h2>
          <Button variant="secondary" size="sm" onClick={() => void reloadHealth()}>
            {t('traces.settings.refresh')}
          </Button>
        </div>
        <div className={styles.statGrid}>
          {healthStats.map(([label, value]) => (
            <div key={label} className={styles.stat}>
              <span className={styles.statLabel}>{label}</span>
              <span className={styles.statValue}>{value}</span>
            </div>
          ))}
        </div>
        {health.dropped_events + health.dropped_content > 0 ? (
          <span className={styles.note}>{t('traces.settings.dropped_hint')}</span>
        ) : null}
      </section>

      <section className={styles.card} aria-labelledby="settings-recording-title">
        <div className={styles.cardHeader}>
          <div className={styles.headerText}>
            <h2 id="settings-recording-title" className={styles.cardTitle}>
              {t('traces.settings.recording_title')}
            </h2>
            <span className={styles.cardSub}>{t('traces.settings.recording_sub')}</span>
          </div>
          <Link className="btn btn-secondary btn-sm" to={configPath}>
            {t('traces.settings.open_config')}
          </Link>
        </div>
        {config.error && !cfg ? (
          <LoadError
            title={t('traces.settings.config_failed')}
            message={config.error}
            onRetry={() => void config.reload()}
          />
        ) : (
          <dl className={pageStyles.facts}>
            {recording.map(([label, value]) => (
              <div key={label} className={pageStyles.fact}>
                <dt>{label}</dt>
                <dd>{config.loading && !cfg ? <Skeleton width={80} height={14} /> : value}</dd>
              </div>
            ))}
          </dl>
        )}
        <span className={styles.note}>
          {t('traces.settings.plan_prices_note')}{' '}
          <Link className={styles.link} to={paths.accounts}>
            {t('traces.settings.open_accounts')}
          </Link>
        </span>
      </section>

      {prices.error && !prices.data ? (
        <LoadError
          title={t('traces.settings.prices_failed')}
          message={prices.error}
          onRetry={() => void prices.reload()}
        />
      ) : !prices.data ? (
        <Skeleton height={240} rounded={12} />
      ) : (
        <PriceTable data={prices.data} onSaved={() => void prices.reload()} />
      )}
    </div>
  );
}

function PriceTable({ data, onSaved }: { data: TracePricesResponse; onSaved: () => void }) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { api } = useTracesEnvironment();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const serverOverrides = JSON.stringify(
    data.rows.filter((row) => row.origin === 'override').map(draftFromRow)
  );
  const [drafts, setDrafts] = useState<PriceDraft[]>(() => JSON.parse(serverOverrides) as PriceDraft[]);
  const [errors, setErrors] = useState<PriceDraftError[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [synced, setSynced] = useState(serverOverrides);
  useEffect(() => {
    if (serverOverrides === synced) return;
    setSynced(serverOverrides);
    setDrafts(JSON.parse(serverOverrides) as PriceDraft[]);
    setErrors([]);
  }, [serverOverrides, synced]);

  const dirty = JSON.stringify(drafts) !== serverOverrides;
  const overridden = new Set(drafts.map((draft) => draft.model.trim()));
  const catalogRows = data.rows.filter((row) => row.origin !== 'override' && !overridden.has(row.model));

  const updateDraft = (index: number, patch: Partial<PriceDraft>) =>
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));

  const fieldError = (index: number, field: PriceField | 'model') =>
    errors.find((error) =>
      field === 'model'
        ? (error.kind === 'model_required' || error.kind === 'model_duplicate') && error.index === index
        : error.kind === 'price_invalid' && error.index === index && error.field === field
    );

  const save = async () => {
    const result = overridesFromDrafts(drafts);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    setSaveError(null);
    try {
      await api.putPriceOverrides(result.overrides);
      showNotification(t('traces.prices.saved'), 'success');
      onSaved();
    } catch (error) {
      setSaveError(getErrorMessage(error, t('traces.common.unknown')));
    } finally {
      setSaving(false);
    }
  };

  const priceCell = (value: number | null) => (value === null ? t('traces.common.none') : fmt.price(value));

  return (
    <section className={`${styles.card} ${styles.cardFlush}`} aria-labelledby="settings-prices-title">
      <div className={styles.cardHeader}>
        <div className={styles.headerText}>
          <h2 id="settings-prices-title" className={styles.cardTitle}>
            {t('traces.prices.title')}
          </h2>
          <span className={styles.cardSub}>
            {t('traces.prices.sub', {
              source: data.source || t('traces.common.none'),
              updated: fmt.dateTime(data.updated_at),
            })}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setDrafts((current) => [...current, emptyDraft()])}>
          <IconPlus size={14} aria-hidden="true" /> {t('traces.prices.add')}
        </Button>
      </div>
      {data.rows.length === 0 && drafts.length === 0 ? (
        <div className={styles.emptyBlock}>{t('traces.prices.empty')}</div>
      ) : (
        <Table className={`${styles.table} ${styles.tableInCard}`}>
          <TableHeader>
            <tr>
              <TableHead scope="col">{t('traces.columns.model')}</TableHead>
              {PRICE_FIELDS.map((field) => (
                <TableHead key={field} scope="col" alignRight>
                  {t(`traces.prices.${field}`)}
                </TableHead>
              ))}
              <TableHead scope="col">{t('traces.prices.origin')}</TableHead>
              <TableHead scope="col">
                <span className={styles.srOnly}>{t('traces.common.actions')}</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {drafts.map((draft, index) => (
              <TableRow key={`override-${index}`}>
                <TableCell>
                  <input
                    className={`${styles.textInput} ${styles.mono} ${pageStyles.modelInput}`}
                    value={draft.model}
                    placeholder="claude-*"
                    aria-label={t('traces.prices.model_label', { n: index + 1 })}
                    aria-invalid={fieldError(index, 'model') ? true : undefined}
                    onChange={(event) => updateDraft(index, { model: event.target.value })}
                  />
                  {fieldError(index, 'model') ? (
                    <div className={styles.fieldError}>
                      {t(`traces.prices.error_${fieldError(index, 'model')?.kind}`)}
                    </div>
                  ) : null}
                </TableCell>
                {PRICE_FIELDS.map((field) => (
                  <TableCell key={field} className={styles.num}>
                    <input
                      className={`${styles.textInput} ${pageStyles.priceInput}`}
                      value={draft[field]}
                      inputMode="decimal"
                      aria-label={t('traces.prices.price_label', {
                        field: t(`traces.prices.${field}`),
                        model: draft.model || t('traces.prices.new_row'),
                      })}
                      aria-invalid={fieldError(index, field) ? true : undefined}
                      onChange={(event) => updateDraft(index, { [field]: event.target.value })}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <span className={styles.pill}>{t('traces.prices.origin_override')}</span>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                    aria-label={t('traces.prices.remove_label', { model: draft.model || t('traces.prices.new_row') })}
                  >
                    <IconTrash2 size={14} aria-hidden="true" /> {t('traces.prices.remove')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {catalogRows.map((row) => (
              <TableRow key={`catalog-${row.model}`}>
                <TableCell className={styles.mono}>{row.model}</TableCell>
                {PRICE_FIELDS.map((field) => (
                  <TableCell key={field} className={styles.num}>
                    {priceCell(row[field])}
                  </TableCell>
                ))}
                <TableCell>
                  <span className={styles.muted}>{t(row.origin === 'unpriced' ? 'traces.prices.origin_unpriced' : 'traces.prices.origin_catalog')}</span>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDrafts((current) => [...current, draftFromRow(row)])}
                    aria-label={t('traces.prices.override_label', { model: row.model })}
                  >
                    {t('traces.prices.override')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className={pageStyles.footer}>
        <span className={styles.note}>{t('traces.prices.units')}</span>
        {errors.some((error) => error.kind === 'price_invalid') ? (
          <span className={styles.fieldError} role="alert">
            {t('traces.prices.error_price_invalid')}
          </span>
        ) : null}
        {saveError ? (
          <span className={styles.fieldError} role="alert">
            {t('traces.prices.save_failed', { message: saveError })}
          </span>
        ) : null}
        {dirty ? (
          <div className={styles.buttonRow}>
            <Button size="sm" onClick={() => void save()} loading={saving}>
              {t('traces.prices.save')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDrafts(JSON.parse(serverOverrides) as PriceDraft[]);
                setErrors([]);
              }}
            >
              {t('traces.prices.discard')}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
