import { Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { NotFoundPage } from '../features/errors/NotFoundPage';
import { RouteErrorPage } from '../features/errors/UnexpectedErrorPage';
import { BatchDetailPage } from '../features/operator/BatchDetailPage';
import { BatchListPage } from '../features/operator/BatchListPage';
import { NewBatchPage } from '../features/operator/NewBatchPage';
import { HomePage } from '../features/home/HomePage';
import { DirectoryPage } from '../features/profile/DirectoryPage';
import { ProfileEditPage } from '../features/profile/ProfileEditPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { ProfileSettingsPage } from '../features/profile/ProfileSettingsPage';
import { PublicProfilePage } from '../features/profile/PublicProfilePage';
import { CertificateDetailPage } from '../features/student/CertificateDetailPage';
import { MyCertificatesPage } from '../features/student/MyCertificatesPage';
import { AuthProvider, homeFor, useAuth } from '../features/session/AuthProvider';
import { LoginPage } from '../features/session/LoginPage';
import { RequireRole } from '../features/session/RequireRole';
import { VerifyPage } from '../features/verify/VerifyPage';
import { AppLayout } from './AppLayout';
import type { ApiClient } from '../api';

function AuthShell({ client }: { client?: ApiClient }) {
  return <AuthProvider client={client}><Outlet /></AuthProvider>;
}

function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

/** Todas las rutas. Las pantallas de etapas 3-6 se reemplazan en sus archivos, sin tocar esto. */
export const buildRoutes = (client?: ApiClient): RouteObject[] => [
  {
    element: <AuthShell client={client} />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { path: '/', element: <RootRedirect /> },
          { path: '/login', element: <LoginPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: '/verify', element: <VerifyPage /> }, // TODO(equipo): el contrato verifica por cert_id; /verify sin id solo lo usa el enlace del login
              { path: '/verify/:certId', element: <VerifyPage /> },
              { path: '/p/:slug', element: <PublicProfilePage /> }, // pública
              { path: '/directory', element: <DirectoryPage /> }, // pública
              {
                element: <RequireRole role="any"><Outlet /></RequireRole>,
                children: [
                  { path: '/home', element: <HomePage /> },
                  { path: '/profile', element: <ProfilePage /> },
                  { path: '/profile/edit', element: <ProfileEditPage /> },
                  { path: '/profile/settings', element: <ProfileSettingsPage /> },
                ],
              },
              {
                element: <RequireRole role="operator"><Outlet /></RequireRole>,
                children: [
                  { path: '/operator/batches', element: <BatchListPage /> },
                  { path: '/operator/batches/new', element: <NewBatchPage /> },
                  { path: '/operator/batches/:id', element: <BatchDetailPage /> },
                ],
              },
              {
                element: <RequireRole role="student"><Outlet /></RequireRole>,
                children: [
                  { path: '/student/certificates', element: <MyCertificatesPage /> },
                  { path: '/student/certificates/:id', element: <CertificateDetailPage /> },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const routes = buildRoutes();
