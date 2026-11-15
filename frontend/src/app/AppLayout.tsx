import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LinkButton, Topbar, type NavItem } from '../components/ui';
import { homeFor, useAuth } from '../features/session/AuthProvider';

const NAV: Record<'operator' | 'student', NavItem[]> = {
  operator: [
    { to: '/home', label: 'Inicio' }, { to: '/operator/batches', label: 'Lotes' }, { to: '/operator/batches/new', label: 'Nuevo lote' },
    { to: '/profile', label: 'Mi perfil' }, { to: '/directory', label: 'Directorio' },
  ],
  student: [
    { to: '/home', label: 'Inicio' }, { to: '/student/certificates', label: 'Mis certificados' },
    { to: '/profile', label: 'Mi perfil' }, { to: '/directory', label: 'Directorio' },
  ],
};
const ROLE_LABEL = { operator: 'Operador', student: 'Alumno' };
/** Rutas públicas que con sesión muestran la topbar de sesión y sin sesión la pública con "Ingresar". */
const PUBLIC_PREFIXES = ['/verify', '/p/', '/directory'];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const onPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));
  return (
    <>
      <Topbar
        nav={user ? NAV[user.role] : undefined}
        user={user ? { name: user.name, roleLabel: ROLE_LABEL[user.role] } : undefined}
        homeTo={user ? homeFor(user.role) : '/'}
        onLogout={() => { logout(); navigate('/login', { replace: true }); }}
        right={user || !onPublic ? undefined : <LinkButton to="/login" variant="ghost">Ingresar</LinkButton>}
      />
      <Outlet />
    </>
  );
}
