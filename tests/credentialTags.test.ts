import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  buildAuthFileFieldsPatch,
  type PrefixProxyEditorState,
} from '../src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { normalizeAuthFilesResponse } from '../src/services/api/authFiles';
import {
  areApiKeyTagsEqual,
  parseApiKeyTags,
  pruneApiKeyTags,
  setApiKeyTags,
} from '../src/features/config/apiKeyTags';
import { formatTagsText, normalizeTags, parseTagsText } from '../src/utils/tags';
import { runVisualConfig } from './helpers/visualConfig';

const makeEditor = (
  json: Record<string, unknown>,
  tagsText: string,
  tagsTouched = true
): PrefixProxyEditorState => ({
  fileName: 'credential.json',
  fileInfoText: '',
  loading: false,
  saving: false,
  error: null,
  originalText: JSON.stringify(json),
  rawText: JSON.stringify(json),
  invalidContentPreview: '',
  json,
  providerKey: 'claude',
  prefix: '',
  proxyUrl: '',
  priority: '',
  weight: '',
  weightError: null,
  disableCooling: false,
  disableCoolingTouched: false,
  websockets: false,
  websocketsTouched: false,
  useSiwc: false,
  useSiwcTouched: false,
  usingApi: false,
  usingApiTouched: false,
  note: '',
  noteTouched: false,
  tagsText,
  tagsTouched,
  excludedModelsText: '',
  excludedModelsTouched: false,
  headersText: '',
  headersTouched: false,
  headersError: null,
});

const resolveError = (key: string) => key;

describe('tag normalization', () => {
  test('matches the backend: trimmed, lowercase, de-duplicated', () => {
    expect(normalizeTags([' Work ', 'personal', 'WORK', '', 3])).toEqual(['work', 'personal']);
    expect(normalizeTags('work, clients ,')).toEqual(['work', 'clients']);
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(42)).toEqual([]);
    expect(parseTagsText('work\npersonal')).toEqual(['work', 'personal']);
    expect(formatTagsText(['work', 'personal'])).toBe('work, personal');
  });
});

describe('credential tags editor', () => {
  test('sends normalized tags when the field changes', () => {
    const editor = makeEditor({ type: 'claude' }, 'Work, personal, work');
    expect(buildAuthFileFieldsPatch(editor, resolveError)).toEqual({
      tags: ['work', 'personal'],
    });
  });

  test('clears tags with null when the field is emptied', () => {
    const editor = makeEditor({ type: 'claude', tags: ['work'] }, ' , ');
    expect(buildAuthFileFieldsPatch(editor, resolveError)).toEqual({ tags: null });
  });

  test('sends nothing when tags only differ in formatting or were not touched', () => {
    expect(
      buildAuthFileFieldsPatch(
        makeEditor({ tags: ['work', 'personal'] }, 'WORK,personal'),
        resolveError
      )
    ).toEqual({});
    expect(
      buildAuthFileFieldsPatch(makeEditor({ tags: ['work'] }, '', false), resolveError)
    ).toEqual({});
  });

  test('the details sheet offers a tags input wired to the editor', () => {
    const source = readFileSync(
      new URL('../src/features/authFiles/components/AuthFileDetailsSheet.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toContain("label={t('auth_files.tags_label')}");
    expect(source).toContain("onChange('tagsText', e.target.value)");
  });
});

describe('credential list tags', () => {
  test('normalizes backend tags and drops invalid values', () => {
    const result = normalizeAuthFilesResponse(
      {
        files: [
          { name: 'a.json', tags: ['Work', 'work', 'personal'] },
          { name: 'b.json', tags: 'nope' as unknown as string[] },
          { name: 'c.json', tags: [] },
          { name: 'd.json' },
        ],
      },
      Date.now()
    );
    expect(result.files.map((file) => file.tags)).toEqual([
      ['work', 'personal'],
      ['nope'],
      undefined,
      undefined,
    ]);
  });
});

describe('client key tags', () => {
  test('helpers keep tags only for configured keys', () => {
    const tags = parseApiKeyTags({ ' key-a ': ['Work'], 'key-b': [], 'key-c': 'personal' });
    expect(tags).toEqual({ 'key-a': ['work'], 'key-c': ['personal'] });
    expect(pruneApiKeyTags(tags, ['key-c'])).toEqual({ 'key-c': ['personal'] });
    expect(setApiKeyTags(tags, 'key-a', [])).toEqual({ 'key-c': ['personal'] });
    expect(areApiKeyTagsEqual({ a: ['x'], b: ['y'] }, { b: ['y'], a: ['x'] })).toBe(true);
    expect(parseApiKeyTags(['not', 'a', 'map'])).toEqual({});
  });

  const yaml = [
    'config-version: 8',
    'access:',
    '  api-keys:',
    '    - key-work',
    '    - key-personal',
    '  key-tags:',
    '    key-work: [work]',
    '    key-personal: [personal]',
    '',
  ].join('\n');

  test('loads access.key-tags into the visual config', () => {
    expect(runVisualConfig(yaml).visualValues.apiKeyTags).toEqual({
      'key-work': ['work'],
      'key-personal': ['personal'],
    });
  });

  test('writes tag changes and prunes tags of removed keys', () => {
    const config = runVisualConfig(yaml, [
      {
        apiKeysText: 'key-personal',
        apiKeyTags: { 'key-work': ['work'], 'key-personal': ['clients'] },
      },
    ]);
    const output = parseYaml(config.applyVisualChangesToYaml(yaml));
    expect(output.access['api-keys']).toEqual(['key-personal']);
    expect(output.access['key-tags']).toEqual({ 'key-personal': ['clients'] });
  });

  test('removes access.key-tags when no key has tags', () => {
    const config = runVisualConfig(yaml, [{ apiKeyTags: {} }]);
    const output = parseYaml(config.applyVisualChangesToYaml(yaml));
    expect(output.access['key-tags']).toBeUndefined();
    expect(output.access['api-keys']).toEqual(['key-work', 'key-personal']);
  });

  test('does not mark tags dirty when only the key order differs', () => {
    const config = runVisualConfig(yaml, [
      { apiKeyTags: { 'key-personal': ['personal'], 'key-work': ['work'] } },
    ]);
    expect(parseYaml(config.applyVisualChangesToYaml(yaml))).toEqual(parseYaml(yaml));
    expect(config.visualDirtyFields.has('apiKeyTags')).toBe(false);
  });
});

describe('tag strings', () => {
  test('every locale defines the credential and client key tag strings', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr']) {
      const messages = JSON.parse(
        readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
      );
      for (const key of ['tags_label', 'tags_placeholder', 'tags_hint']) {
        expect(messages.auth_files[key]).toBeTruthy();
        expect(messages.config_management.visual.api_keys[key]).toBeTruthy();
      }
    }
  });
});
