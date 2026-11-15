import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string;
  help?: ReactNode;
}

export function Select({ label, error, help, children, ...rest }: Props) {
  const id = useId();
  const errId = `${id}-e`;
  const helpId = `${id}-h`;
  const describedBy = [error && errId, help && helpId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <select {...rest} id={id} className="inp inp-sel" aria-invalid={error ? true : undefined} aria-describedby={describedBy}>{children}</select>
      {error && <span id={errId} className="err">{error}</span>}
      {help && <span id={helpId} className="help">{help}</span>}
    </div>
  );
}
