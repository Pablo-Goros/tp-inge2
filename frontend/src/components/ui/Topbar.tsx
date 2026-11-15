import { Link, NavLink } from 'react-router-dom';
import { Button } from './Button';

export interface NavItem { to: string; label: string }

interface Props {
  nav?: NavItem[];
  user?: { name: string; roleLabel: string };
  onLogout?: () => void;
  /** Destino de la marca. */
  homeTo?: string;
  /** Slot derecho para pantallas sin sesión (p. ej. enlace "Ingresar"). */
  right?: React.ReactNode;
}

export function Topbar({ nav, user, onLogout, homeTo = '/', right }: Props) {
  const bare = !nav?.length;
  return (
    <header className={bare ? 'top top-bare' : 'top'}>
      <Link to={homeTo} className="disp grad top-brand" aria-label="Certificados verificables, inicio">CERT·VERIF</Link>
      {!bare && (
        <nav className="top-nav" aria-label="Principal">
          {nav!.map((n) => (
            <NavLink key={n.to} to={n.to} end className="nav">{n.label}</NavLink>
          ))}
        </nav>
      )}
      <span className="top-sp" />
      {right}
      {user && (
        <div className="top-user">
          <span>{user.name}</span>
          <span className="bdg mut">{user.roleLabel}</span>
          <Button variant="ghost" onClick={onLogout}>Cerrar sesión</Button>
        </div>
      )}
    </header>
  );
}
