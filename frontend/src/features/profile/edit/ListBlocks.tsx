import type { LanguageLevel, LinkKind, Profile } from '../../../api';
import { formatMonth } from '../../../api/profileUtils';
import { ChipInput, Field, MonthField, RepeatableList, Select, Textarea } from '../../../components/ui';
import { DateRange, EditBlock, errOf, rangeMeta, useIdList, type BlockProps } from './blockKit';
import { countErrors, LANGUAGE_LEVELS, LINK_KINDS, newId, SKILL_LEVELS } from './editModel';

const join = (...p: (string | undefined)[]) => p.filter(Boolean).join(' · ');

/** Props comunes de campo: ancla para el resumen de errores + mensaje. */
function useFx(b: BlockProps) {
  return (key: string) => ({ 'data-field': key, error: errOf(b, key) });
}

export function ExperienceBlock(b: BlockProps) {
  const fx = useFx(b);
  const err = (k: string) => errOf(b, k);
  return (
    <EditBlock id="experience" title="Experiencia" hint="Trabajos, prácticas, pasantías o proyectos que te formaron.">
      <RepeatableList
        noun="experiencia" addLabel="Agregar experiencia" emptyText="Todavía no cargaste experiencias."
        items={b.draft.experience} onChange={(experience) => b.set({ experience })} openSignal={b.signal}
        createItem={() => ({ id: newId(), title: '', org: '', location: '', start: '', end: '', description: '', highlights: [] })}
        summary={(x) => ({ title: x.title, meta: join(x.org, rangeMeta(x.start, x.end)) })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `experience.${x.id}`) : 0)}
        renderFields={(x, up) => {
          const k = `experience.${x.id}`;
          return (
            <>
              <div className="pe-grid2">
                <Field label="Puesto" value={x.title} maxLength={100} onChange={(e) => up({ title: e.target.value })} {...fx(`${k}.title`)} />
                <Field label="Organización" value={x.org} maxLength={100} onChange={(e) => up({ org: e.target.value })} {...fx(`${k}.org`)} />
              </div>
              <Field label="Ubicación (opcional)" value={x.location ?? ''} maxLength={80} onChange={(e) => up({ location: e.target.value })} {...fx(`${k}.location`)} />
              <DateRange keyPrefix={k} start={x.start} end={x.end} requiredStart error={err} onChange={(v) => up(v)} />
              <Textarea label="Descripción" value={x.description} maxLength={1000} rows={3} onChange={(e) => up({ description: e.target.value })} {...fx(`${k}.description`)} />
              <Textarea label="Logros destacados (uno por línea)" value={x.highlights.join('\n')} rows={3} help="Cada línea se muestra como un punto." onChange={(e) => up({ highlights: e.target.value.split('\n') })} />
            </>
          );
        }}
      />
    </EditBlock>
  );
}

export function EducationBlock(b: BlockProps) {
  const fx = useFx(b);
  return (
    <EditBlock id="education" title="Educación" hint="Carreras, cursos y formaciones.">
      <RepeatableList
        noun="formación" addLabel="Agregar formación" emptyText="Todavía no cargaste formación."
        items={b.draft.education} onChange={(education) => b.set({ education })} openSignal={b.signal}
        createItem={() => ({ id: newId(), institution: '', degree: '', field: '', start: '', end: '' })}
        summary={(x) => ({ title: x.institution, meta: join(x.degree, rangeMeta(x.start, x.end)) })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `education.${x.id}`) : 0)}
        renderFields={(x, up) => {
          const k = `education.${x.id}`;
          return (
            <>
              <Field label="Institución" value={x.institution} maxLength={100} onChange={(e) => up({ institution: e.target.value })} {...fx(`${k}.institution`)} />
              <div className="pe-grid2">
                <Field label="Título o nivel" value={x.degree} maxLength={100} onChange={(e) => up({ degree: e.target.value })} {...fx(`${k}.degree`)} />
                <Field label="Área de estudio (opcional)" value={x.field} maxLength={100} onChange={(e) => up({ field: e.target.value })} {...fx(`${k}.field`)} />
              </div>
              <DateRange keyPrefix={k} start={x.start} end={x.end} requiredStart error={(kk) => errOf(b, kk)} onChange={(v) => up(v)} />
              <Textarea label="Descripción (opcional)" value={x.description ?? ''} maxLength={1000} rows={3} onChange={(e) => up({ description: e.target.value })} {...fx(`${k}.description`)} />
            </>
          );
        }}
      />
    </EditBlock>
  );
}

