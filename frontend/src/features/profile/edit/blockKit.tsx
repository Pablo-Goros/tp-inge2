import { useRef, type ReactNode } from 'react';
import type { Profile } from '../../../api';
import { MonthField } from '../../../components/ui';
import { formatRange } from '../../../api/profileUtils';
import { newId, type Errors } from './editModel';

/** Lo que recibe cada bloque del editor. */
export interface BlockProps {
  draft: Profile;
  set: (patch: Partial<Profile>) => void;
  /** Todos los errores calculados; solo se muestran después de intentar guardar (`show`). */
  errors: Errors;
  show: boolean;
  /** Cambia con cada intento de guardar con errores (abre los ítems con errores). */
  signal: number;
}

export const errOf = ({ errors, show }: Pick<BlockProps, 'errors' | 'show'>, key: string) => (show ? errors[key] : undefined);

/** Bloque con ancla (`id`) y encabezado enfocable (la navegación lleva el foco acá). */
export function EditBlock({ id, title, hint, children }: { id: string; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="card pe-block" aria-labelledby={`${id}-h`}>
      <div className="pe-block-head">
        <h2 id={`${id}-h`} tabIndex={-1} className="disp pe-h">{title}</h2>
        {hint && <p className="help">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export const rangeMeta = (start?: string, end?: string | null) => (start ? formatRange(start, end || null) : '');

interface RangeProps {
  keyPrefix: string;
  start: string | undefined;
  end: string | null | undefined;
  onChange: (v: { start: string; end: string | null }) => void;
  error: (k: string) => string | undefined;
  requiredStart?: boolean;
}

/** Desde / Hasta (mes y año) con "Actualmente" (end = null). */
export function DateRange({ keyPrefix, start, end, onChange, error, requiredStart }: RangeProps) {
  const current = end === null;
  return (
    <div className="pe-range">
      <MonthField label="Desde" required={requiredStart} value={start ?? ''} fieldId={`${keyPrefix}.start`} error={error(`${keyPrefix}.start`)} onChange={(v) => onChange({ start: v, end: end ?? '' })} />
      <MonthField label="Hasta" value={end ?? ''} disabled={current} fieldId={`${keyPrefix}.end`} error={error(`${keyPrefix}.end`)} onChange={(v) => onChange({ start: start ?? '', end: v })} />
      <label className="chk">
        <input type="checkbox" checked={current} onChange={(e) => onChange({ start: start ?? '', end: e.target.checked ? null : '' })} />
        Actualmente
      </label>
    </div>
  );
}

/** Para listas sin id propio (enlaces, horarios): mantiene ids estables mientras se reordena. */
export function useIdList<T extends object>(list: T[], setList: (l: T[]) => void) {
  const ids = useRef<string[]>([]);
  while (ids.current.length < list.length) ids.current.push(newId());
  ids.current.length = list.length;
  const items = list.map((x, i) => ({ ...x, id: ids.current[i] }));
  const onChange = (next: (T & { id: string })[]) => {
    ids.current = next.map((x) => x.id);
    setList(next.map((x) => { const { id: _id, ...rest } = x; return rest as unknown as T; }));
  };
  return { items, onChange, indexOf: (id: string) => ids.current.indexOf(id) };
}
