import { useId } from 'react';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Nombre accesible. */
  label: string;
  /** Texto visible de cada estado (el estado no depende solo del color). */
  onText?: string;
  offText?: string;
  disabled?: boolean;
  describedBy?: string;
}

/** Interruptor accesible: role="switch" + texto de estado visible. */
export function Switch({ checked, onChange, label, onText = 'Activado', offText = 'Desactivado', disabled, describedBy }: Props) {
  const id = useId();
  return (
    <span className="sw-wrap">
      <button
        type="button" role="switch" id={id} className={checked ? 'sw sw-on' : 'sw'} aria-checked={checked} aria-label={label}
        aria-describedby={describedBy} disabled={disabled} onClick={() => onChange(!checked)}
      >
        <span className="sw-knob" aria-hidden="true" />
      </button>
      <span className="sw-text" aria-hidden="true">{checked ? onText : offText}</span>
    </span>
  );
}