export function SkillsBlock(b: BlockProps) {
  const fx = useFx(b);
  return (
    <EditBlock id="skills" title="Aptitudes" hint="Con 5 o más tu perfil se lee mejor. El nivel va de 1 (básico) a 5 (experto).">
      <RepeatableList
        noun="aptitud" addLabel="Agregar aptitud" emptyText="Todavía no cargaste aptitudes."
        items={b.draft.skills} onChange={(skills) => b.set({ skills })} openSignal={b.signal}
        createItem={() => ({ id: newId(), name: '', level: 3 as const, category: '' })}
        summary={(x) => ({ title: x.name, meta: join(`Nivel ${x.level}`, x.category) })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `skills.${x.id}`) : 0)}
        renderFields={(x, up) => (
          <div className="pe-grid3">
            <Field label="Aptitud" value={x.name} maxLength={40} onChange={(e) => up({ name: e.target.value })} {...fx(`skills.${x.id}.name`)} />
            <Select label="Nivel" value={String(x.level)} onChange={(e) => up({ level: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })}>
              {([1, 2, 3, 4, 5] as const).map((n) => <option key={n} value={n}>{n} de 5 · {SKILL_LEVELS[n]}</option>)}
            </Select>
            <Field label="Categoría (opcional)" value={x.category ?? ''} maxLength={40} onChange={(e) => up({ category: e.target.value })} {...fx(`skills.${x.id}.category`)} />
          </div>
        )}
      />
    </EditBlock>
  );
}

export function LanguagesBlock(b: BlockProps) {
  const fx = useFx(b);
  return (
    <EditBlock id="languages" title="Idiomas">
      <RepeatableList
        noun="idioma" addLabel="Agregar idioma" emptyText="Todavía no cargaste idiomas."
        items={b.draft.languages} onChange={(languages) => b.set({ languages })} openSignal={b.signal}
        createItem={() => ({ id: newId(), name: '', level: 'Intermedio' as LanguageLevel })}
        summary={(x) => ({ title: x.name, meta: x.level })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `languages.${x.id}`) : 0)}
        renderFields={(x, up) => (
          <div className="pe-grid2">
            <Field label="Idioma" value={x.name} maxLength={40} onChange={(e) => up({ name: e.target.value })} {...fx(`languages.${x.id}.name`)} />
            <Select label="Nivel" value={x.level} onChange={(e) => up({ level: e.target.value as LanguageLevel })}>
              {LANGUAGE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
        )}
      />
    </EditBlock>
  );
}

export function ProjectsBlock(b: BlockProps) {
  const fx = useFx(b);
  return (
    <EditBlock id="projects" title="Proyectos" hint="Algo que hayas construido: una app, un trabajo práctico, una investigación.">
      <RepeatableList
        noun="proyecto" addLabel="Agregar proyecto" emptyText="Todavía no cargaste proyectos."
        items={b.draft.projects} onChange={(projects) => b.set({ projects })} openSignal={b.signal}
        createItem={() => ({ id: newId(), title: '', description: '', url: '', tags: [] })}
        summary={(x) => ({ title: x.title, meta: join(x.tags.slice(0, 3).join(', '), rangeMeta(x.start, x.end)) })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `projects.${x.id}`) : 0)}
        renderFields={(x, up) => {
          const k = `projects.${x.id}`;
          return (
            <>
              <Field label="Nombre del proyecto" value={x.title} maxLength={100} onChange={(e) => up({ title: e.target.value })} {...fx(`${k}.title`)} />
              <Textarea label="Descripción" value={x.description} maxLength={600} rows={3} onChange={(e) => up({ description: e.target.value })} {...fx(`${k}.description`)} />
              <Field label="Enlace (opcional)" type="url" inputMode="url" placeholder="https://" value={x.url ?? ''} onChange={(e) => up({ url: e.target.value })} {...fx(`${k}.url`)} />
              <ChipInput label="Tecnologías o temas" values={x.tags} onChange={(tags) => up({ tags })} placeholder="Escribí y apretá Enter" max={10} />
              <DateRange keyPrefix={k} start={x.start} end={x.end} error={(kk) => errOf(b, kk)} onChange={(v) => up(v)} />
            </>
          );
        }}
      />
    </EditBlock>
  );
}

export function AchievementsBlock(b: BlockProps) {
  const fx = useFx(b);
  return (
    <EditBlock id="achievements" title="Logros" hint="Premios, becas, reconocimientos.">
      <RepeatableList
        noun="logro" addLabel="Agregar logro" emptyText="Todavía no cargaste logros."
        items={b.draft.achievements} onChange={(achievements) => b.set({ achievements })} openSignal={b.signal}
        createItem={() => ({ id: newId(), title: '', issuer: '', date: '', description: '' })}
        summary={(x) => ({ title: x.title, meta: join(x.issuer, x.date ? formatMonth(x.date) : '') })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `achievements.${x.id}`) : 0)}
        renderFields={(x, up) => {
          const k = `achievements.${x.id}`;
          return (
            <>
              <Field label="Título" value={x.title} maxLength={100} onChange={(e) => up({ title: e.target.value })} {...fx(`${k}.title`)} />
              <div className="pe-grid2">
                <Field label="Otorgado por (opcional)" value={x.issuer ?? ''} maxLength={100} onChange={(e) => up({ issuer: e.target.value })} {...fx(`${k}.issuer`)} />
                <MonthField label="Fecha" required value={x.date} fieldId={`${k}.date`} error={errOf(b, `${k}.date`)} onChange={(date) => up({ date })} />
              </div>
              <Textarea label="Descripción (opcional)" value={x.description ?? ''} maxLength={600} rows={2} onChange={(e) => up({ description: e.target.value })} {...fx(`${k}.description`)} />
            </>
          );
        }}
      />
    </EditBlock>
  );
}

