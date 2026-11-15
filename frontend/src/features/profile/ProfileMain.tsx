import { useId, useState } from 'react';
import { Chip, Timeline, TimelineItem } from '../../components/ui';
import { formatMonth, formatRange } from '../../api/profileUtils';
import { ExternalIcon, TrophyIcon } from './profileIcons';
import { prettyUrl } from './profileHelpers';
import { PSection, type ViewCtx } from './ProfileSection';
import { TeachingSection } from './TeachingSection';

const LONG = 380;

function About({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = text.length > LONG;
  return (
    <div className="pv-about">
      <div id={id} className={long && !open ? 'pv-text pv-clamp' : 'pv-text'}>
        {text.split(/\n+/).map((para, i) => <p key={i}>{para}</p>)}
      </div>
      {long && <button type="button" className="pv-more lnk-draw" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? 'Ver menos' : 'Ver más'}</button>}
    </div>
  );
}

const ExtLabel = () => <span className="sr-only"> (se abre en otra pestaña)</span>;

export function MainSections({ ctx }: { ctx: ViewCtx }) {
  const p = ctx.profile;
  const tutor = p.role === 'operator';
  return (
    <>
      <PSection ctx={ctx} k="about" title="Acerca de" empty={!p.about.trim()} emptyHint="Contá quién sos y qué buscás en pocas líneas.">
        <About text={p.about} />
      </PSection>

      {tutor && <TeachingSection ctx={ctx} />}

      {!tutor && (
        <PSection ctx={ctx} k="goals" title="Objetivos y búsqueda" empty={!p.studyGoals?.trim() && !p.lookingFor?.trim()} emptyHint="Contá qué querés lograr y qué estás buscando.">
          <dl className="pv-goals">
            {p.studyGoals && <div><dt className="lbl">Objetivos</dt><dd>{p.studyGoals}</dd></div>}
            {p.lookingFor && <div><dt className="lbl">Busca</dt><dd>{p.lookingFor}</dd></div>}
          </dl>
        </PSection>
      )}

      <PSection ctx={ctx} k="experience" title="Experiencia" empty={!p.experience.length} emptyHint="Sumá tus experiencias, aunque sean proyectos o prácticas.">
        <Timeline label="Experiencia">
          {p.experience.map((e) => (
            <TimelineItem key={e.id} title={e.title} subtitle={[e.org, e.location].filter(Boolean).join(' · ')} meta={formatRange(e.start, e.end)} current={e.end === null}>
              {e.description && <p>{e.description}</p>}
              {!!e.highlights.length && <ul className="pv-bul">{e.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
            </TimelineItem>
          ))}
        </Timeline>
      </PSection>

      <PSection ctx={ctx} k="education" title="Educación" empty={!p.education.length} emptyHint="Agregá tu formación.">
        <Timeline label="Educación">
          {p.education.map((e) => (
            <TimelineItem key={e.id} title={e.institution} subtitle={[e.degree, e.field].filter(Boolean).join(' · ')} meta={formatRange(e.start, e.end)} current={e.end === null}>
              {e.description && <p>{e.description}</p>}
            </TimelineItem>
          ))}
        </Timeline>
      </PSection>

      <PSection ctx={ctx} k="projects" title="Proyectos" empty={!p.projects.length} emptyHint="Mostrá algo que hayas construido.">
        <ul className="pv-projects">
          {p.projects.map((pr) => {
            const body = (
              <>
                <h3 className="pv-proj-title">{pr.title}{pr.url && <ExternalIcon />}</h3>
                {pr.start && <p className="help">{formatRange(pr.start, pr.end ?? null)}</p>}
                <p>{pr.description}</p>
                {!!pr.tags.length && <span className="pv-chips">{pr.tags.map((t) => <Chip key={t}>{t}</Chip>)}</span>}
                {pr.url && <span className="help pv-url">{prettyUrl(pr.url)}<ExtLabel /></span>}
              </>
            );
            return (
              <li key={pr.id}>
                {pr.url
                  ? <a className="pv-proj card-link" href={pr.url} target="_blank" rel="noopener noreferrer">{body}</a>
                  : <div className="pv-proj">{body}</div>}
              </li>
            );
          })}
        </ul>
      </PSection>

      <PSection ctx={ctx} k="achievements" title="Logros y premios" empty={!p.achievements.length} emptyHint="Sumá premios, becas o reconocimientos.">
        <ul className="pv-list">
          {p.achievements.map((a) => (
            <li key={a.id} className="pv-ach">
              <span className="pv-gold"><TrophyIcon /></span>
              <div>
                <h3 className="tl-title">{a.title}</h3>
                <p className="help">{[a.issuer, formatMonth(a.date)].filter(Boolean).join(' · ')}</p>
                {a.description && <p>{a.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      </PSection>

      <PSection ctx={ctx} k="publications" title="Publicaciones" empty={!p.publications.length} emptyHint="Si publicaste algo, sumalo.">
        <ul className="pv-list">
          {p.publications.map((b) => (
            <li key={b.id}>
              <h3 className="tl-title">{b.url ? <a className="lnk-draw" href={b.url} target="_blank" rel="noopener noreferrer">{b.title}<ExtLabel /></a> : b.title}</h3>
              <p className="help">{b.venue} · {formatMonth(b.date)}</p>
            </li>
          ))}
        </ul>
      </PSection>

      <PSection ctx={ctx} k="volunteering" title="Voluntariado" empty={!p.volunteering.length} emptyHint="Contá si participás en comunidades o causas.">
        <Timeline label="Voluntariado">
          {p.volunteering.map((v) => (
            <TimelineItem key={v.id} title={v.role} subtitle={v.org} meta={formatRange(v.start, v.end)} current={v.end === null}>
              {v.description && <p>{v.description}</p>}
            </TimelineItem>
          ))}
        </Timeline>
      </PSection>
    </>
  );
}
