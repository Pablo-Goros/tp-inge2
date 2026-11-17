import { useEffect } from 'react';
import { LinkButton } from '../../components/ui';
import { PROFILES_ENABLED } from '../../config/features';
import { useApi, useAuth } from '../session/AuthProvider';
import { PeopleCard, CompletenessCard, PublicProfileCard, type ProfileLoad } from './ProfileCards';
import { RecentCertificatesCard, StudentShortcutsCard } from './StudentCards';
import { BatchesCard, StatsCard } from './TutorCards';
import { useAsync } from './useAsync';
import './home.css';

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

/** Inicio (con sesión): saludo y tarjetas según el rol. Cada tarjeta carga y falla por separado. */
export function HomePage() {
  const { user } = useAuth();
  const api = useApi();
  // Sin endpoints de perfiles en el backend real no se pide nada (daría 404).
  const profile: ProfileLoad = useAsync(() => (PROFILES_ENABLED ? api.getMyProfile() : new Promise<never>(() => {})), user?.name);
  const isTutor = user?.role === 'operator';
  const batches = useAsync(() => (isTutor ? api.listBatches() : Promise.resolve([])), isTutor);
  useEffect(() => { const prev = document.title; document.title = 'Inicio'; return () => { document.title = prev; }; }, []);

  return (
    <main className="page hm">
      <header className="hm-hero">
        <div className="hm-hero-text">
          <h1 className="disp hm-hello">Hola, {firstName(user?.name ?? '')}</h1>
          <p className="hm-sub">{isTutor ? PROFILES_ENABLED ? 'Esto es lo que pasa con tus lotes y tu perfil.' : 'Esto es lo que pasa con tus lotes.' : PROFILES_ENABLED ? 'Tu perfil, tus certificados y personas para conocer, en un solo lugar.' : 'Tus certificados, listos para descargar y compartir.'}</p>
        </div>
        {isTutor && <LinkButton to="/operator/batches/new" className="hm-hero-cta">+ Nuevo lote</LinkButton>}
      </header>
      <div className="hm-grid">
        {isTutor ? (
          PROFILES_ENABLED ? (
            <>
              <BatchesCard load={batches} span="hm-c8" />
              <CompletenessCard load={profile} span="hm-c4" />
              <StatsCard load={batches} span="hm-c8" />
              <PublicProfileCard load={profile} span="hm-c4" />
              <PeopleCard kind="students" own={profile} span="hm-c12" />
            </>
          ) : (
            <>
              <BatchesCard load={batches} span="hm-c8" />
              <StatsCard load={batches} span="hm-c4" />
            </>
          )
        ) : PROFILES_ENABLED ? (
          <>
            <CompletenessCard load={profile} span="hm-c5" />
            <RecentCertificatesCard span="hm-c7" />
            <PublicProfileCard load={profile} span="hm-c6" />
            <StudentShortcutsCard span="hm-c6" />
            <PeopleCard kind="peers" own={profile} span="hm-c12" />
          </>
        ) : (
          <>
            <RecentCertificatesCard span="hm-c7" />
            <StudentShortcutsCard span="hm-c5" />
          </>
        )}
      </div>
    </main>
  );
}
