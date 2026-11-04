import { normalizeTags } from '@/utils/tags';

/** Client API key -> credential tags, stored at access.key-tags. */
export type ApiKeyTags = Record<string, string[]>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Read access.key-tags, keeping only keys with at least one valid tag. */
export const parseApiKeyTags = (raw: unknown): ApiKeyTags => {
  if (!isRecord(raw)) return {};
  const result: ApiKeyTags = {};
  Object.entries(raw).forEach(([rawKey, rawTags]) => {
    const key = rawKey.trim();
    const tags = normalizeTags(rawTags);
    if (key && tags.length > 0) result[key] = tags;
  });
  return result;
};

/**
 * Restrict tags to the configured client keys, in key order. Tags for removed
 * keys are dropped so a deleted key never leaves a stale restriction behind.
 */
export const pruneApiKeyTags = (tags: ApiKeyTags, keys: readonly string[]): ApiKeyTags => {
  const result: ApiKeyTags = {};
  keys.forEach((key) => {
    const keyTags = normalizeTags(tags[key]);
    if (keyTags.length > 0) result[key] = keyTags;
  });
  return result;
};

/** Order-insensitive comparison of two key-tag maps. */
export const areApiKeyTagsEqual = (left: ApiKeyTags, right: ApiKeyTags): boolean => {
  const serialize = (value: ApiKeyTags) =>
    JSON.stringify(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]])
    );
  return serialize(left) === serialize(right);
};

/** Return a copy with the tags for one key replaced; empty tags remove the key. */
export const setApiKeyTags = (tags: ApiKeyTags, key: string, next: string[]): ApiKeyTags => {
  const result = { ...tags };
  delete result[key];
  const normalized = normalizeTags(next);
  if (normalized.length > 0) result[key] = normalized;
  return result;
};
