/**
 * Credential tags group accounts into pools (for example "work" and "personal").
 * The backend normalizes tags the same way: trimmed, lowercase, de-duplicated.
 */

const splitTagsText = (text: string): string[] => text.split(/[,\n]/);

/** Normalize a raw tags value: a string list or a comma-separated string. */
export const normalizeTags = (raw: unknown): string[] => {
  let values: unknown[];
  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === 'string') {
    values = splitTagsText(raw);
  } else {
    return [];
  }

  const tags: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    if (typeof value !== 'string') return;
    const tag = value.trim().toLowerCase();
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    tags.push(tag);
  });
  return tags;
};

/** Parse user input such as "work, personal" into normalized tags. */
export const parseTagsText = (text: string): string[] => normalizeTags(text);

/** Format tags for a comma-separated text input. */
export const formatTagsText = (tags: readonly string[]): string => tags.join(', ');

export const areTagListsEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((tag, index) => tag === right[index]);
