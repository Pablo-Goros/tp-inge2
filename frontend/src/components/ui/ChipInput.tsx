import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

interface Props {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  maxLen?: number;
  help?: ReactNode;
  error?: string;
}

/** Etiquetas editables: Enter o coma agregan; cada una se quita con su botón. */
export function ChipInput({ label, values, onChange, placeholder, max = 20, maxLen = 40, help, error }: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const describedBy = [error && `${id}-e`, help && `${id}-h`].filter(Boolean).join(' ') || undefined;

  function add() {
    const v = text.trim().slice(0, maxLen);
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) { setNote(`"${v}" ya está en la lista.`); setText(''); return; }
    if (values.length >= max) { setNote(`Podés agregar hasta ${max}.`); return; }
    onChange([...values, v]);
    setNote(`Agregaste ${v}.`);
    setText('');
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
  }
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      {!!values.length && (
        <ul className="ci-list" aria-label={label}>
          {values.map((v) => (
            <li key={v} className="uchip uchip-brand ci-chip">
              {v}
              <button type="button" className="ci-x" aria-label={`Quitar ${v}`} onClick={() => { onChange(values.filter((x) => x !== v)); setNote(`Quitaste ${v}.`); }}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="ci-row">
        <input id={id} className="inp" value={text} placeholder={placeholder} maxLength={maxLen} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} aria-describedby={describedBy} aria-invalid={error ? true : undefined} />
        <button type="button" className="btn btn-s" onClick={add} disabled={!text.trim()}>Agregar</button>
      </div>
      {error && <span id={`${id}-e`} className="err">{error}</span>}
      {help && <span id={`${id}-h`} className="help">{help}</span>}
      <span className="sr-only" role="status" aria-live="polite">{note}</span>
    </div>
  );
}
