import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, LinkButton } from '../../components/ui';
import { StatusScreen } from '../errors/StatusScreen';
import { useApi, useAuth } from '../session/AuthProvider';
import { ProfileSkeleton } from './ProfileSkeleton';
import { ProfileView } from './ProfileView';
import { useLoadProfile, useProfileTitle } from './useLoadProfile';

/** Perfil público (/p/:slug), sin sesión obligatoria. Si quien mira es el dueño, avisa con un enlace a editar. */
export function PublicProfilePage() {
  const { slug = '' } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const { state, retrying, retry } = useLoadProfile(() => api.getPublicProfile(slug), slug);
  const [isOwner, setIsOwner] = useState(false);
  useProfileTitle(state.s === 'ok' ? state.profile.displayName : undefined);

  useEffect(() => {
    setIsOwner(false);
    if (!user) return;
    let alive = true;
    Promise.resolve().then(() => api.getMyProfile()).then((m) => { if (alive) setIsOwner(m.slug === slug); }).catch(() => {});
    return () => { alive = false; };
  }, [api, user, slug]);

  if (state.s === 'loading') return <ProfileSkeleton />;
  if (state.s === 'notfound') {
    return (
      <StatusScreen code="404" title="Perfil no encontrado" message="Ese perfil no existe o la dirección cambió.">
        <LinkButton to="/directory">Ir al directorio</LinkButton>
      </StatusScreen>
    );
  }
  if (state.s === 'error') {
    return (
      <main className="pv">
        <h1 className="disp page-title">Perfil</h1>
        <ErrorState message={state.message} retrying={retrying} onRetry={retry} />
      </main>
    );
  }
  const banner = isOwner ? (
    <p className="pv-owner help">Este es tu perfil público, tal como lo ve cualquiera. <Link to="/profile/edit" className="lnk-draw">Editar</Link></p>
  ) : null;
  return <ProfileView profile={state.profile} mode="public" banner={banner} />;
}
