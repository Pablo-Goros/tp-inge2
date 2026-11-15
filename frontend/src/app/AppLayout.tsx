import { Outlet, useNavigate } from 'react-router-dom';
import { LinkButton, Topbar, type NavItem } from '../components/ui';
import { homeFor, useAuth } from '../features/session/AuthProvider';

const NAV: Record<'operator' | 'student', NavItem[]> = {
  operator: [{ to: '/operator/batches', label: 'Lotes' }, { to: '/operator/batches/new', label: 'Nuevo lote' }],
  student: [{ to: '/student/certificates', label: 'Mis certificados' }],
};
const ROLE_LABEL = { operator: 'Operador', student: 'Alumno' };

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <Topbar
        nav={user ? NAV[user.role] : undefined}
        user={user ? { name: user.name, roleLabel: ROLE_LABEL[user.role] } : undefined}
        homeTo={user ? homeFor(user.role) : '/'}
        onLogout={() => { logout(); navigate('/login', { replace: true }); }}
        right={user ? undefined : <LinkButton to="/login" variant="ghost">Ingresar</LinkButton>}
      />
      <Outlet />
    </>
  );
}
