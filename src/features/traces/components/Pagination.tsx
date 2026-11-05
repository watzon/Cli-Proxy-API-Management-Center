import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useTraceFormat } from '../useTraceFormat';
import styles from '../Traces.module.scss';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className={styles.pagination} aria-label={t('traces.pagination.label')}>
      <span>
        {t('traces.pagination.range', {
          first: fmt.count(first),
          last: fmt.count(last),
          total: fmt.count(total),
        })}
      </span>
      <div className={styles.paginationButtons}>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t('traces.pagination.previous')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          {t('traces.pagination.next')}
        </Button>
      </div>
    </nav>
  );
}
