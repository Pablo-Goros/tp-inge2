import { Textarea } from '../../../components/ui';
import { EditBlock, errOf, type BlockProps } from './blockKit';
import { LIMITS } from './editModel';

export function AboutBlock(b: BlockProps) {
  return (
    <EditBlock id="about" title="Acerca de" hint="Contá quién sos, qué te mueve y qué buscás. Con 80 caracteres o más cuenta como completo.">
      <Textarea label="Resumen" rows={7} maxLength={LIMITS.about} value={b.draft.about} onChange={(e) => b.set({ about: e.target.value })} data-field="about.about" error={errOf(b, 'about.about')} />
    </EditBlock>
  );
}

export function GoalsBlock(b: BlockProps) {
  return (
    <EditBlock id="goals" title="Objetivos y búsqueda" hint="Qué querés lograr y qué estás buscando.">
      <Textarea label="Objetivos de estudio y carrera" rows={3} maxLength={LIMITS.goals} value={b.draft.studyGoals ?? ''} onChange={(e) => b.set({ studyGoals: e.target.value })} data-field="goals.studyGoals" error={errOf(b, 'goals.studyGoals')} />
      <Textarea label="Qué estoy buscando" rows={3} maxLength={LIMITS.goals} value={b.draft.lookingFor ?? ''} onChange={(e) => b.set({ lookingFor: e.target.value })} data-field="goals.lookingFor" error={errOf(b, 'goals.lookingFor')} />
    </EditBlock>
  );
}
