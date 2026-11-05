import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconCheck, IconRefreshCw } from '@/components/ui/icons';
import type { TraceTurnStatus } from '@/services/api/traces';
import styles from '../Traces.module.scss';

/** Turn status with an icon and text, so color is not the only signal. */
export function TurnStatusBadge({ status, label }: { status: TraceTurnStatus; label?: string }) {
  const { t } = useTranslation();
  const text = label ?? t(`traces.status.${status}`);
  if (status === 'error') {
    return (
      <span className={`${styles.pill} ${styles.pillError}`}>
        <IconAlertTriangle size={12} />
        {text}
      </span>
    );
  }
  if (status === 'retried') {
    return (
      <span className={`${styles.pill} ${styles.pillWarn}`}>
        <IconRefreshCw size={12} />
        {text}
      </span>
    );
  }
  return (
    <span className={`${styles.pill} ${styles.pillOk}`}>
      <IconCheck size={12} />
      {text}
    </span>
  );
}

/** Session status: OK, or the number of failed turns. */
export function SessionStatusBadge({ errors }: { errors: number }) {
  const { t } = useTranslation();
  return errors > 0 ? (
    <TurnStatusBadge status="error" label={t('traces.status.errors', { count: errors })} />
  ) : (
    <TurnStatusBadge status="ok" />
  );
}
