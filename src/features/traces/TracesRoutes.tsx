import { Navigate, useRoutes } from 'react-router-dom';
import { useTracesEnvironment } from './context';
import { AccountsPage } from './pages/AccountsPage';
import { ErrorsPage } from './pages/ErrorsPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TracePage } from './pages/TracePage';
import { TracesShell } from './TracesShell';

function BackToOverview() {
  const { basePath } = useTracesEnvironment();
  return <Navigate to={basePath} replace />;
}

/** Nested routes under the Traces base path (`/traces/*`). */
export function TracesRoutes() {
  return useRoutes([
    {
      element: <TracesShell />,
      children: [
        { index: true, element: <OverviewPage /> },
        { path: 'projects', element: <ProjectsPage /> },
        { path: 'sessions', element: <SessionsPage /> },
        { path: 'sessions/:id', element: <TracePage /> },
        { path: 'errors', element: <ErrorsPage /> },
        { path: 'accounts', element: <AccountsPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <BackToOverview /> },
      ],
    },
  ]);
}
