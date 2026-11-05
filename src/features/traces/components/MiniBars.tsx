import type { TraceProjectDay } from '@/services/api/traces';
import { seriesColor } from '../chart';
import styles from './MiniBars.module.scss';

interface MiniBarsProps {
  days: TraceProjectDay[];
  /** Shared maximum so rows compare at the same scale. */
  max: number;
  colorSlot: number;
  label: string;
}

/** Small daily cost bars for a table row. */
export function MiniBars({ days, max, colorSlot, label }: MiniBarsProps) {
  return (
    <div className={styles.bars} role="img" aria-label={label}>
      {days.map((day) => (
        <div
          key={day.day}
          className={styles.bar}
          style={{
            height: `${Math.max(1, max > 0 ? ((day.cost_usd ?? 0) / max) * 28 : 1)}px`,
            background: seriesColor(colorSlot),
          }}
        />
      ))}
    </div>
  );
}
