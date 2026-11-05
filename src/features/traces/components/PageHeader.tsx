import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../Traces.module.scss';

interface PageHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
  /** Replaces the "Observe / Traces" crumb, for example with a back link. */
  above?: ReactNode;
  below?: ReactNode;
}

export function PageHeader({ title, actions, above, below }: PageHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        {above ?? <span className={styles.crumb}>{t('traces.common.crumb')}</span>}
        <h1 className={styles.title}>{title}</h1>
        {below}
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </div>
  );
}
