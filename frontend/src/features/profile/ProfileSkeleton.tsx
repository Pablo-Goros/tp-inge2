import { Skeleton } from '../../components/ui';

/** Carga con la forma del perfil: portada, avatar, bloques en dos columnas. */
export function ProfileSkeleton() {
  return (
    <main className="pv" aria-busy="true">
      <span className="sr-only" role="status">Cargando perfil…</span>
      <div className="card card-flush pv-hero" aria-hidden="true">
        <div className="pv-cover sk" />
        <div className="pv-hero-body">
          <div className="av av-xl pv-avatar sk" />
          <div className="pv-id"><Skeleton height={34} /><Skeleton height={18} opacity={.8} /><Skeleton height={26} opacity={.6} /></div>
        </div>
      </div>
      <div className="pv-grid" aria-hidden="true">
        <div className="pv-main"><div className="card"><Skeleton height={120} /></div><div className="card"><Skeleton height={200} /></div></div>
        <div className="pv-side"><div className="card"><Skeleton height={140} /></div><div className="card"><Skeleton height={180} /></div></div>
      </div>
    </main>
  );
}
