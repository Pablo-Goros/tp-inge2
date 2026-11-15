import { useEffect, useId, useState } from 'react';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface Props {
  label: string;
  /** "AAAA-MM" o "". */
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  /** Atributo data-field del primer selector, para enlazar desde el resumen de errores. */
  fieldId?: string;
}

const split = (v: string): [string, string] => (/^\d{4}-\d{2}$/.test(v) ? [v.slice(0, 4), v.slice(5)] : ['', '']);

/** Mes y año con dos selectores (funciona igual en todos los navegadores). Emite "AAAA-MM" solo con ambos elegidos. */
export function MonthField({ label, value, onChange, error, disabled, required, fieldId }: Props) {
  const id = useId();
  const [year, setYear] = useState(split(value)[0]);
  const [month, setMonth] = useState(split(value)[1]);
  useEffect(() => {
    const [y, m] = split(value);
    if (value || (!year && !month)) { setYear(y); setMonth(m); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const now = new Date().getFullYear();
  const years = Array.from({ length: now + 6 - 1960 }, (_, i) => String(now + 5 - i));
  const emit = (y: string, m: string) => { setYear(y); setMonth(m); onChange(y && m ? `${y}-${m}` : ''); };
  const err = `${id}-e`;
  return (
    <div className="fld" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="fld-label">{label}{required && <span aria-hidden="true"> *</span>}</span>
      <div className="mf-row">
        <select className="inp inp-sel" aria-label={`${label}: mes`} disabled={disabled} value={month} data-field={fieldId} aria-invalid={error ? true : undefined} aria-describedby={error ? err : undefined} onChange={(e) => emit(year, e.target.value)}>
          <option value="">Mes</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
        <select className="inp inp-sel" aria-label={`${label}: año`} disabled={disabled} value={year} aria-invalid={error ? true : undefined} aria-describedby={error ? err : undefined} onChange={(e) => emit(e.target.value, month)}>
          <option value="">Año</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {error && <span id={err} className="err">{error}</span>}
    </div>
  );
}
