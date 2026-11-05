import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconCheckCircle2 } from '@/components/ui/icons';
import { useTracesHealth } from '../context';
import { useTraceFormat } from '../useTraceFormat';
import styles from '../Traces.module.scss';

/** "Recorder: healthy, 0 dropped" from the health numbers. */
export function RecorderStatus() {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { health } = useTracesHealth();
  const dropped = health.dropped_events + health.dropped_content;
  const busy = health.queue_size > 0 && health.queue_depth / health.queue_size >= 0.8;
  const healthy = dropped === 0 && !busy;
  return (
    <span className={styles.recorder}>
      {healthy ? <IconCheckCircle2 size={14} /> : <IconAlertTriangle size={14} />}
      {healthy
        ? t('traces.recorder.healthy', { dropped: fmt.count(dropped) })
        : busy
          ? t('traces.recorder.busy', {
              depth: fmt.count(health.queue_depth),
              size: fmt.count(health.queue_size),
            })
          : t('traces.recorder.dropping', { dropped: fmt.count(dropped) })}
    </span>
  );
}
