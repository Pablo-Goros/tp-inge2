import { useCallback, useEffect, useState } from 'react';
import type { CertificateItem } from '../../../api';
import { Alert, Button, SkeletonList } from '../../../components/ui';
import { formatDay } from '../profileHelpers';
import { useApi } from '../../session/AuthProvider';
import { EditBlock, type BlockProps } from './blockKit';

type Load = { s: 'loading' } | { s: 'ok'; items: CertificateItem[] } | { s: 'error' };

/** Certificados del sistema de quien edita: tildar para destacar y ordenar los destacados. */
export function CertificatesBlock({ draft, set }: Pick<BlockProps, 'draft' | 'set'>) {
  const api = useApi();
  const student = draft.role === 'student';
  const [load, setLoad] = useState<Load>({ s: 'loading' });
  const [note, setNote] = useState('');

  const run = useCallback(() => {
    setLoad({ s: 'loading' });
    api.listMyCertificates().then((items) => setLoad({ s: 'ok', items }), () => setLoad({ s: 'error' }));
  }, [api]);
  useEffect(() => { if (student) run(); }, [student, run]);

  const featured = draft.certificatesFeatured;
  const toggle = (id: string, on: boolean) => set({ certificatesFeatured: on ? [...featured, id] : featured.filter((x) => x !== id) });
  function move(id: string, d: -1 | 1, title: string) {
    const i = featured.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= featured.length) return;
    const next = [...featured];
    [next[i], next[j]] = [next[j], next[i]];
    set({ certificatesFeatured: next });
    setNote(`${title} pasó al lugar ${j + 1} de ${featured.length}.`);
  }

  return (
    <EditBlock id="certificates" title="Certificados destacados" hint="Los que destaques se muestran en tu perfil público, con un enlace para que cualquiera los verifique.">
      {!student && <p className="rl-empty">Los certificados se emiten a alumnos. Como tutor no tenés certificados propios para destacar.</p>}
      {student && load.s === 'loading' && <SkeletonList label="Cargando tus certificados…" rows={2} height={48} />}
      {student && load.s === 'error' && <Alert tone="error" action={<Button small variant="secondary" onClick={run}>Reintentar</Button>}>No pudimos cargar tus certificados.</Alert>}
      {student && load.s === 'ok' && (load.items.length === 0 ? <p className="rl-empty">Todavía no tenés certificados emitidos.</p> : (() => {
        const byId = new Map(load.items.map((c) => [c.certificate_id, c]));
        const ordered = [...featured.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])), ...load.items.filter((c) => !featured.includes(c.certificate_id))];
        return (
          <ul className="cf-list">
            {ordered.map((c) => {
              const on = featured.includes(c.certificate_id);
              const rank = featured.indexOf(c.certificate_id);
              return (
                <li key={c.certificate_id} className={on ? 'cf-item cf-on' : 'cf-item'}>
                  <label className="chk">
                    <input type="checkbox" checked={on} onChange={(e) => toggle(c.certificate_id, e.target.checked)} />
                    <span><b>{c.course_name}</b><span className="help"> · {formatDay(c.completion_date)}</span></span>
                  </label>
                  {on && (
                    <span className="rl-acts">
                      <span className="help">Lugar {rank + 1}</span>
                      <button type="button" className="rl-btn" disabled={rank === 0} aria-label={`Subir ${c.course_name}`} onClick={() => move(c.certificate_id, -1, c.course_name)}>↑<span className="rl-lbl"> Subir</span></button>
                      <button type="button" className="rl-btn" disabled={rank === featured.length - 1} aria-label={`Bajar ${c.course_name}`} onClick={() => move(c.certificate_id, 1, c.course_name)}>↓<span className="rl-lbl"> Bajar</span></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        );
      })())}
      <span className="sr-only" role="status" aria-live="polite">{note}</span>
    </EditBlock>
  );
}
