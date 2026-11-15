import { useId } from 'react';
import type { SlugStatus } from './useSlugCheck';

const MSG: Record<SlugStatus, { icon: string; text: string; cls: string } | null> = {
  current: { icon: '✓', text: 'Es tu dirección actual', cls: 'ok' },
  available: { icon: '✓', text: 'Disponible', cls: 'ok' },
  taken: { icon: '✕', text: 'En uso', cls: 'bad' },
  checking: { icon: '…', text: 'Revisando…', cls: 'mut' },
  invalid: { icon: '!', text: 'Formato no válido', cls: 'bad' },
  unknown: { icon: 'i', text: 'No pudimos revisarlo ahora; lo confirmamos al guardar', cls: 'warn' },
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  status: SlugStatus;
  /** Error de formulario (p. ej. el servidor respondió SLUG_TAKEN). */
  error?: string;
  label?: string;
}

/** Dirección del perfil (/p/…) con estado de disponibilidad. El estado se escribe con texto e ícono, no solo con color. */
export function SlugField({ value, onChange, status, error, label = 'Dirección de tu perfil' }: Props) {
  const id = useId();
  const m = MSG[status];
  const bad = status === 'taken' || status === 'invalid' || !!error;
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <div className="slug-row">
        <span className="slug-pre" aria-hidden="true">{window.location.host}/p/</span>
        <input
          id={id} className="inp slug-inp" value={value} data-field="basics.slug" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'))} aria-invalid={bad ? true : undefined} aria-describedby={`${id}-s ${id}-h`}
        />
      </div>
      <span id={`${id}-s`} className="slug-status" role="status" aria-live="polite">
        {m && <span className={`bdg ${m.cls}`}><span aria-hidden="true">{m.icon}</span>{m.text}</span>}
        {error && <span className="err"> {error}</span>}
      </span>
      <span id={`${id}-h`} className="help">De 3 a 40 letras minúsculas, números y guiones. Si la cambiás, el enlace anterior deja de funcionar.</span>
    </div>
  );
}
