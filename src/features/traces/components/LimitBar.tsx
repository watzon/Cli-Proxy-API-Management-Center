import { useTranslation } from 'react-i18next';
import { IconAlertTriangle } from '@/components/ui/icons';
import type { TraceLimitWindow } from '@/services/api/traces';
import { limitLevel } from '../limits';
import { useWindowLabel } from '../useWindowLabel';
import { useTraceFormat } from '../useTraceFormat';
import styles from './LimitBar.module.scss';

const levelColor = {
  normal: 'var(--trace-level-normal)',
  high: 'var(--trace-level-high)',
  critical: 'var(--trace-level-critical)',
  unknown: 'var(--trace-level-normal)',
} as const;

interface LimitBarProps {
  window: TraceLimitWindow;
  size?: 'sm' | 'md';
  /** Text under the bar, for example the reset time. */
  caption?: string | null;
}

/** One plan window: label, percent, a bar colored by level, and a warning icon at 85%. */
export function LimitBar({ window, size = 'md', caption }: LimitBarProps) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const windowLabel = useWindowLabel();
  const level = limitLevel(window.used_pct);
  const label = windowLabel(window.name);
  const value =
    window.used_pct !== null ? fmt.percent(window.used_pct) : window.status || t('traces.common.unknown');
  return (
    <div className={`${styles.window} ${size === 'sm' ? styles.small : ''}`}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {level === 'critical' ? (
            <IconAlertTriangle size={12} aria-label={t('traces.limits.near_limit')} role="img" />
          ) : null}
          {value}
        </span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={window.used_pct ?? undefined}
        aria-valuetext={value}
      >
        <div
          className={styles.fill}
          style={{
            width: `${Math.min(100, Math.max(0, window.used_pct ?? 0))}%`,
            background: levelColor[level],
          }}
        />
      </div>
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </div>
  );
}
