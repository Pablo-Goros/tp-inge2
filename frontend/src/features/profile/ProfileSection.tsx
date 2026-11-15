import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Profile, SectionKey } from '../../api';
import { Chip } from '../../components/ui';

export interface ViewCtx { profile: Profile; own: boolean; /** Dentro de otra pantalla (vista previa del editor): sin ids de ancla que choquen. */ embedded?: boolean }
export type PKey = SectionKey | 'goals';

interface Props {
  ctx: ViewCtx;
  k: PKey;
  title: string;
  /** Sin contenido: en la vista propia invita a completar; en la pública no se renderiza. */
  empty: boolean;
  emptyHint?: string;
  /** Mostrar igual en la vista pública aunque esté vacía (certificados). */
  publicEmptyText?: string;
  children?: ReactNode;
  className?: string;
}

/** Tarjeta de sección con ancla (`id` = clave de sección), atajo "Editar" y manejo de ocultas/vacías. */
export function PSection({ ctx, k, title, empty, emptyHint, publicEmptyText, children, className }: Props) {
  const hidden = ctx.profile.hiddenSections.includes(k as SectionKey);
  if (!ctx.own && (hidden || (empty && !publicEmptyText))) return null;
  const hid = `pv-h-${k}`;
  const editTo = `/profile/edit#${k}`;
  return (
    <section id={ctx.embedded ? undefined : k} aria-labelledby={hid} className={['card pv-sec', `pv-o-${k}`, ctx.own && hidden && 'pv-dim', className].filter(Boolean).join(' ')}>
      <div className="sc-head">
        <h2 id={hid} className="disp sc-title">{title}</h2>
        {ctx.own && (
          <div className="pv-tools">
            {hidden && <Chip tone="neutral">Oculta en tu perfil público</Chip>}
            <Link to={editTo} className="lnk-draw" aria-label={`Editar ${title}`}>Editar</Link>
          </div>
        )}
      </div>
      {empty ? (
        ctx.own ? (
          <p className="pv-empty">{emptyHint ?? 'Todavía no cargaste nada acá.'} <Link to={editTo} className="lnk-draw">Completar</Link></p>
        ) : <p className="pv-empty">{publicEmptyText}</p>
      ) : children}
    </section>
  );
}
