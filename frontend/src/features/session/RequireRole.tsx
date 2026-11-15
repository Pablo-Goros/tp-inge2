import type { ReactNode } from 'react';
import type { Role } from '../../api';
import { ForbiddenPage } from '../errors/ForbiddenPage';
import { homeFor, useAuth } from './AuthProvider';

const ROLE_COPY: Record<Role, { label: string; only: string; link: string }> = {
  student: { label: 'alumno', only: 'Mis certificados', link: 'Ir a Mis certificados' },
  operator: { label: 'operador', only: 'Lotes', link: 'Ir a Lotes' },
};

/** Sin sesión o rol incorrecto: renderiza 403 en el lugar (no redirige). El backend igual valida el rol. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) {
    return <ForbiddenPage message="Para ver esta página tenés que ingresar con una cuenta autorizada." actionTo="/login" actionLabel="Ir a ingresar" />;
  }
  if (user.role !== role) {
    const c = ROLE_COPY[user.role];
    return (
      <ForbiddenPage
        message={`No tenés permiso para ver esta página. Tu cuenta de ${c.label} solo accede a ${c.only}.`}
        actionTo={homeFor(user.role)}
        actionLabel={c.link}
      />
    );
  }
  return <>{children}</>;
}
