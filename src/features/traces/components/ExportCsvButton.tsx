import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconDownload } from '@/components/ui/icons';
import type { TraceExportGroup, TraceExportPeriod, TraceQueryFilters } from '@/services/api/traces';
import { useNotificationStore } from '@/stores';
import { downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/helpers';
import { useTracesEnvironment } from '../context';

interface ExportCsvButtonProps {
  label: string;
  group: TraceExportGroup;
  period: TraceExportPeriod;
  /** Built at click time so the export uses the current range. */
  getFilters: () => TraceQueryFilters;
}

export function ExportCsvButton({ label, group, period, getFilters }: ExportCsvButtonProps) {
  const { t } = useTranslation();
  const { api } = useTracesEnvironment();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const file = await api.exportCsv(getFilters(), { group, period });
      downloadBlob({ filename: file.filename, blob: file.blob });
    } catch (error) {
      showNotification(
        t('traces.export.failed', { message: getErrorMessage(error, t('traces.common.unknown')) }),
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={() => void handleExport()}>
      <IconDownload size={14} aria-hidden="true" /> {label}
    </Button>
  );
}
