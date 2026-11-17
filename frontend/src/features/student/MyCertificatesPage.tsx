import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CertificateItem } from '../../api';
import { EmptyState, ErrorState, SkeletonList } from '../../components/ui';
import { PROFILES_ENABLED } from '../../config/features';
import { useApi } from '../session/AuthProvider';
import { CertificateCard } from './CertificateCard';
import './student.css';

type Load = { s: 'loading' } | { s: 'ok'; items: CertificateItem[] } | { s: 'error' };

export function MyCertificatesPage() {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ s: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const fetchList = useCallback(async () => {
    try {
      const items = await api.listMyCertificates();
      // Más recientes primero
      const sorted = [...items].sort((a, b) => b.issued_at.localeCompare(a.issued_at));
      if (alive.current) setLoad({ s: 'ok', items: sorted });
    } catch {
      if (alive.current) setLoad({ s: 'error' });
    } finally {
      if (alive.current) setRetrying(false);
    }
  }, [api]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  return (
    <div className="page">
      <div className="vf-head">
        <h1 className="disp page-title">Mis certificados</h1>
        <p className="help">Certificados emitidos a tu cuenta. Cada PDF incluye un QR para verificarlo.</p>
        {PROFILES_ENABLED && <p className="help">Elegí cuáles <Link className="lnk-draw" to="/profile/edit#certificates">destacar en tu perfil</Link>.</p>}
      </div>
      {load.s === 'loading' && <SkeletonList label="Cargando certificados…" rows={2} height={110} />}
      {load.s === 'error' && (
        <ErrorState
          message="No se pudieron cargar tus certificados. Intentá de nuevo."
          retrying={retrying}
          onRetry={() => { setRetrying(true); void fetchList(); }}
        />
      )}
      {load.s === 'ok' && load.items.length === 0 && (
        <EmptyState title="Todavía no tenés certificados emitidos" description="Cuando tu institución emita uno, va a aparecer acá." />
      )}
      {load.s === 'ok' && load.items.length > 0 && (
        <div className="cert-grid" role="list" aria-label="Certificados">
          {load.items.map((c) => <CertificateCard key={c.certificate_id} cert={c} />)}
        </div>
      )}
    </div>
  );
}
