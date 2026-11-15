import { Link } from 'react-router-dom';
import type { Profile, ProfileSummary } from '../../api';
import { profileCompleteness, ROLE_LABEL } from '../../api/profileUtils';
import { Avatar, CopyButton, EmptyState, LinkButton, ProgressRing } from '../../components/ui';
import { editHash, profileUrl } from '../profile/profileHelpers';
import { useApi } from '../session/AuthProvider';
import { HomeCard } from './HomeCard';
import { useAsync, type Async } from './useAsync';

export interface ProfileLoad { state: Async<Profile>; retrying: boolean; retry: () => void }

export function CompletenessCard({ load, span }: { load: ProfileLoad; span?: string }) {
  return (
    <HomeCard title="Completitud del perfil" span={span} state={load.state} retrying={load.retrying} onRetry={load.retry} skeleton={[88, 20, 20]} errorMessage="No pudimos cargar tu perfil.">
      {(p) => {
        const { percent, missing } = profileCompleteness(p);
        return (
          <div className="hm-complete">
            <ProgressRing percent={percent} size={96} />
            <div className="hm-complete-body">
              {missing.length === 0 ? (
                <p><b>Tu perfil está completo.</b> Se lee muy bien: mantenelo al día.</p>
              ) : (
                <>
                  <p className="hm-lead">Te faltan estos pasos para llegar al 100%.</p>
                  <ul className="hm-steps">
                    {missing.slice(0, 3).map((m) => <li key={m.key}><Link className="lnk-draw" to={`/profile/edit#${editHash(m.key)}`}>{m.label}</Link></li>)}
                  </ul>
                </>
              )}
            </div>
          </div>
        );
      }}
    </HomeCard>
  );
}

export function PublicProfileCard({ load, span }: { load: ProfileLoad; span?: string }) {
  return (
    <HomeCard title="Tu perfil público" span={span} state={load.state} retrying={load.retrying} onRetry={load.retry} skeleton={[48, 36]} errorMessage="No pudimos cargar tu perfil.">
      {(p) => (
        <div className="hm-public">
          <div className="hm-person">
            <Avatar src={p.avatarUrl} name={p.displayName} alt={`Foto de ${p.displayName}`} size="md" />
            <div className="hm-person-text">
              <b>{p.displayName}</b>
              <Link className="lnk-draw hm-slug" to={`/p/${p.slug}`}>/p/{p.slug}</Link>
            </div>
          </div>
          <p className="help">Cualquiera con el enlace puede ver tu perfil.</p>
          <CopyButton text={profileUrl(p)} okMessage="Enlace copiado" aria-label="Copiar enlace de tu perfil público">Copiar enlace</CopyButton>
        </div>
      )}
    </HomeCard>
  );
}

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function PersonCard({ p, common }: { p: ProfileSummary; common: string[] }) {
  return (
    <li>
      <Link to={`/p/${p.slug}`} className="hm-person-card card-link">
        <Avatar src={p.avatarUrl} name={p.displayName} alt="" size="md" />
        <span className="hm-person-card-text">
          <b>{p.displayName}</b>
          <span className="hm-clamp">{p.headline}</span>
          {common.length > 0
            ? <span className="help">En común: {common.join(', ')}</span>
            : <span className="help">{ROLE_LABEL[p.role]}{p.institution ? ` · ${p.institution}` : ''}</span>}
        </span>
      </Link>
    </li>
  );
}

/** Personas del directorio. `kind: 'peers'` = personas para conocer (alumno, con habilidades en común); `'students'` = alumnos destacados (tutor). */
export function PeopleCard({ kind, own, span }: { kind: 'peers' | 'students'; own: ProfileLoad; span?: string }) {
  const api = useApi();
  const dir = useAsync(() => api.searchProfiles(kind === 'students' ? { role: 'student' } : {}), kind);
  const ownSkills = own.state.s === 'ok' ? own.state.data.skills.map((s) => norm(s.name)) : [];
  const ownSlug = own.state.s === 'ok' ? own.state.data.slug : undefined;
  // Mientras no sepamos quién sos (y cuáles son tus habilidades) no mostramos la lista, para no reordenarla después.
  const state: Async<ProfileSummary[]> = dir.state.s === 'ok' && own.state.s === 'loading' ? { s: 'loading' } : dir.state;
  const title = kind === 'students' ? 'Alumnos destacados' : 'Personas para conocer';
  return (
    <HomeCard title={title} span={span} state={state} retrying={dir.retrying} onRetry={dir.retry} skeleton={[64, 64]} errorMessage="No pudimos cargar el directorio."
      action={{ to: '/directory', label: 'Ver el directorio' }}>
      {(all) => {
        const list = all.filter((p) => p.slug !== ownSlug);
        const scored = list.map((p) => ({ p, common: p.topSkills.filter((s) => ownSkills.includes(norm(s))) }));
        if (kind === 'peers') scored.sort((a, b) => b.common.length - a.common.length);
        const top = scored.slice(0, 4);
        if (top.length === 0) return <EmptyState icon="·" title="Todavía no hay a quién mostrar" description="Cuando se sumen más perfiles, los vas a ver acá." action={<LinkButton to="/directory" variant="secondary">Explorar el directorio</LinkButton>} />;
        return <ul className="hm-people">{top.map(({ p, common }) => <PersonCard key={p.slug} p={p} common={kind === 'peers' ? common : []} />)}</ul>;
      }}
    </HomeCard>
  );
}

