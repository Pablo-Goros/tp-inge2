import type { ApiClient, CoverStyle } from '../../../api';
import { COVER_STYLES } from '../../../api/profileUtils';
import { ChipInput, Cover, Field, RadioCardGroup } from '../../../components/ui';
import { AvatarUploader } from './AvatarUploader';
import { EditBlock, errOf, type BlockProps } from './blockKit';
import { LIMITS } from './editModel';
import { SlugField } from './SlugField';
import type { SlugStatus } from './useSlugCheck';

interface Props extends BlockProps {
  api: ApiClient;
  slugStatus: SlugStatus;
  /** Error de slug que vino del servidor (409). */
  slugServerError?: string;
  onAvatar: (url: string) => void;
}

export function BasicsBlock({ api, draft, set, errors, show, signal, slugStatus, slugServerError, onAvatar }: Props) {
  const b = { draft, set, errors, show, signal };
  const fx = (k: string) => ({ 'data-field': k, error: errOf(b, k) });
  const slugErr = slugServerError ?? errOf(b, 'basics.slug');
  return (
    <EditBlock id="basics" title="Básicos" hint="Lo primero que ve la gente. Tu perfil es público: cualquiera con el enlace puede verlo.">
      <AvatarUploader api={api} name={draft.displayName} avatarUrl={draft.avatarUrl} onChange={onAvatar} />
      <div className="pe-grid2">
        <Field label="Nombre a mostrar" value={draft.displayName} maxLength={LIMITS.displayName} autoComplete="name" onChange={(e) => set({ displayName: e.target.value })} {...fx('basics.displayName')} />
        <Field label="Pronombres (opcional)" value={draft.pronouns ?? ''} maxLength={30} placeholder="ella / él / elle" onChange={(e) => set({ pronouns: e.target.value })} {...fx('basics.pronouns')} />
      </div>
      <Field
        label="Titular" value={draft.headline} maxLength={LIMITS.headline} onChange={(e) => set({ headline: e.target.value })}
        help={`${draft.headline.length} de ${LIMITS.headline} caracteres. Una frase que te presente, por ejemplo: "Estudiante de Ingeniería Informática, apasionada por los datos".`}
        {...fx('basics.headline')}
      />
      <div className="pe-grid2">
        <Field label="Ubicación" value={draft.location} maxLength={80} placeholder="Ciudad, País" onChange={(e) => set({ location: e.target.value })} {...fx('basics.location')} />
        <Field label="Disponibilidad (opcional)" value={draft.availability ?? ''} maxLength={120} placeholder="Disponible desde marzo" onChange={(e) => set({ availability: e.target.value })} {...fx('basics.availability')} />
      </div>
      <RadioCardGroup<CoverStyle>
        legend="Portada" value={draft.coverStyle} onChange={(coverStyle) => set({ coverStyle })}
        options={COVER_STYLES.map((c) => ({ value: c.id, label: c.label, preview: <Cover style={c.id} className="rc-cover" /> }))}
      />
      <SlugField value={draft.slug} onChange={(slug) => set({ slug })} status={slugStatus} error={slugErr} />
      <ChipInput label="Abierto a" values={draft.openTo ?? []} onChange={(openTo) => set({ openTo })} placeholder="Pasantías, proyectos, mentorías…" max={8} help="Se muestran como etiquetas en tu perfil." />
      <Field
        label="Email de contacto público (opcional)" type="email" inputMode="email" autoComplete="off" value={draft.contactEmail ?? ''}
        onChange={(e) => set({ contactEmail: e.target.value })} help="Se muestra en tu perfil público. Dejalo vacío para no publicar ningún email." {...fx('basics.contactEmail')}
      />
    </EditBlock>
  );
}
