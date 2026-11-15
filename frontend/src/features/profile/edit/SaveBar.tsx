import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui';

interface Props {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  slug: string;
  onSave: () => void;
  onDiscard: () => void;
  /** Hay una navegación bloqueada esperando respuesta. */
  leaving: boolean;
  onLeave: () => void;
  onStay: () => void;
}

function ago(at: number, now: number): string {
  const m = Math.floor((now - at) / 60000);
  return m < 1 ? 'Guardado hace un momento' : m === 1 ? 'Guardado hace 1 minuto' : `Guardado hace ${m} minutos`;
}

/** Barra fija inferior: estado (aria-live), Guardar, Descartar y enlace al perfil público. */
export function SaveBar({ dirty, saving, savedAt, error, slug, onSave, onDiscard, leaving, onLeave, onStay }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 20000); return () => window.clearInterval(t); }, []);
  useEffect(() => { if (!dirty) setConfirm(false); }, [dirty]);

  const status = saving ? 'Guardando…' : error ? '' : dirty ? 'Cambios sin guardar' : savedAt ? ago(savedAt, now) : 'Sin cambios';
  const tone = saving ? 'mut' : error ? 'bad' : dirty ? 'warn' : savedAt ? 'ok' : 'mut';
  const icon = saving ? '' : error ? '✕' : dirty ? '●' : savedAt ? '✓' : '';

  return (
    <div className="pe-bar" role="region" aria-label="Guardar cambios">
      <div className="pe-bar-in">
        {leaving ? (
          <div className="pe-bar-msg" role="alertdialog" aria-label="Salir sin guardar">
            <span><b>Tenés cambios sin guardar.</b> Si salís ahora, quedan como borrador en este navegador.</span>
            <span className="row">
              <Button variant="secondary" small autoFocus onClick={onStay}>Seguir editando</Button>
              <Button small onClick={onLeave}>Salir sin guardar</Button>
            </span>
          </div>
        ) : (
          <>
            <div className="pe-bar-status" role="status" aria-live="polite">
              {saving && <span className="spin" aria-hidden="true" />}
              {status && <span className={`bdg ${tone}`}>{icon && <span aria-hidden="true">{icon}</span>}{status}</span>}
              {error && (
                <span className="pe-bar-err">
                  <span className="bdg bad"><span aria-hidden="true">✕</span>No se pudo guardar</span>
                  <span className="err">{error} Tus cambios siguen acá.</span>
                  <Button small variant="secondary" onClick={onSave}>Reintentar</Button>
                </span>
              )}
            </div>
            <div className="pe-bar-acts">
              <a className="lnk-draw pe-pub" href={`/p/${slug}`} target="_blank" rel="noopener noreferrer">Ver mi perfil público<span className="sr-only"> (se abre en otra pestaña)</span></a>
              {confirm ? (
                <span className="rl-confirm" role="group" aria-label="Confirmar descartar">
                  <span>¿Descartar los cambios?</span>
                  <button type="button" className="rl-btn rl-danger" onClick={() => { setConfirm(false); onDiscard(); }}>Sí</button>
                  <button type="button" className="rl-btn" autoFocus onClick={() => setConfirm(false)}>No</button>
                </span>
              ) : (
                <Button variant="ghost" disabled={!dirty || saving} onClick={() => setConfirm(true)}>Descartar</Button>
              )}
              <Button disabled={!dirty} loading={saving} loadingLabel="Guardando…" onClick={onSave}>Guardar cambios</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
