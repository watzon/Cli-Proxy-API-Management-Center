import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconSearch } from '@/components/ui/icons';
import type { TraceStatsGroup } from '@/services/api/traces';
import { OTHER_GROUP_KEY } from '../chart';
import { useTracesEnvironment } from '../context';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  RANGE_PRESETS,
  toLocalDateString,
  toQueryFilters,
  type RangePreset,
  type StatusFilter,
  type TextFilterField,
  type TraceFilterState,
} from '../filters';
import { useTraceFilters } from '../useTraceFilters';
import styles from './FilterBar.module.scss';

export type FilterBarField = 'range' | TextFilterField | 'status';

/** Text filters that can suggest values from `/traces/stats?group=...`. */
const SUGGESTION_GROUPS: Partial<Record<TextFilterField, TraceStatsGroup>> = {
  project: 'project',
  client: 'client',
  model: 'model',
  key: 'key',
  tag: 'tag',
  account: 'account',
  machine: 'machine',
};

interface FilterBarProps {
  fields: FilterBarField[];
  /** Shows the search box with this placeholder. */
  searchPlaceholder?: string;
  children?: ReactNode;
}

export function FilterBar({ fields, searchPlaceholder, children }: FilterBarProps) {
  const { t } = useTranslation();
  const { filters, setFilters } = useTraceFilters();
  const activeCount = activeFilterCount(filters);

  const clearFilters = () => {
    const reset: Partial<TraceFilterState> = { status: '' };
    for (const field of fields) {
      if (field !== 'range' && field !== 'status') reset[field] = '';
    }
    setFilters(reset);
  };

  return (
    <div className={styles.bar} role="search" aria-label={t('traces.filters.label')}>
      {searchPlaceholder ? (
        <SearchBox placeholder={searchPlaceholder} value={filters.q} onChange={setFilters} />
      ) : null}
      {fields.map((field) =>
        field === 'range' ? (
          <RangeChip key={field} filters={filters} onApply={setFilters} />
        ) : field === 'status' ? (
          <StatusChip key={field} value={filters.status} onApply={setFilters} />
        ) : (
          <TextChip key={field} field={field} filters={filters} onApply={setFilters} />
        )
      )}
      {children}
      {activeCount > 0 ? (
        <button type="button" className={styles.clear} onClick={clearFilters}>
          {t('traces.filters.clear', { count: activeCount })}
        </button>
      ) : null}
    </div>
  );
}

// ─── Search ────────────────────────────────────────────────────────────────

function SearchBox({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (patch: Partial<TraceFilterState>, options?: { replace?: boolean }) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);

  // Follow the URL when it changes from outside (back button, "clear" links).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft.trim() === value) return;
    const timer = window.setTimeout(() => onChange({ q: draft }, { replace: true }), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className={styles.search}>
      <label htmlFor={id} style={srOnlyStyle}>
        {placeholder}
      </label>
      <IconSearch size={14} className={styles.searchIcon} />
      <input
        id={id}
        type="search"
        className={styles.searchInput}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onChange({ q: draft });
        }}
      />
    </div>
  );
}

const srOnlyStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

// ─── Popover chip ──────────────────────────────────────────────────────────

