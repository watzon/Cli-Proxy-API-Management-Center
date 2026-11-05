/**
 * Project rule editing helpers. A rule maps a folder pattern to a project name;
 * `{name}` captures one path segment and may be used in the project name.
 */

import type { TraceProjectRule } from '@/services/api/traces';

export type RuleError = 'match_required' | 'project_required' | 'name_without_capture';

export function validateRule(rule: TraceProjectRule): RuleError[] {
  const errors: RuleError[] = [];
  if (!rule.match.trim()) errors.push('match_required');
  if (!rule.project.trim()) errors.push('project_required');
  if (rule.project.includes('{name}') && !rule.match.includes('{name}')) {
    errors.push('name_without_capture');
  }
  return errors;
}

/** Returns a copy with the item at `index` moved by `offset` (clamped to the list). */
export function moveItem<T>(items: readonly T[], index: number, offset: number): T[] {
  const target = Math.min(items.length - 1, Math.max(0, index + offset));
  if (index < 0 || index >= items.length || target === index) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
