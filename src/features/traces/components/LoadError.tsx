import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconAlertTriangle } from '@/components/ui/icons';
import styles from '../Traces.module.scss';

interface LoadErrorProps {
  /** What failed, for example "Could not load sessions." */
  title: string;
  message: string | null;
  onRetry: () => void;
}

/** Load failure: says what went wrong and offers a retry. */
export function LoadError({ title, message, onRetry }: LoadErrorProps) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
      <IconAlertTriangle size={18} className={styles.noticeIcon} />
      <div className={styles.noticeBody}>
        <span className={styles.noticeTitle}>{title}</span>
        <span>
          {message ? `${message}. ` : ''}
          {t('traces.common.load_error_hint')}
        </span>
        <div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('traces.common.try_again')}
          </Button>
        </div>
      </div>
    </div>
  );
}