function PopoverChip({
  label,
  value,
  active,
  children,
}: {
  label: string;
  value: string;
  active: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusable =
      panel?.querySelector<HTMLElement>('input:checked') ??
      panel?.querySelector<HTMLElement>('input, button');
    focusable?.focus();

    const handlePointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        setReturnFocus(true);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Focus goes back to the chip after a choice, so keyboard users keep their place.
  useEffect(() => {
    if (open || !returnFocus) return;
    triggerRef.current?.focus();
    setReturnFocus(false);
  }, [open, returnFocus]);

  const close = () => {
    setOpen(false);
    setReturnFocus(true);
  };

  return (
    <div className={styles.chipWrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.chip} ${active ? styles.chipActive : ''}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.chipLabel}>{label}:</span>
        <span className={styles.chipValue}>{value}</span>
        <IconChevronDown size={12} className={styles.chipCaret} />
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} role="dialog" aria-label={label} className={styles.panel}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

// ─── Range ─────────────────────────────────────────────────────────────────

function RangeChip({
  filters,
  onApply,
}: {
  filters: TraceFilterState;
  onApply: (patch: Partial<TraceFilterState>) => void;
}) {
  const { t } = useTranslation();
  const value =
    filters.range === 'custom'
      ? t('traces.filters.custom_value', { from: filters.from, to: filters.to })
      : t(`traces.filters.range_${filters.range}`);
  return (
    <PopoverChip
      label={t('traces.filters.range')}
      value={value}
      active={filters.range !== DEFAULT_FILTERS.range}
    >
      {(close) => <RangePanel filters={filters} onApply={onApply} close={close} />}
    </PopoverChip>
  );
}

function RangePanel({
  filters,
  onApply,
  close,
}: {
  filters: TraceFilterState;
  onApply: (patch: Partial<TraceFilterState>) => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  const name = useId();
  const today = toLocalDateString(new Date());
  const [custom, setCustom] = useState(filters.range === 'custom');
  const [from, setFrom] = useState(filters.from || today);
  const [to, setTo] = useState(filters.to || today);
  const invalid = !from || !to;

  const pick = (preset: RangePreset) => {
    if (preset === 'custom') {
      setCustom(true);
      return;
    }
    onApply({ range: preset, from: '', to: '' });
    close();
  };

  const applyCustom = (event: FormEvent) => {
    event.preventDefault();
    if (invalid) return;
    onApply({ range: 'custom', from: from <= to ? from : to, to: from <= to ? to : from });
    close();
  };

  return (
    <form onSubmit={applyCustom} className={styles.panelField}>
      <fieldset className={styles.options}>
        <legend className={styles.panelTitle}>{t('traces.filters.range')}</legend>
        {RANGE_PRESETS.map((preset) => (
          <label key={preset} className={styles.option}>
            <input
              type="radio"
              name={name}
              checked={custom ? preset === 'custom' : filters.range === preset}
              onChange={() => pick(preset)}
            />
            {t(`traces.filters.range_${preset}`)}
          </label>
        ))}
      </fieldset>
      {custom ? (
        <>
          <div className={styles.dates}>
            <label className={styles.panelField}>
              {t('traces.filters.from')}
              <input
                type="date"
                className={styles.input}
                value={from}
                max={today}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className={styles.panelField}>
              {t('traces.filters.to')}
              <input
                type="date"
                className={styles.input}
                value={to}
                max={today}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <div className={styles.actions}>
            <Button type="submit" size="sm" disabled={invalid}>
              {t('traces.filters.apply')}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

// ─── Status ────────────────────────────────────────────────────────────────

function StatusChip({
  value,
  onApply,
}: {
  value: StatusFilter;
  onApply: (patch: Partial<TraceFilterState>) => void;
}) {
  const { t } = useTranslation();
  const name = useId();
  const options: Array<{ value: StatusFilter; label: string }> = [
    { value: '', label: t('traces.filters.all') },
    { value: 'ok', label: t('traces.status.ok') },
    { value: 'error', label: t('traces.filters.status_error') },
  ];
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <PopoverChip label={t('traces.filters.status')} value={current.label} active={value !== ''}>
      {(close) => (
        <fieldset className={styles.options}>
          <legend className={styles.panelTitle}>{t('traces.filters.status')}</legend>
          {options.map((option) => (
            <label key={option.value || 'all'} className={styles.option}>
              <input
                type="radio"
                name={name}
                checked={option.value === value}
                onChange={() => {
                  onApply({ status: option.value });
                  close();
                }}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      )}
    </PopoverChip>
  );
}

// ─── Text filters ──────────────────────────────────────────────────────────

function TextChip({
  field,
  filters,
  onApply,
}: {
  field: TextFilterField;
  filters: TraceFilterState;
  onApply: (patch: Partial<TraceFilterState>) => void;
}) {
  const { t } = useTranslation();
  const value = filters[field];
  const allLabel = field === 'folder' ? t('traces.filters.any') : t('traces.filters.all');
  return (
    <PopoverChip label={t(`traces.filters.${field}`)} value={value || allLabel} active={!!value}>
      {(close) => (
        <TextPanel
          field={field}
          filters={filters}
          onApply={(next) => {
            onApply({ [field]: next });
            close();
          }}
        />
      )}
    </PopoverChip>
  );
}

function TextPanel({
  field,
  filters,
  onApply,
}: {
  field: TextFilterField;
  filters: TraceFilterState;
  onApply: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { api } = useTracesEnvironment();
  const inputId = useId();
  const [draft, setDraft] = useState(filters[field]);
  const [suggestions, setSuggestions] = useState<Array<{ key: string; label: string }> | null>(
    null
  );
  const [suggestError, setSuggestError] = useState(false);
  const group = SUGGESTION_GROUPS[field];

  // Suggest values seen in the current range, ignoring this field's own filter.
  const suggestionFilters = JSON.stringify({ ...filters, [field]: '' });
  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    const state = JSON.parse(suggestionFilters) as TraceFilterState;
    api
      .getStats(toQueryFilters(state, new Date()), { group, bucket: 'day' })
      .then((stats) => {
        if (cancelled) return;
        setSuggestions(
          stats.groups
            .filter((entry) => entry.key !== OTHER_GROUP_KEY)
            .map((entry) => ({ key: entry.key, label: entry.label }))
        );
      })
      .catch(() => {
        if (!cancelled) setSuggestError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, group, suggestionFilters]);

  const needle = draft.trim().toLowerCase();
  const visible = (suggestions ?? []).filter(
    (entry) =>
      !needle ||
      entry.key.toLowerCase().includes(needle) ||
      entry.label.toLowerCase().includes(needle)
  );

  return (
    <form
      className={styles.panelField}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft.trim());
      }}
    >
      <label htmlFor={inputId} className={styles.panelTitle}>
        {t(`traces.filters.${field}`)}
      </label>
      <input
        id={inputId}
        className={styles.input}
        value={draft}
        placeholder={t(`traces.filters.${field}_placeholder`)}
        onChange={(event) => setDraft(event.target.value)}
      />
      {group ? (
        suggestions === null && !suggestError ? (
          <span className={styles.hint}>{t('traces.common.loading')}</span>
        ) : suggestError ? (
          <span className={styles.hint}>{t('traces.filters.suggestions_failed')}</span>
        ) : visible.length > 0 ? (
          <div className={styles.options} role="group" aria-label={t('traces.filters.suggestions')}>
            {visible.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={styles.option}
                onClick={() => onApply(entry.key)}
              >
                {entry.label}
                {entry.label !== entry.key ? (
                  <span className={styles.optionMeta}>{entry.key}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <span className={styles.hint}>{t('traces.filters.no_suggestions')}</span>
        )
      ) : (
        <span className={styles.hint}>{t('traces.filters.folder_hint')}</span>
      )}
      <div className={styles.actions}>
        {filters[field] ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onApply('')}>
            {t('traces.filters.clear_field')}
          </Button>
        ) : null}
        <Button type="submit" size="sm">
          {t('traces.filters.apply')}
        </Button>
      </div>
    </form>
  );
}
