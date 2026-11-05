/**
 * DEV-ONLY preview of the Traces pages with the mock API.
 *
 * Registered in App.tsx only when `import.meta.env.DEV` is true, outside the auth
 * guard, so the pages can be checked without a backend:
 *   http://localhost:5173/#/__preview/traces
 * Add `?off` to the hash path to see the "traces are off" state. Copy in the preview
 * bar is not localized; this page never ships.
 */

import { useMemo } from 'react';
import { NavLink, useLocation, useRoutes, type Location } from 'react-router-dom';
import { PageTransition } from '@/components/common/PageTransition';
import { useThemeStore } from '@/stores';
import type { Theme } from '@/types';
import { TracesEnvironmentContext, type TracesEnvironment } from '../context';
import { TracesRoutes } from '../TracesRoutes';
import { createMockTracesApi } from './mockTracesApi';

const BASE = '/__preview/traces';

// The real app renders pages through PageTransition, which gives each page its
// own copy of the location. Do the same here so the preview shows the same
// URL behavior as the real app.
function LayerRoutes({ location, off }: { location: Location; off: boolean }) {
  return useRoutes([{ path: '*', element: <TracesRoutes key={off ? 'off' : 'on'} /> }], location);
}
const THEMES: Theme[] = ['light', 'white', 'dark'];

export function TracesPreview() {
  const location = useLocation();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const off = new URLSearchParams(location.search).has('off');
  const environment = useMemo<TracesEnvironment>(
    () => ({
      api: createMockTracesApi({ enabled: !off, now: new Date(), latencyMs: 250 }),
      basePath: BASE,
      configPath: BASE,
    }),
    [off]
  );

  const links = [
    ['Overview', BASE],
    ['Projects', `${BASE}/projects`],
    ['Sessions', `${BASE}/sessions`],
    ['Errors', `${BASE}/errors`],
    ['Accounts', `${BASE}/accounts`],
    ['Settings', `${BASE}/settings`],
    ['Traces off', `${BASE}?off`],
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-color)',
          fontSize: 13,
        }}
      >
        <strong>Traces preview (mock data)</strong>
        {links.map(([label, to]) => (
          <NavLink key={label} to={to} end style={{ color: 'inherit' }}>
            {label}
          </NavLink>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {THEMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {value}
            </button>
          ))}
        </span>
      </nav>
      <main style={{ padding: '28px 32px 48px', maxWidth: 1440 }}>
        <TracesEnvironmentContext.Provider value={environment}>
          <PageTransition render={(layerLocation) => <LayerRoutes location={layerLocation} off={off} />} />
        </TracesEnvironmentContext.Provider>
      </main>
    </div>
  );
}
