import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconSearch, IconSlidersHorizontal, IconX } from '@/components/ui/icons';
import type { TraceStatsGroup } from '@/services/api/traces';
import { OTHER_GROUP_KEY } from '../chart';
import { useTracesEnvironment } from '../context';
import {
  cleanValues,
  DEFAULT_FILTERS,
  filterStateKey,
  parseFilterState,
  RANGE_PRESETS,
  toLocalDateString,
  toQueryFilters,
  type RangePreset,
  type StatusFilter,
  type TextFilterField,
  type TraceFilterState,
} from '../filters';
import { useTraceFilters } from '../useTraceFilters';
import { useTraceFormat } from '../useTraceFormat';
import styles from './FilterBar.module.scss';

export type FilterBarField = 'range' | TextFilterField | 'status';

/** A field that the filter panel shows. */
type PanelField = TextFilterField | 'status';

/** List filters that list their values from `/traces/stats?group=...`. */
const SUGGESTION_GROUPS: Partial<Record<TextFilterField, TraceStatsGroup>> = {
  project: 'project',
  client: 'client',
  model: 'model',
  key: 'key',
  tag: 'tag',
  account: 'account',
  machine: 'machine',
};

type SetFilters = (patch: Partial<TraceFilterState>, options?: { replace?: boolean }) => void;

/** Display labels of filter values, by field and value. */
type LabelMap = Partial<Record<TextFilterField, Record<string, string>>>;

interface ValueEntry {
  key: string;
  label: string;
  sessions: number;
}

const valueCount = (filters: TraceFilterState, field: PanelField): number =>
  field === 'status' ? (filters.status ? 1 : 0) : filters[field].length;

const STATUS_VALUES: StatusFilter[] = ['', 'ok', 'error'];

interface FilterBarProps {
  fields: FilterBarField[];
  /** Shows the search box with this placeholder. */
  searchPlaceholder?: string;
  children?: ReactNode;
}

/**
 * The filter row of the Traces pages: search, the date range and one Filters
 * button. The button opens a panel with every other field. Choices apply at
 * once and show as removable chips under the row.
 */
