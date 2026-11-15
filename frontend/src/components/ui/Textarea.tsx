import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value'> {
  label: string;
  value: string;
  error?: string;
  help?: ReactNode;
  /** Con `maxLength` muestra el contador "123 de 2000". */
}

export function Textarea({ label, value, error, help, maxLength, rows = 4, ...rest }: Props) {
  const id = useId();
  const errId = `${id}-e`;
  const helpId = `${id}-h`;
  const cntId = `${id}-c`;
  const describedBy = [error && errId, help && helpId, maxLength && cntId].filter(Boolean).join(' ') || undefined;
  const near = maxLength !== undefined && value.length >= maxLength * 0.9;
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <textarea {...rest} id={id} rows={rows} value={value} maxLength={maxLength} className="inp inp-area" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {error && <span id={errId} className="err">{error}</span>}
      <span className="fld-foot">
        {help && <span id={helpId} className="help">{help}</span>}
        {maxLength !== undefined && <span id={cntId} className={near ? 'help fld-count fld-count-near' : 'help fld-count'}>{value.length} de {maxLength}{near ? ' (casi en el límite)' : ''}</span>}
      </span>
    </div>
  );
}
