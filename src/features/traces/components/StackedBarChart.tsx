import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { peakIndex, seriesColor, xLabelIndexes, type StackedChart } from '../chart';
import styles from './StackedBarChart.module.scss';
import traceStyles from '../Traces.module.scss';

interface StackedBarChartProps {
  chart: StackedChart;
  /** Short description for screen readers, for example "Cost per day by project". */
  description: string;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  formatBucket: (start: string) => string;
}

/**
 * Stacked bars with a readout line. Hovering a bar (or using the arrow keys while the
 * chart has focus) shows that bucket's split.
 */
export function StackedBarChart({
  chart,
  description,
  formatValue,
  formatTick,
  formatBucket,
}: StackedBarChartProps) {
  const { t } = useTranslation();
  const count = chart.bars.length;
  const [hover, setHover] = useState<number | null>(null);
  const lastWithData = chart.bars.reduce((last, item, index) => (item.total > 0 ? index : last), -1);
  const active = hover !== null && hover < count ? hover : lastWithData >= 0 ? lastWithData : count - 1;
  const bar = active >= 0 ? chart.bars[active] : null;
  const labelIndexes = xLabelIndexes(count);
  const gap = count > 60 ? 1 : count > 31 ? 2 : 4;
  const seriesByKey = new Map(chart.series.map((series) => [series.key, series]));

  const peak = peakIndex(chart);
  const grandTotal = chart.bars.reduce((sum, item) => sum + item.total, 0);
  const summary =
    count === 0
      ? `${description}. ${t('traces.chart.no_data')}`
      : t('traces.chart.summary', {
          description,
          count,
          total: formatValue(grandTotal),
          peakDate: formatBucket(chart.bars[peak].start),
          peakValue: formatValue(chart.bars[peak].total),
        });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, active - 1),
      ArrowRight: Math.min(count - 1, active + 1),
      Home: 0,
      End: count - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      setHover(moves[event.key]);
    }
  };

  return (
    <>
      <div className={styles.readout} aria-live="polite">
        {bar ? (
          <>
            <span className={styles.readoutDate}>{formatBucket(bar.start)}</span>
            <span className={styles.readoutTotal}>{formatValue(bar.total)}</span>
            {bar.segments.map((segment) => {
              const series = seriesByKey.get(segment.key);
              return (
                <span key={segment.key} className={styles.readoutPart}>
                  <span
                    className={traceStyles.swatch}
                    style={{ background: seriesColor(series?.colorSlot ?? 0) }}
                  />
                  {series?.label ?? segment.key} <strong>{formatValue(segment.value)}</strong>
                </span>
              );
            })}
          </>
        ) : null}
      </div>

      <div
        className={styles.chart}
        role="group"
        aria-label={summary}
        tabIndex={count > 0 ? 0 : -1}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.axis} aria-hidden="true">
          {chart.ticks.map((tick, index) => (
            <span key={index}>{formatTick(tick)}</span>
          ))}
        </div>
        <div className={styles.plotColumn} aria-hidden="true">
          <div className={styles.plot}>
            <div className={styles.grid}>
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
            {count === 0 ? <div className={styles.empty}>{t('traces.chart.no_data')}</div> : null}
            <div className={styles.bars} style={{ gap }}>
              {chart.bars.map((item, index) => (
                <div
                  key={item.start}
                  className={styles.slot}
                  onMouseEnter={() => setHover(index)}
                >
                  <div
                    className={`${styles.column} ${index === active ? styles.columnActive : ''}`}
                    style={{ height: `${chart.max > 0 ? (item.total / chart.max) * 100 : 0}%` }}
                  >
                    {item.segments.map((segment) => (
                      <div
                        key={segment.key}
                        className={styles.segment}
                        style={{
                          height: `${item.total > 0 ? (segment.value / item.total) * 100 : 0}%`,
                          background: seriesColor(seriesByKey.get(segment.key)?.colorSlot ?? 0),
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.labels} style={{ gap }}>
            {chart.bars.map((item, index) => (
              <span
                key={item.start}
                className={index === count - 1 && count > 1 ? styles.labelEnd : undefined}
              >
                {labelIndexes.has(index) ? formatBucket(item.start) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
