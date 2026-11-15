import type { ReactNode } from 'react';
import type { Profile } from '../../api';
import './profile-view.css';
import { MainSections } from './ProfileMain';
import { ProfileHeader } from './ProfileHeader';
import { Completeness, SideSections } from './ProfileSide';
import type { ViewCtx } from './ProfileSection';

interface Props {
  profile: Profile;
  /** 'own' = Mi perfil (controles de edición, completitud, ocultas atenuadas); 'public' = lo que ve cualquiera. */
  mode: 'own' | 'public';
  /** Aviso arriba para el dueño que mira su perfil público. */
  banner?: ReactNode;
}

/** Perfil completo. Mi perfil y el perfil público comparten este layout. */
export function ProfileView({ profile, mode, banner }: Props) {
  const ctx: ViewCtx = { profile, own: mode === 'own' };
  return (
    <main className="pv">
      {banner}
      <ProfileHeader ctx={ctx} />
      <div className="pv-grid">
        <div className="pv-main"><MainSections ctx={ctx} /></div>
        <div className="pv-side">
          {ctx.own && <Completeness ctx={ctx} />}
          <SideSections ctx={ctx} />
        </div>
      </div>
    </main>
  );
}
