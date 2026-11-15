import { Chip } from '../../components/ui';
import { PSection, type ViewCtx } from './ProfileSection';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function TeachingSection({ ctx }: { ctx: ViewCtx }) {
  const p = ctx.profile;
  const subjects = p.subjectsTaught ?? [];
  const spec = p.specialties ?? [];
  const hours = p.officeHours ?? [];
  const empty = !spec.length && !subjects.length && !hours.length && !p.teachingApproach?.trim() && !p.teachingYears;
  const days = DAYS.filter((d) => hours.some((h) => h.day === d));
  const extra = [...new Set(hours.map((h) => h.day))].filter((d) => !DAYS.includes(d));
  return (
    <PSection ctx={ctx} k="teaching" title="Docencia" empty={empty} emptyHint="Contá qué enseñás, cómo y cuándo atendés consultas.">
      <div className="pv-teach">
        <div className="pv-stats">
          {!!p.teachingYears && <div className="pv-stat"><b className="disp">{p.teachingYears}</b><span className="help">{p.teachingYears === 1 ? 'año de experiencia' : 'años de experiencia'}</span></div>}
          {p.modality && <div className="pv-stat"><b className="disp">{p.modality}</b><span className="help">Modalidad</span></div>}
        </div>
        {!!spec.length && (
          <div>
            <h3 className="lbl pv-sub">Especialidades</h3>
            <ul className="pv-chips">{spec.map((s) => <li key={s}><Chip tone="brand">{s}</Chip></li>)}</ul>
          </div>
        )}
        {!!subjects.length && (
          <div>
            <h3 className="lbl pv-sub">Materias que dicta</h3>
            <ul className="pv-list">
              {subjects.map((s) => (
                <li key={s.id} className="pv-subj">
                  <span><b>{s.name}</b>{s.level && <span className="help"> · {s.level}</span>}</span>
                  <Chip tone="neutral">{s.modality}</Chip>
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.teachingApproach && (
          <div>
            <h3 className="lbl pv-sub">Enfoque pedagógico</h3>
            <p>{p.teachingApproach}</p>
          </div>
        )}
        {!!hours.length && (
          <div>
            <h3 className="lbl pv-sub">Horarios de consulta</h3>
            <ul className="pv-week">
              {[...days, ...extra].map((d) => (
                <li key={d} className="pv-day">
                  <b>{d}</b>
                  {hours.filter((h) => h.day === d).map((h, i) => <span key={i} className="mono">{h.from} a {h.to}</span>)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PSection>
  );
}
