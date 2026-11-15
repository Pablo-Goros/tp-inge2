import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  help?: ReactNode;
}

export function Field({ label, error, help, ...input }: FieldProps) {
  const id = useId();
  const errId = `${id}-e`;
  const helpId = `${id}-h`;
  const describedBy = [error && errId, help && helpId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <input {...input} id={id} className="inp" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {error && <span id={errId} className="err">{error}</span>}
      {help && <span id={helpId} className="help">{help}</span>}
    </div>
  );
}
