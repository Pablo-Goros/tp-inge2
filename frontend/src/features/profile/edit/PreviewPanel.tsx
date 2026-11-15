import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import type { Profile } from '../../../api';
import { toPublic } from '../../../api/mock/profileStore';
import { Button } from '../../../components/ui';
import { ProfileView } from '../ProfileView';
import { toPatch } from './editModel';

/** Perfil tal como lo ve cualquiera: sin secciones ocultas ni email vacío, con los cambios sin guardar. */
export function PreviewBody({ draft }: { draft: Profile }) {
  const deferred = useDeferredValue(draft);
  const pub = useMemo(() => toPublic({ ...deferred, ...toPatch(deferred), role: deferred.role, hiddenSections: deferred.hiddenSections } as Profile), [deferred]);
  return <ProfileView profile={pub} mode="public" embedded />;
}

/** Panel fijo a la derecha (escritorio ancho). */
export function PreviewDock({ draft, onClose }: { draft: Profile; onClose: () => void }) {
  return (
    <aside className="pe-prev" aria-label="Vista previa del perfil público">
      <div className="pe-prev-head">
        <div><b>Vista previa</b><p className="help">Así te ve cualquiera, con los cambios sin guardar.</p></div>
        <Button small variant="ghost" onClick={onClose}>Cerrar</Button>
      </div>
      <div className="pe-prev-body"><PreviewBody draft={draft} /></div>
    </aside>
  );
}

/** Pantalla completa (tablet y móvil). Se cierra con Esc o con el botón. */
export function PreviewOverlay({ draft, onClose }: { draft: Profile; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="pe-overlay" role="dialog" aria-modal="true" aria-label="Vista previa del perfil público">
      <div className="pe-overlay-bar">
        <span><b>Vista previa</b> <span className="help">con los cambios sin guardar</span></span>
        <button ref={closeRef} type="button" className="btn btn-p btn-sm" onClick={onClose}>Cerrar <span className="sr-only">vista previa (Esc)</span></button>
      </div>
      <div className="pe-overlay-body"><PreviewBody draft={draft} /></div>
    </div>
  );
}