export function PublicationsBlock(b: BlockProps) {
  const fx = useFx(b);
  return (
    <EditBlock id="publications" title="Publicaciones">
      <RepeatableList
        noun="publicación" addLabel="Agregar publicación" emptyText="Todavía no cargaste publicaciones."
        items={b.draft.publications} onChange={(publications) => b.set({ publications })} openSignal={b.signal}
        createItem={() => ({ id: newId(), title: '', venue: '', date: '', url: '' })}
        summary={(x) => ({ title: x.title, meta: join(x.venue, x.date ? formatMonth(x.date) : '') })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `publications.${x.id}`) : 0)}
        renderFields={(x, up) => {
          const k = `publications.${x.id}`;
          return (
            <>
              <Field label="Título" value={x.title} maxLength={160} onChange={(e) => up({ title: e.target.value })} {...fx(`${k}.title`)} />
              <div className="pe-grid2">
                <Field label="Dónde se publicó" value={x.venue} maxLength={100} onChange={(e) => up({ venue: e.target.value })} {...fx(`${k}.venue`)} />
                <MonthField label="Fecha" required value={x.date} fieldId={`${k}.date`} error={errOf(b, `${k}.date`)} onChange={(date) => up({ date })} />
              </div>
              <Field label="Enlace (opcional)" type="url" inputMode="url" placeholder="https://" value={x.url ?? ''} onChange={(e) => up({ url: e.target.value })} {...fx(`${k}.url`)} />
            </>
          );
        }}
      />
    </EditBlock>
  );
}

export function VolunteeringBlock(b: BlockProps) {
  const fx = useFx(b);
  return (
    <EditBlock id="volunteering" title="Voluntariado">
      <RepeatableList
        noun="voluntariado" addLabel="Agregar voluntariado" emptyText="Todavía no cargaste voluntariados."
        items={b.draft.volunteering} onChange={(volunteering) => b.set({ volunteering })} openSignal={b.signal}
        createItem={() => ({ id: newId(), role: '', org: '', start: '', end: '', description: '' })}
        summary={(x) => ({ title: x.role, meta: join(x.org, rangeMeta(x.start, x.end)) })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `volunteering.${x.id}`) : 0)}
        renderFields={(x, up) => {
          const k = `volunteering.${x.id}`;
          return (
            <>
              <div className="pe-grid2">
                <Field label="Rol" value={x.role} maxLength={100} onChange={(e) => up({ role: e.target.value })} {...fx(`${k}.role`)} />
                <Field label="Organización" value={x.org} maxLength={100} onChange={(e) => up({ org: e.target.value })} {...fx(`${k}.org`)} />
              </div>
              <DateRange keyPrefix={k} start={x.start} end={x.end} requiredStart error={(kk) => errOf(b, kk)} onChange={(v) => up(v)} />
              <Textarea label="Descripción (opcional)" value={x.description} maxLength={1000} rows={3} onChange={(e) => up({ description: e.target.value })} {...fx(`${k}.description`)} />
            </>
          );
        }}
      />
    </EditBlock>
  );
}

export function LinksBlock(b: BlockProps) {
  const fx = useFx(b);
  const list = useIdList<Profile['links'][number]>(b.draft.links, (links) => b.set({ links }));
  return (
    <EditBlock id="links" title="Enlaces" hint="Tu sitio, LinkedIn, GitHub o portfolio. Tienen que empezar con https://">
      <RepeatableList
        noun="enlace" addLabel="Agregar enlace" emptyText="Todavía no cargaste enlaces."
        items={list.items} onChange={list.onChange} openSignal={b.signal}
        createItem={() => ({ id: newId(), label: '', url: '', kind: 'web' as LinkKind })}
        summary={(x) => ({ title: x.label, meta: x.url.replace(/^https?:\/\//, '') })}
        errorCount={(x) => (b.show ? countErrors(b.errors, `links.${list.indexOf(x.id)}`) : 0)}
        renderFields={(x, up) => {
          const i = list.indexOf(x.id);
          return (
            <div className="pe-grid3">
              <Field label="Nombre del enlace" value={x.label} maxLength={40} onChange={(e) => up({ label: e.target.value })} {...fx(`links.${i}.label`)} />
              <Field label="Dirección" type="url" inputMode="url" placeholder="https://" value={x.url} onChange={(e) => up({ url: e.target.value })} {...fx(`links.${i}.url`)} />
              <Select label="Tipo" value={x.kind} onChange={(e) => up({ kind: e.target.value as LinkKind })}>
                {LINK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </div>
          );
        }}
      />
    </EditBlock>
  );
}

export function InterestsBlock({ draft, set }: BlockProps) {
  return (
    <EditBlock id="interests" title="Intereses">
      <ChipInput label="Tus intereses" values={draft.interests} onChange={(interests) => set({ interests })} placeholder="Por ejemplo: ajedrez, robótica" max={20} help="Escribí y apretá Enter para agregar cada uno." />
    </EditBlock>
  );
}
