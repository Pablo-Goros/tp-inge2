import { useId, type ReactNode } from 'react';

export interface RadioCardOption<V extends string> { value: V; label: string; preview?: ReactNode }

interface Props<V extends string> {
  legend: string;
  name?: string;
  value: V;
  options: RadioCardOption<V>[];
  onChange: (v: V) => void;
  help?: ReactNode;
}

/** Grupo de opciones visuales con radios nativos (flechas del teclado, un solo tab stop). */
export function RadioCardGroup<V extends string>({ legend, name, value, options, onChange, help }: Props<V>) {
  const gid = useId();
  const helpId = `${gid}-h`;
  return (
    <fieldset className="rc-set" aria-describedby={help ? helpId : undefined}>
      <legend className="fld-label">{legend}</legend>
      <div className="rc-grid" role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <label key={o.value} className={o.value === value ? 'rc rc-on' : 'rc'}>
            <input type="radio" className="sr-only" name={name ?? gid} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.preview && <span className="rc-prev" aria-hidden="true">{o.preview}</span>}
            <span className="rc-label">{o.value === value && <span aria-hidden="true">✓ </span>}{o.label}</span>
          </label>
        ))}
      </div>
      {help && <span id={helpId} className="help">{help}</span>}
    </fieldset>
  );
}