export function FilterBar({ fields, searchPlaceholder, children }: FilterBarProps) {
  const { t } = useTranslation();
  const { filters, setFilters } = useTraceFilters();
  // Status first, then the list fields in the order the page gives.
  const panelFields: PanelField[] = [
    ...fields.filter((field): field is 'status' => field === 'status'),
    ...fields.filter((field): field is TextFilterField => field !== 'range' && field !== 'status'),
  ];
  const activeCount = panelFields.reduce((sum, field) => sum + valueCount(filters, field), 0);
  const { labels, remember } = useValueLabels(filters, panelFields);

  const clearFilters = () => setFilters(clearPatch(panelFields));

  const labelOf = (field: TextFilterField, value: string) => labels[field]?.[value] ?? value;
  const chips: Array<{ id: string; field: string; value: string; remove: () => void }> = [];
  for (const field of panelFields) {
    if (field === 'status') {
      if (filters.status) {
        chips.push({
          id: 'status',
          field: t('traces.filters.status'),
          value: statusLabel(t, filters.status),
          remove: () => setFilters({ status: '' }),
        });
      }
      continue;
    }
    for (const value of filters[field]) {
      chips.push({
        id: `${field}:${value}`,
        field: t(`traces.filters.${field}`),
        value: labelOf(field, value),
        remove: () => setFilters({ [field]: filters[field].filter((item) => item !== value) }),
      });
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.bar} role="search" aria-label={t('traces.filters.label')}>
        {searchPlaceholder ? (
          <SearchBox placeholder={searchPlaceholder} value={filters.q} onChange={setFilters} />
        ) : null}
        {fields.includes('range') ? <RangeChip filters={filters} onApply={setFilters} /> : null}
        {panelFields.length > 0 ? (
          <FiltersControl
            fields={panelFields}
            filters={filters}
            setFilters={setFilters}
            activeCount={activeCount}
            labels={labels}
            remember={remember}
          />
        ) : null}
        {children}
      </div>
      {chips.length > 0 ? (
        <div className={styles.activeRow} role="group" aria-label={t('traces.filters.active')}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={styles.activeChip}
              onClick={chip.remove}
              aria-label={t('traces.filters.remove_value', { field: chip.field, value: chip.value })}
            >
              <span className={styles.activeChipField}>{chip.field}:</span>
              <span className={styles.activeChipValue}>{chip.value}</span>
              <IconX size={12} className={styles.activeChipIcon} />
            </button>
          ))}
          <button type="button" className={styles.clear} onClick={clearFilters}>
            {t('traces.filters.clear', { count: activeCount })}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function clearPatch(fields: readonly PanelField[]): Partial<TraceFilterState> {
  const patch: Partial<TraceFilterState> = {};
  for (const field of fields) {
    if (field === 'status') patch.status = '';
    else patch[field] = [];
  }
  return patch;
}

function statusLabel(t: (key: string) => string, status: StatusFilter): string {
  if (status === 'ok') return t('traces.status.ok');
  if (status === 'error') return t('traces.filters.status_error');
  return t('traces.filters.all');
}

/**
 * Labels for the active filter values, so chips show names instead of ids. The
 * panel adds what it loads; this hook loads labels for values set by a link.
 */
function useValueLabels(filters: TraceFilterState, fields: readonly PanelField[]) {
  const { api } = useTracesEnvironment();
  const [labels, setLabels] = useState<LabelMap>({});

  const remember = useCallback((field: TextFilterField, entries: readonly ValueEntry[]) => {
    setLabels((current) => ({
      ...current,
      [field]: {
        ...current[field],
        ...Object.fromEntries(entries.map((entry) => [entry.key, entry.label])),
      },
    }));
  }, []);

  const wanted = fields.filter(
    (field): field is TextFilterField =>
      field !== 'status' && !!SUGGESTION_GROUPS[field] && filters[field].length > 0
  );
  const request = JSON.stringify({ range: filters.range, from: filters.from, to: filters.to, wanted });

  useEffect(() => {
    const { range, from, to, wanted: fieldsToLoad } = JSON.parse(request) as {
      range: RangePreset;
      from: string;
      to: string;
      wanted: TextFilterField[];
    };
    let cancelled = false;
    const query = toQueryFilters({ ...DEFAULT_FILTERS, range, from, to }, new Date());
    for (const field of fieldsToLoad) {
      const group = SUGGESTION_GROUPS[field];
      if (!group) continue;
      api
        .getStats(query, { group, bucket: 'day' })
        .then((stats) => {
          if (!cancelled) remember(field, stats.groups);
        })
        // A missing label only means the chip shows the raw value.
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [api, request, remember]);

  return { labels, remember };
}

// ─── Search ────────────────────────────────────────────────────────────────

function SearchBox({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: SetFilters;
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
      <label htmlFor={id} className={styles.srOnly}>
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

// ─── Popover behavior ──────────────────────────────────────────────────────

/**
 * Closes an open popover on a pointer press outside `wrapRef` and on Escape.
 * Escape also returns focus to the trigger.
 */
function useDismiss(
  open: boolean,
  wrapRef: RefObject<HTMLElement | null>,
  close: (returnFocus: boolean) => void
) {
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, wrapRef, close]);
}

// ─── Range ─────────────────────────────────────────────────────────────────

function RangeChip({ filters, onApply }: { filters: TraceFilterState; onApply: SetFilters }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);
  useDismiss(open, wrapRef, close);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>('input:checked') ?? panel?.querySelector<HTMLElement>('input'))?.focus();
  }, [open]);

  const value =
    filters.range === 'custom'
      ? t('traces.filters.custom_value', { from: filters.from, to: filters.to })
      : t(`traces.filters.range_${filters.range}`);
  const active = filters.range !== DEFAULT_FILTERS.range;

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
        <span className={styles.chipLabel}>{t('traces.filters.range')}:</span>
        <span className={styles.chipValue}>{value}</span>
        <IconChevronDown size={12} className={styles.chipCaret} />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t('traces.filters.range')}
          className={styles.panel}
        >
          <RangePanel filters={filters} onApply={onApply} close={() => close(true)} />
        </div>
      ) : null}
    </div>
  );
}

