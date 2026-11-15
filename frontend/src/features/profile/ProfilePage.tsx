import { ErrorState } from '../../components/ui';
import { useApi, useAuth } from '../session/AuthProvider';
import { ProfileSkeleton } from './ProfileSkeleton';
import { ProfileView } from './ProfileView';
import { useLoadProfile, useProfileTitle } from './useLoadProfile';

/** Mi perfil (con sesión): el mismo layout que el público, con controles de edición y completitud. */
export function ProfilePage() {
  const api = useApi();
  const { user } = useAuth();
  const { state, retrying, retry } = useLoadProfile(() => api.getMyProfile(), user?.name ?? '');
  useProfileTitle(state.s === 'ok' ? state.profile.displayName : 'Mi perfil');
  if (state.s === 'loading') return <ProfileSkeleton />;
  if (state.s === 'ok') return <ProfileView profile={state.profile} mode="own" />;
  return (
    <main className="pv">
      <h1 className="disp page-title">Mi perfil</h1>
      <ErrorState message={state.s === 'notfound' ? 'Todavía no tenés perfil.' : state.message} retrying={retrying} onRetry={retry} />
    </main>
  );
}
