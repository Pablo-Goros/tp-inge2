import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Chip, Cover, LinkButton } from '../../components/ui';
import { ROLE_LABEL } from '../../api/profileUtils';
import { CopyIcon, MailIcon } from './profileIcons';
import { profileUrl } from './profileHelpers';
import type { ViewCtx } from './ProfileSection';

function CopyLink({ slug }: { slug: string }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(profileUrl({ slug })); ok = true; } catch { /* sin permiso o sin API */ }
    setMsg(ok ? 'Enlace copiado' : 'No se pudo copiar. Copialo desde la barra de direcciones.');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), 3000);
  }
  return (
    <>
      <Button variant="secondary" onClick={() => void copy()}><CopyIcon /> Copiar enlace del perfil</Button>
      <span className="pv-copied" role="status" aria-live="polite">{msg}</span>
    </>
  );
}

export function ProfileHeader({ ctx }: { ctx: ViewCtx }) {
  const p = ctx.profile;
  return (
    <header className="card card-flush pv-hero">
      <Cover style={p.coverStyle} className="pv-cover" />
      <div className="pv-hero-body">
        <Avatar src={p.avatarUrl} name={p.displayName} alt={`Foto de ${p.displayName}`} size="xl" ring className="pv-avatar" />
        <div className="pv-id">
          <h1 className="disp pv-name">{p.displayName}</h1>
          {p.headline && <p className="pv-headline">{p.headline}</p>}
          <ul className="pv-chips" aria-label="Datos del perfil">
            <li><Chip className="pv-role">{ROLE_LABEL[p.role]}</Chip></li>
            {p.institution && <li><Chip>{p.institution}</Chip></li>}
            {p.location && <li><Chip>{p.location}</Chip></li>}
            {p.pronouns && <li><Chip>{p.pronouns}</Chip></li>}
          </ul>
          {!!p.openTo?.length && (
            <div className="pv-open">
              <span className="lbl">Abierto a</span>
              <ul className="pv-chips" aria-label="Abierto a">{p.openTo.map((o) => <li key={o}><Chip tone="brand">{o}</Chip></li>)}</ul>
            </div>
          )}
          {p.availability && <p className="help pv-avail">{p.availability}</p>}
        </div>
        <div className="pv-actions">
          {ctx.own ? (
            <>
              <LinkButton to="/profile/edit">Editar perfil</LinkButton>
              <LinkButton to={`/p/${p.slug}`} variant="secondary">Ver como público</LinkButton>
            </>
          ) : p.contactEmail ? (
            <a className="btn btn-p" href={`mailto:${p.contactEmail}`}><MailIcon /> Contactar</a>
          ) : null}
          <CopyLink slug={p.slug} />
        </div>
      </div>
    </header>
  );
}
