import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TraceBlockDiff } from '@/services/api/traces';
import { buildDiffView, type DiffLineKind } from '../diff';
import styles from './TurnDetail.module.scss';

const lineClass: Record<DiffLineKind, string> = {
  context: '',
  add: styles.lineAdd,
  remove: styles.lineRemove,
  hunk: styles.lineHunk,
  header: styles.lineHeader,
  skip: styles.lineSkip,
};

const lineSign: Record<DiffLineKind, string> = {
  context: '',
  add: '+',
  remove: '-',
  hunk: '',
  header: '',
  skip: '',
};

/** Unified diff of one file change from a tool call. */
export function DiffBlock({ diff }: { diff: TraceBlockDiff }) {
  const { t } = useTranslation();
  const view = useMemo(() => buildDiffView(diff), [diff]);
  return (
    <div className={styles.diff}>
      <div className={styles.diffHead}>
        <span className={styles.diffFile}>{view.file || t('traces.blocks.unknown_file')}</span>
        <span>{t('traces.blocks.diff_stat', { added: view.added, removed: view.removed })}</span>
      </div>
      <div
        className={styles.diffBody}
        role="region"
        aria-label={t('traces.blocks.diff_label', { file: view.file })}
        tabIndex={0}
      >
        {view.lines.map((line, index) => (
          <div key={index} className={`${styles.diffLine} ${lineClass[line.kind]}`}>
            <span className={styles.diffSign}>{lineSign[line.kind]}</span>
            {line.kind === 'skip'
              ? t('traces.blocks.unchanged_lines', { count: line.skipped ?? 0 })
              : line.text || ' '}
          </div>
        ))}
      </div>
    </div>
  );
}
