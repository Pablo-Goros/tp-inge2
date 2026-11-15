import type { OfficeHour, SubjectTaught, TeachingModality } from '../../../api';
import { ChipInput, Field, RepeatableList, Select, Textarea } from '../../../components/ui';
import { EditBlock, errOf, useIdList, type BlockProps } from './blockKit';
import { countErrors, DAYS, LIMITS, MODALITIES, newId } from './editModel';

export function TeachingBlock(b: BlockProps) {
  const p = b.draft;
  const fx = (k: string) => ({ 'data-field': k, error: errOf(b, k) });
  const hours = useIdList<OfficeHour>(p.officeHours ?? [], (officeHours) => b.set({ officeHours }));
  return (
    <EditBlock id="teaching" title="Docencia" hint="Qué enseñás, cómo y cuándo atendés consultas.">
      <ChipInput label="Especialidades" values={p.specialties ?? []} onChange={(specialties) => b.set({ specialties })} placeholder="Algoritmos, Bases de datos…" max={12} />
      <div className="pe-grid2">
        <Field
          label="Años de experiencia docente" type="number" min={0} max={60} inputMode="numeric" value={p.teachingYears === undefined ? '' : String(p.teachingYears)}
          onChange={(e) => b.set({ teachingYears: e.target.value === '' ? undefined : Number(e.target.value) })} {...fx('teaching.years')}
        />
        <Select label="Modalidad" value={p.modality ?? ''} onChange={(e) => b.set({ modality: (e.target.value || undefined) as TeachingModality | undefined })}>
          <option value="">Sin indicar</option>
          {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>

      <div className="pe-sub">
        <h3 className="pe-h3">Materias que dicta</h3>
        <RepeatableList
          noun="materia" addLabel="Agregar materia" emptyText="Todavía no cargaste materias."
          items={p.subjectsTaught ?? []} onChange={(subjectsTaught) => b.set({ subjectsTaught })} openSignal={b.signal}
          createItem={() => ({ id: newId(), name: '', level: '', modality: 'Presencial' as TeachingModality })}
          summary={(x) => ({ title: x.name, meta: [x.level, x.modality].filter(Boolean).join(' · ') })}
          errorCount={(x) => (b.show ? countErrors(b.errors, `teaching.subj.${x.id}`) : 0)}
          renderFields={(x: SubjectTaught, up) => (
            <div className="pe-grid3">
              <Field label="Materia" value={x.name} maxLength={100} onChange={(e) => up({ name: e.target.value })} {...fx(`teaching.subj.${x.id}.name`)} />
              <Field label="Nivel (opcional)" value={x.level ?? ''} maxLength={60} placeholder="Grado, posgrado…" onChange={(e) => up({ level: e.target.value })} {...fx(`teaching.subj.${x.id}.level`)} />
              <Select label="Modalidad" value={x.modality} onChange={(e) => up({ modality: e.target.value as TeachingModality })}>
                {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
          )}
        />
      </div>

      <div className="pe-sub">
        <h3 className="pe-h3">Horarios de consulta</h3>
        <RepeatableList
          noun="horario" addLabel="Agregar horario" emptyText="Todavía no cargaste horarios."
          items={hours.items} onChange={hours.onChange} openSignal={b.signal}
          createItem={() => ({ id: newId(), day: 'Lunes', from: '18:00', to: '19:00' })}
          summary={(x) => ({ title: x.day, meta: `${x.from} a ${x.to}` })}
          errorCount={(x) => (b.show ? countErrors(b.errors, `teaching.hours.${hours.indexOf(x.id)}`) : 0)}
          renderFields={(x, up) => {
            const k = `teaching.hours.${hours.indexOf(x.id)}`;
            return (
              <div className="pe-grid3">
                <Select label="Día" value={x.day} onChange={(e) => up({ day: e.target.value })} error={errOf(b, `${k}.day`)}>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
                <Field label="Desde" type="time" value={x.from} onChange={(e) => up({ from: e.target.value })} {...fx(`${k}.from`)} />
                <Field label="Hasta" type="time" value={x.to} onChange={(e) => up({ to: e.target.value })} {...fx(`${k}.to`)} />
              </div>
            );
          }}
        />
      </div>

      <Textarea label="Enfoque pedagógico" rows={4} maxLength={LIMITS.approach} value={p.teachingApproach ?? ''} onChange={(e) => b.set({ teachingApproach: e.target.value })} {...fx('teaching.approach')} />
    </EditBlock>
  );
}