function RangePanel({
  filters,
  onApply,
  close,
}: {
  filters: TraceFilterState;
  onApply: SetFilters;
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

// ─── Filters panel ─────────────────────────────────────────────────────────

function FiltersControl({
  fields,
  filters,
  setFilters,
  activeCount,
  labels,
  remember,
}: {
  fields: PanelField[];
  filters: TraceFilterState;
  setFilters: SetFilters;
  activeCount: number;
  labels: LabelMap;
  remember: (field: TextFilterField, entries: readonly ValueEntry[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PanelField>(fields[0]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  // The first change in an open panel adds a history entry; later ones replace
  // it, so Back undoes one visit to the panel, not every click in it.
  const changedRef = useRef(false);
  const current = fields.includes(selected) ? selected : fields[0];

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);
  useDismiss(open, wrapRef, close);

  useEffect(() => {
    if (!open) return;
    changedRef.current = false;
    panelRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }, [open]);

  const apply = useCallback(
    (patch: Partial<TraceFilterState>) => {
      setFilters(patch, { replace: changedRef.current });
      changedRef.current = true;
    },
    [setFilters]
  );

  return (
    <div className={styles.filtersWrap} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.filtersButton} ${open ? styles.filtersButtonOpen : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={
          activeCount > 0 ? t('traces.filters.button_active', { count: activeCount }) : undefined
        }
        onClick={() => setOpen((value) => !value)}
      >
        <IconSlidersHorizontal size={14} />
        <span>{t('traces.filters.button')}</span>
        {activeCount > 0 ? (
          <span className={styles.badge} aria-hidden="true">
            {activeCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t('traces.filters.label')}
          className={styles.filterPanel}
        >
          <div className={styles.panelBody}>
            <nav aria-label={t('traces.filters.fields')} className={styles.fieldNav}>
              {fields.map((field) => {
                const count = valueCount(filters, field);
                const isCurrent = field === current;
                return (
                  <button
                    key={field}
                    type="button"
                    className={`${styles.fieldButton} ${isCurrent ? styles.fieldButtonCurrent : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => setSelected(field)}
                  >
                    <span>{t(`traces.filters.${field}`)}</span>
                    {count > 0 ? <span className={styles.fieldCount}>{count}</span> : null}
                  </button>
                );
              })}
            </nav>
            <div className={styles.fieldPane}>
              {current === 'status' ? (
                <StatusPane value={filters.status} apply={apply} />
              ) : current === 'folder' ? (
                <FolderPane values={filters.folder} apply={apply} />
              ) : (
                <ValuesPane
                  key={current}
                  field={current}
                  filters={filters}
                  labels={labels}
                  apply={apply}
                  remember={remember}
                />
              )}
            </div>
          </div>
          <div className={styles.panelFooter}>
            <MatchCount filters={filters} />
            <div className={styles.actions}>
              {activeCount > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => apply(clearPatch(fields))}>
                  {t('traces.filters.clear_all')}
                </Button>
              ) : null}
              <Button size="sm" onClick={() => close(true)}>
                {t('traces.filters.done')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Live count of the sessions that match the current filters. */
function MatchCount({ filters }: { filters: TraceFilterState }) {
  const { t } = useTranslation();
  const { api } = useTracesEnvironment();
  const fmt = useTraceFormat();
  const [count, setCount] = useState<number | null>(null);
  const key = filterStateKey(filters);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getStats(toQueryFilters(parseFilterState(key), new Date()), { group: 'project', bucket: 'day' })
        .then((stats) => {
          if (!cancelled) setCount(stats.totals.sessions);
        })
        .catch(() => {
          if (!cancelled) setCount(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, key]);

  return (
    <span className={styles.matchCount} aria-live="polite">
      {count === null ? '' : t('traces.filters.matching', { count, formatted: fmt.count(count) })}
    </span>
  );
}

function PaneHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.paneHeader}>
      <h2 className={styles.paneTitle}>{title}</h2>
      {children ? <div className={styles.paneActions}>{children}</div> : null}
    </div>
  );
}

function StatusPane({
  value,
  apply,
}: {
  value: StatusFilter;
  apply: (patch: Partial<TraceFilterState>) => void;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <>
      <PaneHeader title={t('traces.filters.status')} />
      <fieldset className={styles.valueList}>
        <legend className={styles.srOnly}>{t('traces.filters.status')}</legend>
        {STATUS_VALUES.map((status) => (
          <label key={status || 'all'} className={styles.valueOption}>
            <input
              type="radio"
              name={name}
              checked={value === status}
              onChange={() => apply({ status })}
            />
            <span className={styles.valueLabel}>{statusLabel(t, status)}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

function FolderPane({
  values,
  apply,
}: {
  values: string[];
  apply: (patch: Partial<TraceFilterState>) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState('');

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    apply({ folder: cleanValues([...values, draft]) });
    setDraft('');
  };

  return (
    <>
      <PaneHeader title={t('traces.filters.folder')} />
      <form className={styles.addRow} onSubmit={add}>
        <label htmlFor={inputId} className={styles.srOnly}>
          {t('traces.filters.folder_input')}
        </label>
        <input
          id={inputId}
          className={`${styles.input} ${styles.mono}`}
          value={draft}
          placeholder={t('traces.filters.folder_placeholder')}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>
          {t('traces.filters.add')}
        </Button>
      </form>
      <span className={styles.hint}>{t('traces.filters.folder_hint')}</span>
      {values.length > 0 ? (
        <div className={styles.valueList} role="group" aria-label={t('traces.filters.folder')}>
          {values.map((value) => (
            <label key={value} className={styles.valueOption}>
              <input
                type="checkbox"
                checked
                onChange={() => apply({ folder: values.filter((item) => item !== value) })}
              />
              <span className={`${styles.valueLabel} ${styles.mono}`}>{value}</span>
            </label>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ValuesPane({
  field,
  filters,
  labels,
  apply,
  remember,
}: {
  field: TextFilterField;
  filters: TraceFilterState;
  labels: LabelMap;
  apply: (patch: Partial<TraceFilterState>) => void;
  remember: (field: TextFilterField, entries: readonly ValueEntry[]) => void;
}) {
  const { t } = useTranslation();
  const { api } = useTracesEnvironment();
  const fmt = useTraceFormat();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<ValueEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const group = SUGGESTION_GROUPS[field];
  const selected = filters[field];

  // Counts show what each value adds to the other filters, so they ignore
  // this field's own choices.
  const facetKey = filterStateKey({ ...filters, [field]: [] });
  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    api
      .getStats(toQueryFilters(parseFilterState(facetKey), new Date()), { group, bucket: 'day' })
      .then((stats) => {
        if (cancelled) return;
        const list = stats.groups
          .filter((entry) => entry.key !== OTHER_GROUP_KEY)
          .map((entry) => ({ key: entry.key, label: entry.label, sessions: entry.sessions }));
        setEntries(list);
        setFailed(false);
        remember(field, list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, group, facetKey, field, remember]);

  // Chosen values stay in the list even when the range has no sessions for them.
  const options: ValueEntry[] = [...(entries ?? [])];
  for (const value of selected) {
    if (!options.some((entry) => entry.key === value)) {
      options.push({ key: value, label: labels[field]?.[value] ?? value, sessions: 0 });
    }
  }
  const needle = query.trim().toLowerCase();
  const visible = options.filter(
    (entry) =>
      !needle || entry.key.toLowerCase().includes(needle) || entry.label.toLowerCase().includes(needle)
  );

  const toggle = (value: string) =>
    apply({
      [field]: selected.includes(value)
        ? selected.filter((item) => item !== value)
        : cleanValues([...selected, value]),
    });

  const addTyped = (event: FormEvent) => {
    event.preventDefault();
    const typed = query.trim();
    if (!typed) return;
    const exact = options.find(
      (entry) => entry.key.toLowerCase() === typed.toLowerCase() || entry.label.toLowerCase() === typed.toLowerCase()
    );
    const value = exact?.key ?? typed;
    if (!selected.includes(value)) apply({ [field]: cleanValues([...selected, value]) });
    setQuery('');
  };

  const title = t(`traces.filters.${field}`);
  return (
    <>
      <PaneHeader title={title}>
        {visible.length > 0 ? (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => apply({ [field]: cleanValues([...selected, ...visible.map((entry) => entry.key)]) })}
          >
            {t('traces.filters.select_all')}
          </button>
        ) : null}
        {selected.length > 0 ? (
          <button type="button" className={styles.linkButton} onClick={() => apply({ [field]: [] })}>
            {t('traces.filters.clear_field')}
          </button>
        ) : null}
      </PaneHeader>
      <form className={styles.search} onSubmit={addTyped}>
        <label htmlFor={searchId} className={styles.srOnly}>
          {t('traces.filters.search_values')}
        </label>
        <IconSearch size={14} className={styles.searchIcon} />
        <input
          id={searchId}
          type="search"
          className={styles.searchInput}
          placeholder={t('traces.filters.search_values')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      {entries === null && !failed ? (
        <span className={styles.hint}>{t('traces.common.loading')}</span>
      ) : null}
      {failed ? <span className={styles.hint}>{t('traces.filters.values_failed')}</span> : null}
      {visible.length > 0 ? (
        <div className={styles.valueList} role="group" aria-label={title}>
          {visible.map((entry) => (
            <label key={entry.key} className={styles.valueOption} title={entry.key}>
              <input
                type="checkbox"
                checked={selected.includes(entry.key)}
                onChange={() => toggle(entry.key)}
              />
              <span className={styles.valueLabel}>{entry.label}</span>
              <span className={styles.valueCount}>{fmt.count(entry.sessions)}</span>
            </label>
          ))}
        </div>
      ) : entries !== null && needle ? (
        <span className={styles.hint}>{t('traces.filters.no_matches', { q: query.trim() })}</span>
      ) : entries !== null && !failed ? (
        <span className={styles.hint}>{t('traces.filters.no_values')}</span>
      ) : null}
    </>
  );
}
