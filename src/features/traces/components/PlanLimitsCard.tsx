import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TraceLimitsResponse } from '@/services/api/traces';
import { useTracePaths } from '../context';
import type { TraceResource } from '../useTraceResource';
import { LimitBar } from './LimitBar';
import { LoadError } from './LoadError';
import styles from '../Traces.module.scss';
import cardStyles from './PlanLimitsCard.module.scss';

/** Overview card: each account's first two windows. */
export function PlanLimitsCard({ resource }: { resource: TraceResource<TraceLimitsResponse> }) {
  const { t } = useTranslation();
  const paths = useTracePaths();
  const accounts = resource.data?.accounts ?? [];
  return (
    <section className={styles.card} aria-labelledby="overview-limits-title">
      <div className={styles.cardHeader}>
        <h2 id="overview-limits-title" className={styles.cardTitle}>
          {t('traces.overview.plan_limits')}
        </h2>
        <Link className={styles.link} to={paths.accounts}>
          {t('traces.overview.all_accounts')}
        </Link>
      </div>
      {resource.error && !resource.data ? (
        <LoadError
          title={t('traces.accounts.load_failed')}
          message={resource.error}
          onRetry={() => void resource.reload()}
        />
      ) : !resource.data ? (
        <Skeleton height={120} />
      ) : accounts.length === 0 ? (
        <span className={styles.muted}>{t('traces.accounts.empty_short')}</span>
      ) : (
        accounts.slice(0, 5).map((account) => (
          <div key={account.account_id} className={cardStyles.row}>
            <div className={cardStyles.name}>
              <span>{account.label}</span>
              <span>{account.plan ?? account.provider}</span>
            </div>
            {account.windows.slice(0, 2).map((window) => (
              <LimitBar key={window.name} window={window} size="sm" />
            ))}
            {account.windows.length === 0 ? (
              <span className={styles.note}>{t('traces.accounts.no_windows')}</span>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}
