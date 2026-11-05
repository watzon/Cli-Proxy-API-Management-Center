import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter } from 'axios';
import i18n from '@/i18n';
import { apiClient } from '../src/services/api/client';
import { normalizeHealth } from '../src/services/api/traces';
import { resolveTracesGate, TRACES_ENABLED_CONFIG_KEY } from '../src/features/traces/gate';
import { TracesDisabledState } from '../src/features/traces/TracesShell';
import { createMockTracesApi } from '../src/features/traces/dev/mockTracesApi';

const health = (enabled: boolean) => normalizeHealth({ enabled, capture: 'metadata' });

describe('traces health gate', () => {
  test('loading until the first health arrives', () => {
    expect(resolveTracesGate({ status: 'loading', health: null, error: '' })).toEqual({ kind: 'loading' });
  });

  test('a load error without any health shows the error', () => {
    expect(resolveTracesGate({ status: 'error', health: null, error: 'Network Error' })).toEqual({
      kind: 'error',
      message: 'Network Error',
    });
  });

  test('enabled false shows the disabled state, even while a refresh runs or fails', () => {
    for (const status of ['ready', 'loading', 'error'] as const) {
      expect(resolveTracesGate({ status, health: health(false), error: 'x' }).kind).toBe('disabled');
    }
  });

  test('enabled true shows the page', () => {
    expect(resolveTracesGate({ status: 'ready', health: health(true), error: '' }).kind).toBe('ready');
  });

  test('a malformed health response counts as disabled, never as enabled', () => {
    expect(normalizeHealth(null).enabled).toBe(false);
    expect(normalizeHealth({ enabled: 'true' }).enabled).toBe(false);
  });

  test('the mock API reports disabled and returns empty data, like the backend', async () => {
    const api = createMockTracesApi({ enabled: false });
    expect((await api.getHealth()).enabled).toBe(false);
    expect((await api.getSessions({}, {})).sessions).toEqual([]);
    expect((await api.getLimits({})).accounts).toEqual([]);
  });
});

describe('traces disabled state', () => {
  let original = '';
  beforeAll(async () => {
    original = i18n.language;
    await i18n.changeLanguage('en');
  });
  afterAll(async () => {
    await i18n.changeLanguage(original);
  });

  test('names the config key and links to the config page', () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(TracesDisabledState, { configPath: '/config' }))
    );
    expect(markup).toContain(`${TRACES_ENABLED_CONFIG_KEY}: true`);
    expect(markup).toContain('href="/config"');
    expect(markup).toContain(`>${i18n.t('traces.gate.open_config')}<`);
    expect(markup).toContain(i18n.t('traces.gate.disabled_title'));
  });
});

describe('traces support header', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  afterEach(() => {
    apiClient.setConfig({ apiBase: '', managementKey: '' });
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  test('X-CPA-SUPPORT-TRACES dispatches a support event', async () => {
    const events: Event[] = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: (event: Event) => events.push(event) > 0 },
    });
    apiClient.setConfig({ apiBase: 'http://proxy.invalid', managementKey: 'fixture-only' });
    const adapter: AxiosAdapter = async (config) => ({
      data: {},
      status: 200,
      statusText: 'OK',
      config,
      headers: { 'x-cpa-support-traces': '1' },
    });
    await apiClient.get('/config', { adapter });
    const event = events.find((entry) => entry.type === 'server-traces-support-update');
    expect((event as CustomEvent | undefined)?.detail).toEqual({ supportsTraces: true });
  });

  test('the routes and the nav entry are gated on the header', () => {
    const routes = readFileSync('src/router/MainRoutes.tsx', 'utf8');
    const layout = readFileSync('src/components/layout/MainLayout.tsx', 'utf8');
    const store = readFileSync('src/stores/useAuthStore.ts', 'utf8');
    expect(routes).toMatch(/supportsTraces\s*\?\s*\{ path: '\/traces\/\*', element: <TracesRoutes \/> \}/);
    expect(layout).toContain('...(supportsTraces ? [tracesNavItem] : [])');
    expect(store).toContain("'server-traces-support-update'");
    // The flag resets with every new connection, like plugin support.
    expect(store.match(/supportsTraces: false/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
