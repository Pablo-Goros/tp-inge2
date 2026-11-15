import { useState } from 'react';
import type { Profile } from '../../../api';
import { profileCompleteness } from '../../../api/profileUtils';
import { ProgressRing } from '../../../components/ui';
import { countErrors, sectionDone, sectionsFor, type Errors } from './editModel';

interface Props { draft: Profile; errors: Errors; show: boolean; onGo: (id: string) => void }

/** Navegación lateral (escritorio) o selector "Ir a sección" (móvil) con estado por sección y barra de completitud. */
export function EditNav({ draft, errors, show, onGo }: Props) {
  const sections = sectionsFor(draft.role);
  const { percent, missing } = profileCompleteness(draft);
  const [active, setActive] = useState('basics');

  const state = (id: string) => (show && countErrors(errors, id) ? 'err' : sectionDone(id, draft) ? 'ok' : 'todo');
  const mark = { ok: ['✓', 'completa'], todo: ['•', 'incompleta'], err: ['!', 'con errores'] } as const;

  return (
    <>
      <nav className="pe-nav" aria-label="Secciones del perfil">
        <div className="pe-comp">
          <ProgressRing percent={percent} size={72} />
          <div>
            <b>Completitud</b>
            <p className="help">{missing.length ? `Te faltan ${missing.length} ${missing.length === 1 ? 'paso' : 'pasos'}.` : 'Perfil completo.'}</p>
          </div>
        </div>
        <ul className="pe-nav-list">
          {sections.map((s) => {
            const [icon, word] = mark[state(s.id)];
            return (
              <li key={s.id}>
                <a href={`#${s.id}`} className={`pe-nav-link${active === s.id ? ' pe-nav-on' : ''}`} aria-current={active === s.id ? 'location' : undefined}
                  onClick={(e) => { e.preventDefault(); setActive(s.id); onGo(s.id); }}>
                  <span className={`pe-mark pe-mark-${state(s.id)}`} aria-hidden="true">{icon}</span>
                  <span>{s.label}<span className="sr-only"> ({word})</span></span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="pe-jump">
        <div className="pe-comp pe-comp-sm">
          <ProgressRing percent={percent} size={52} />
          <span className="help">{percent}% completo</span>
        </div>
        <div className="fld">
          <label htmlFor="pe-jump-sel">Ir a sección</label>
          <select id="pe-jump-sel" className="inp inp-sel" value="" onChange={(e) => { if (e.target.value) onGo(e.target.value); }}>
            <option value="">Elegí una sección…</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{mark[state(s.id)][0]} {s.label}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}
