import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconPencil,
  IconPlus,
  IconTrash2,
} from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import type {
  TraceProject,
  TraceProjectRule,
  TraceProjectRuleWithHits,
  TraceProjectsResponse,
} from '@/services/api/traces';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { ExportCsvButton } from '../components/ExportCsvButton';
import { LoadError } from '../components/LoadError';
import { MiniBars } from '../components/MiniBars';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { useTracePaths, useTracesEnvironment } from '../context';
import { filterStateKey, toQueryFilters, writeFilterState, DEFAULT_FILTERS, type RangePreset } from '../filters';
import { moveItem, validateRule, type RuleError } from '../rules';
import { useTraceFilters } from '../useTraceFilters';
import { useTraceFormat } from '../useTraceFormat';
import { useTraceResource } from '../useTraceResource';
import styles from '../Traces.module.scss';
import pageStyles from './ProjectsPage.module.scss';

const PERIODS: RangePreset[] = ['week', '30d', 'month'];

export function ProjectsPage() {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { api } = useTracesEnvironment();
  const paths = useTracePaths();
  const { filters, setFilters } = useTraceFilters();
  const resource = useTraceResource(filterStateKey(filters), () =>
    api.getProjects(toQueryFilters(filters, new Date()))
  );
  const reload = useCallback(() => resource.reload(), [resource]);
  useHeaderRefresh(reload);
  const [editing, setEditing] = useState<TraceProject | null>(null);

  const data = resource.data;
  const sessionsLink = (projectId: string) =>
    `${paths.sessions}?${writeFilterState({ ...DEFAULT_FILTERS, range: filters.range, from: filters.from, to: filters.to, project: projectId }).toString()}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('traces.projects.title')}
        actions={
          <>
            <SegmentedControl
              label={t('traces.projects.period')}
              value={filters.range}
              options={PERIODS.map((value) => ({ value, label: t(`traces.filters.range_${value}`) }))}
              onChange={(value) => setFilters({ range: value, from: '', to: '' })}
            />
            <ExportCsvButton
              label={t('traces.export.report')}
              group="project"
              period="day"
              getFilters={() => toQueryFilters(filters, new Date())}
            />
          </>
        }
      />

      {resource.error && !data ? (
        <LoadError
          title={t('traces.projects.load_failed')}
          message={resource.error}
          onRetry={() => void resource.reload()}
        />
      ) : !data ? (
        <div className={styles.skeletonStack} aria-busy="true" aria-label={t('traces.common.loading')}>
          <Skeleton height={320} rounded={12} />
        </div>
      ) : (
        <div className={styles.split}>
          <section
            className={`${styles.card} ${styles.cardFlush} ${styles.splitMain} ${
              resource.loading ? styles.loadingOverlay : ''
            }`}
            aria-label={t('traces.projects.title')}
            aria-busy={resource.loading}
          >
            {data.projects.length === 0 ? (
              <div className={styles.emptyBlock}>{t('traces.projects.empty')}</div>
            ) : (
              <ProjectsTable
                data={data}
                sessionsLink={sessionsLink}
                onEdit={setEditing}
              />
            )}
          </section>

          <aside className={styles.splitSide} aria-label={t('traces.rules.title')}>
            <RulesPanel
              serverRules={data.rules}
              onSaved={() => void resource.reload()}
            />
            {data.unassigned_sessions > 0 ? (
              <section className={styles.notice} aria-labelledby="unassigned-title">
                <IconAlertTriangle size={18} className={styles.noticeIcon} />
                <div className={styles.noticeBody}>
                  <h2 id="unassigned-title" className={styles.noticeTitle} style={{ margin: 0 }}>
                    {t('traces.projects.unassigned_title', {
                      count: data.unassigned_sessions,
                      formatted: fmt.count(data.unassigned_sessions),
                    })}
                  </h2>
                  <span>
                    {t('traces.projects.unassigned_text_before')}{' '}
                    <code className={styles.code}>X-CPA-Project</code>{' '}
                    {t('traces.projects.unassigned_text_after')}
                  </span>
                  <Link className={styles.link} to={sessionsLink('unassigned')}>
                    {t('traces.projects.review_unassigned')}
                  </Link>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      )}

      {editing && data ? (
        <ProjectEditModal
          project={editing}
          projects={data.projects}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void resource.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectsTable({
  data,
  sessionsLink,
  onEdit,
}: {
  data: TraceProjectsResponse;
  sessionsLink: (projectId: string) => string;
  onEdit: (project: TraceProject) => void;
}) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const projects = data.projects;
  const maxDaily = Math.max(
    0,
    ...projects.flatMap((project) => project.daily.map((day) => day.cost_usd ?? 0))
  );
  const totals = projects.reduce(
    (sum, project) => ({
      active: sum.active + project.active_ms,
      sessions: sum.sessions + project.sessions,
      tokens: sum.tokens + project.tokens.total,
      cost: project.cost_usd === null || sum.cost === null ? sum.cost : sum.cost + project.cost_usd,
      unknownCost: sum.unknownCost || project.cost_usd === null,
    }),
    { active: 0, sessions: 0, tokens: 0, cost: 0 as number | null, unknownCost: false }
  );

  return (
    <Table className={`${styles.table} ${styles.tableInCard}`}>
      <TableHeader>
        <tr>
          <TableHead scope="col">{t('traces.columns.project')}</TableHead>
          <TableHead scope="col">{t('traces.projects.daily_cost')}</TableHead>
          <TableHead scope="col" alignRight>{t('traces.columns.active')}</TableHead>
          <TableHead scope="col" alignRight>{t('traces.columns.sessions')}</TableHead>
          <TableHead scope="col" alignRight>{t('traces.columns.tokens')}</TableHead>
          <TableHead scope="col" alignRight>{t('traces.columns.cost')}</TableHead>
          <TableHead scope="col">{t('traces.projects.top_model')}</TableHead>
          <TableHead scope="col">{t('traces.projects.last_active')}</TableHead>
          <TableHead scope="col">
            <span className={styles.srOnly}>{t('traces.common.actions')}</span>
          </TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {projects.map((project, index) => (
          <TableRow key={project.id}>
            <TableCell className={styles.wrapCell}>
              <Link className={styles.rowTitle} to={sessionsLink(project.id)}>
                {project.name}
              </Link>
              {project.key ? (
                <div className={`${styles.rowMeta} ${styles.mono}`}>{project.key}</div>
              ) : null}
            </TableCell>
            <TableCell>
              <MiniBars
                days={project.daily}
                max={maxDaily}
                colorSlot={index < 4 ? index + 1 : 8}
                label={t('traces.projects.daily_cost_label', { name: project.name })}
              />
            </TableCell>
            <TableCell className={styles.num} style={{ fontWeight: 600 }}>
              {fmt.hours(project.active_ms)}
            </TableCell>
            <TableCell className={styles.num}>{fmt.count(project.sessions)}</TableCell>
            <TableCell className={styles.num}>{fmt.compact(project.tokens.total)}</TableCell>
            <TableCell className={styles.num}>{fmt.money(project.cost_usd)}</TableCell>
            <TableCell className={styles.mono}>{project.top_model || t('traces.common.none')}</TableCell>
            <TableCell className={styles.muted}>{fmt.dateTime(project.last_active_at || null)}</TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(project)}
                aria-label={t('traces.projects.edit_label', { name: project.name })}
              >
                <IconPencil size={14} aria-hidden="true" /> {t('traces.projects.edit')}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <tfoot className={styles.tfoot}>
        <tr>
          <td>{t('traces.projects.total', { count: projects.length })}</td>
          <td />
          <td className={styles.num}>{fmt.hours(totals.active)}</td>
          <td className={styles.num}>{fmt.count(totals.sessions)}</td>
          <td className={styles.num}>{fmt.compact(totals.tokens)}</td>
          <td className={styles.num}>
            {totals.unknownCost
              ? t('traces.projects.total_cost_partial', { cost: fmt.money(totals.cost) })
              : fmt.money(totals.cost)}
          </td>
          <td />
          <td />
          <td />
        </tr>
      </tfoot>
    </Table>
  );
}

// ─── Rename and merge ──────────────────────────────────────────────────────

function ProjectEditModal({
  project,
  projects,
  onClose,
  onSaved,
}: {
  project: TraceProject;
  projects: TraceProject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useTracesEnvironment();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [mode, setMode] = useState<'rename' | 'merge'>('rename');
  const [name, setName] = useState(project.name);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = projects.filter((entry) => entry.id !== project.id);
  const invalid = mode === 'rename' ? !name.trim() || name.trim() === project.name : !target;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'rename') {
        await api.renameProject(project.id, name.trim());
        showNotification(t('traces.projects.renamed', { name: name.trim() }), 'success');
      } else {
        await api.mergeProject(project.id, target);
        const into = others.find((entry) => entry.id === target)?.name ?? target;
        showNotification(t('traces.projects.merged', { from: project.name, into }), 'success');
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, t('traces.common.unknown')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('traces.projects.edit_title', { name: project.name })}
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={invalid}>
            {mode === 'rename' ? t('traces.projects.rename') : t('traces.projects.merge')}
          </Button>
        </>
      }
    >
      <form className={styles.inlineForm} onSubmit={(event) => void submit(event)}>
        <SegmentedControl
          label={t('traces.projects.edit_mode')}
          value={mode}
          options={[
            { value: 'rename', label: t('traces.projects.rename') },
            { value: 'merge', label: t('traces.projects.merge') },
          ]}
          onChange={setMode}
        />
        {mode === 'rename' ? (
          <label className={styles.field}>
            {t('traces.projects.new_name')}
            <input
              className={styles.textInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>
        ) : others.length === 0 ? (
          <span className={styles.muted}>{t('traces.projects.no_merge_targets')}</span>
        ) : (
          <div className={styles.field}>
            <span id="merge-target-label">{t('traces.projects.merge_into')}</span>
            <Select
              value={target}
              options={others.map((entry) => ({ value: entry.id, label: entry.name }))}
              onChange={setTarget}
              placeholder={t('traces.projects.pick_project')}
              ariaLabelledBy="merge-target-label"
            />
          </div>
        )}
        <span className={styles.note}>
          {mode === 'rename' ? t('traces.projects.rename_hint') : t('traces.projects.merge_hint')}
        </span>
        {error ? (
          <span className={styles.fieldError} role="alert">
            {t('traces.projects.save_failed', { message: error })}
          </span>
        ) : null}
      </form>
    </Modal>
  );
}

// ─── Rules ─────────────────────────────────────────────────────────────────

const ruleKey = (rule: TraceProjectRule) => `${rule.match}\u0000${rule.project}`;

function RulesPanel({
  serverRules,
  onSaved,
}: {
  serverRules: TraceProjectRuleWithHits[];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useTraceFormat();
  const { api } = useTracesEnvironment();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const serverSignature = JSON.stringify(serverRules.map(({ match, project }) => ({ match, project })));
  const [draft, setDraft] = useState<TraceProjectRule[]>(() =>
    serverRules.map(({ match, project }) => ({ match, project }))
  );
  const [editingIndex, setEditingIndex] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Take the server's rules again after a reload, unless there are unsaved edits.
  const [syncedSignature, setSyncedSignature] = useState(serverSignature);
  useEffect(() => {
    if (serverSignature === syncedSignature) return;
    setSyncedSignature(serverSignature);
    setDraft(JSON.parse(serverSignature) as TraceProjectRule[]);
    setEditingIndex(null);
  }, [serverSignature, syncedSignature]);

  const dirty = JSON.stringify(draft) !== serverSignature;
  const hitsByKey = new Map(serverRules.map((rule) => [ruleKey(rule), rule.hits]));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.putProjectRules(draft);
      showNotification(t('traces.rules.saved'), 'success');
      onSaved();
    } catch (error) {
      setSaveError(getErrorMessage(error, t('traces.common.unknown')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="rules-title">
      <div className={styles.cardHeader}>
        <h2 id="rules-title" className={styles.cardTitleSmall}>
          {t('traces.rules.title')}
        </h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditingIndex('new')}
          disabled={editingIndex !== null}
        >
          <IconPlus size={14} aria-hidden="true" /> {t('traces.rules.add')}
        </Button>
      </div>
      <span className={styles.cardSub}>
        {t('traces.rules.intro_before')} <code className={styles.code}>traces.projects.rules</code>{' '}
        {t('traces.rules.intro_after')}
      </span>

      <ol className={pageStyles.rules}>
        {draft.map((rule, index) =>
          editingIndex === index ? (
            <li key={`edit-${index}`} className={pageStyles.rule}>
              <span className={pageStyles.badge}>{index + 1}</span>
              <RuleForm
                initial={rule}
                onCancel={() => setEditingIndex(null)}
                onSubmit={(next) => {
                  setDraft((current) => current.map((entry, i) => (i === index ? next : entry)));
                  setEditingIndex(null);
                }}
              />
            </li>
          ) : (
            <li key={`${ruleKey(rule)}-${index}`} className={pageStyles.rule}>
              <span className={pageStyles.badge}>{index + 1}</span>
              <div className={pageStyles.ruleBody}>
                <span className={`${styles.mono} ${pageStyles.ruleMatch}`}>{rule.match}</span>
                <span className={pageStyles.ruleResult}>
                  {t('traces.rules.gives')} <strong>{rule.project}</strong>
                  {hitsByKey.has(ruleKey(rule))
                    ? ` · ${t('traces.rules.hits', {
                        count: hitsByKey.get(ruleKey(rule)) ?? 0,
                        formatted: fmt.count(hitsByKey.get(ruleKey(rule)) ?? 0),
                      })}`
                    : ` · ${t('traces.rules.not_saved')}`}
                </span>
                <div className={pageStyles.ruleActions}>
                  <button
                    type="button"
                    className={pageStyles.iconButton}
                    disabled={index === 0 || editingIndex !== null}
                    onClick={() => setDraft((current) => moveItem(current, index, -1))}
                    aria-label={t('traces.rules.move_up', { n: index + 1 })}
                  >
                    <IconChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className={pageStyles.iconButton}
                    disabled={index === draft.length - 1 || editingIndex !== null}
                    onClick={() => setDraft((current) => moveItem(current, index, 1))}
                    aria-label={t('traces.rules.move_down', { n: index + 1 })}
                  >
                    <IconChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    className={pageStyles.iconButton}
                    disabled={editingIndex !== null}
                    onClick={() => setEditingIndex(index)}
                    aria-label={t('traces.rules.edit', { n: index + 1 })}
                  >
                    <IconPencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={pageStyles.iconButton}
                    disabled={editingIndex !== null}
                    onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}
                    aria-label={t('traces.rules.delete', { n: index + 1 })}
                  >
                    <IconTrash2 size={14} />
                  </button>
                </div>
              </div>
            </li>
          )
        )}
        {editingIndex === 'new' ? (
          <li className={pageStyles.rule}>
            <span className={pageStyles.badge}>{draft.length + 1}</span>
            <RuleForm
              initial={{ match: '', project: '' }}
              onCancel={() => setEditingIndex(null)}
              onSubmit={(next) => {
                setDraft((current) => [...current, next]);
                setEditingIndex(null);
              }}
            />
          </li>
        ) : null}
        <li className={pageStyles.rule}>
          <span className={`${pageStyles.badge} ${pageStyles.badgeFixed}`} aria-hidden="true">
            G
          </span>
          <div className={pageStyles.ruleBody}>
            <span className={pageStyles.ruleMatch}>{t('traces.rules.fixed_git')}</span>
            <span className={pageStyles.ruleResult}>{t('traces.rules.fixed_git_result')}</span>
          </div>
        </li>
        <li className={pageStyles.rule}>
          <span className={`${pageStyles.badge} ${pageStyles.badgeFixed}`} aria-hidden="true">
            F
          </span>
          <div className={pageStyles.ruleBody}>
            <span className={pageStyles.ruleMatch}>{t('traces.rules.fixed_folder')}</span>
            <span className={pageStyles.ruleResult}>{t('traces.rules.fixed_folder_result')}</span>
          </div>
        </li>
      </ol>

      {dirty ? (
        <div className={styles.buttonRow}>
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={editingIndex !== null}>
            {t('traces.rules.save')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              setDraft(JSON.parse(serverSignature) as TraceProjectRule[]);
              setEditingIndex(null);
            }}
          >
            {t('traces.rules.discard')}
          </Button>
        </div>
      ) : null}
      {saveError ? (
        <span className={styles.fieldError} role="alert">
          {t('traces.rules.save_failed', { message: saveError })}
        </span>
      ) : null}
    </section>
  );
}

function RuleForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: TraceProjectRule;
  onSubmit: (rule: TraceProjectRule) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [match, setMatch] = useState(initial.match);
  const [project, setProject] = useState(initial.project);
  const [errors, setErrors] = useState<RuleError[]>([]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const rule = { match: match.trim(), project: project.trim() };
    const found = validateRule(rule);
    setErrors(found);
    if (found.length === 0) onSubmit(rule);
  };

  return (
    <form className={`${styles.inlineForm} ${pageStyles.ruleBody}`} onSubmit={submit}>
      <label className={styles.field}>
        {t('traces.rules.match')}
        <input
          className={`${styles.textInput} ${styles.mono}`}
          value={match}
          placeholder="~/code/{name}"
          onChange={(event) => setMatch(event.target.value)}
          aria-invalid={errors.includes('match_required')}
          autoFocus
        />
      </label>
      <label className={styles.field}>
        {t('traces.rules.project')}
        <input
          className={styles.textInput}
          value={project}
          placeholder="{name}"
          onChange={(event) => setProject(event.target.value)}
          aria-invalid={errors.includes('project_required') || errors.includes('name_without_capture')}
        />
      </label>
      <span className={styles.note}>{t('traces.rules.form_hint')}</span>
      {errors.map((error) => (
        <span key={error} className={styles.fieldError} role="alert">
          {t(`traces.rules.error_${error}`)}
        </span>
      ))}
      <div className={styles.buttonRow}>
        <Button type="submit" size="sm">
          {t('traces.rules.done')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
