/**
 * Price override editing for the Settings page. Drafts keep the typed text so a
 * half-typed value is not lost; it becomes numbers only on save.
 */

import type { TracePriceOverride, TracePriceRow } from '@/services/api/traces';
import { parsePriceInput } from './limits';

export const PRICE_FIELDS = [
  'input',
  'output',
  'cache_read',
  'cache_write_5m',
  'cache_write_1h',
] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

export type PriceDraft = { model: string } & Record<PriceField, string>;

export type PriceDraftError =
  | { kind: 'model_required'; index: number }
  | { kind: 'model_duplicate'; index: number }
  | { kind: 'price_invalid'; index: number; field: PriceField };

const priceText = (value: number | null): string => (value === null ? '' : String(value));

export function draftFromRow(row: Pick<TracePriceRow, 'model' | PriceField>): PriceDraft {
  return {
    model: row.model,
    input: priceText(row.input),
    output: priceText(row.output),
    cache_read: priceText(row.cache_read),
    cache_write_5m: priceText(row.cache_write_5m),
    cache_write_1h: priceText(row.cache_write_1h),
  };
}

export const emptyDraft = (): PriceDraft => draftFromRow({
  model: '',
  input: null,
  output: null,
  cache_read: null,
  cache_write_5m: null,
  cache_write_1h: null,
});

/** Validates drafts and converts them to overrides. Returns errors instead when any. */
export function overridesFromDrafts(
  drafts: PriceDraft[]
): { ok: true; overrides: TracePriceOverride[] } | { ok: false; errors: PriceDraftError[] } {
  const errors: PriceDraftError[] = [];
  const seen = new Set<string>();
  const overrides: TracePriceOverride[] = [];

  drafts.forEach((draft, index) => {
    const model = draft.model.trim();
    if (!model) errors.push({ kind: 'model_required', index });
    else if (seen.has(model)) errors.push({ kind: 'model_duplicate', index });
    seen.add(model);

    const prices: Partial<Record<PriceField, number | null>> = {};
    for (const field of PRICE_FIELDS) {
      const parsed = parsePriceInput(draft[field]);
      if (!parsed.ok) errors.push({ kind: 'price_invalid', index, field });
      else prices[field] = parsed.value;
    }
    overrides.push({
      model,
      input: prices.input ?? null,
      output: prices.output ?? null,
      cache_read: prices.cache_read ?? null,
      cache_write_5m: prices.cache_write_5m ?? null,
      cache_write_1h: prices.cache_write_1h ?? null,
    });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, overrides };
}
