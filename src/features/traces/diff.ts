/**
 * Unified diff lines for tool-call blocks: an old/new pair is diffed line by line
 * (longest common subsequence), and a patch text is parsed as is.
 */

import type { TraceBlockDiff } from '@/services/api/traces';

export type DiffLineKind = 'context' | 'add' | 'remove' | 'hunk' | 'header' | 'skip';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** For `skip` lines: how many unchanged lines were left out. */
  skipped?: number;
}

export interface DiffView {
  file: string;
  lines: DiffLine[];
  added: number;
  removed: number;
}

/** Above this many cell comparisons the diff falls back to "all removed, all added". */
const MAX_LCS_CELLS = 4_000_000;

const splitLines = (text: string): string[] => {
  if (text === '') return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/** Line diff of two texts. Unchanged lines are kept as context. */
export function diffTexts(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  // Trim the common prefix and suffix first; edits are usually small.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  const head: DiffLine[] = a.slice(0, prefix).map((text) => ({ kind: 'context', text }));
  const tail: DiffLine[] = a.slice(a.length - suffix).map((text) => ({ kind: 'context', text }));

  if (midA.length * midB.length > MAX_LCS_CELLS) {
    return [
      ...head,
      ...midA.map((text): DiffLine => ({ kind: 'remove', text })),
      ...midB.map((text): DiffLine => ({ kind: 'add', text })),
      ...tail,
    ];
  }

  // lengths[i][j] = LCS length of midA[i:] and midB[j:]
  const rows = midA.length + 1;
  const cols = midB.length + 1;
  const lengths = new Uint32Array(rows * cols);
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      lengths[i * cols + j] =
        midA[i] === midB[j]
          ? lengths[(i + 1) * cols + j + 1] + 1
          : Math.max(lengths[(i + 1) * cols + j], lengths[i * cols + j + 1]);
    }
  }

  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      middle.push({ kind: 'context', text: midA[i] });
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * cols + j] >= lengths[i * cols + j + 1]) {
      middle.push({ kind: 'remove', text: midA[i] });
      i += 1;
    } else {
      middle.push({ kind: 'add', text: midB[j] });
      j += 1;
    }
  }
  while (i < midA.length) middle.push({ kind: 'remove', text: midA[i++] });
  while (j < midB.length) middle.push({ kind: 'add', text: midB[j++] });

  return [...head, ...middle, ...tail];
}

/** Parses a unified or `apply_patch` style patch into typed lines. */
export function parsePatch(patch: string): DiffLine[] {
  return splitLines(patch).map((text): DiffLine => {
    if (text.startsWith('@@')) return { kind: 'hunk', text };
    if (
      text.startsWith('+++') ||
      text.startsWith('---') ||
      text.startsWith('***') ||
      text.startsWith('diff ') ||
      text.startsWith('index ')
    ) {
      return { kind: 'header', text };
    }
    if (text.startsWith('+')) return { kind: 'add', text: text.slice(1) };
    if (text.startsWith('-')) return { kind: 'remove', text: text.slice(1) };
    return { kind: 'context', text: text.startsWith(' ') ? text.slice(1) : text };
  });
}

/**
 * Keeps changed lines plus `context` lines around them; long unchanged stretches are
 * replaced by one `skip` line so a one-line edit in a large file stays readable.
 */
export function collapseContext(lines: DiffLine[], context = 3): DiffLine[] {
  const changed = lines.map((line) => line.kind === 'add' || line.kind === 'remove');
  if (!changed.some(Boolean)) return lines;
  const keep = lines.map((line, index) => {
    if (line.kind !== 'context') return true;
    for (let offset = -context; offset <= context; offset += 1) {
      if (changed[index + offset]) return true;
    }
    return false;
  });
  const result: DiffLine[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped > 0) result.push({ kind: 'skip', text: '', skipped });
      skipped = 0;
      result.push(line);
    } else {
      skipped += 1;
    }
  });
  if (skipped > 0) result.push({ kind: 'skip', text: '', skipped });
  return result;
}

export function buildDiffView(diff: TraceBlockDiff): DiffView {
  const lines =
    'patch' in diff ? parsePatch(diff.patch) : collapseContext(diffTexts(diff.old, diff.new));
  return {
    file: diff.file,
    lines,
    added: lines.filter((line) => line.kind === 'add').length,
    removed: lines.filter((line) => line.kind === 'remove').length,
  };
}
