import { useTranslation } from 'react-i18next';
import { windowLabelKey } from './limits';

/** Translated name for a plan limit window ("5-hour window"), or the raw name. */
export function useWindowLabel() {
  const { t } = useTranslation();
  return (name: string) => {
    const key = windowLabelKey(name);
    return key ? t(key) : t('traces.limits.window_other', { name });
  };
}
