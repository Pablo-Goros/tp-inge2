import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

interface Props {
  text: string;
  children: ReactNode;
  variant?: ButtonVariant;
  small?: boolean;
  /** Mensaje de éxito; por defecto "Enlace copiado". */
  okMessage?: string;
  'aria-label'?: string;
}

/** Copia `text` al portapapeles y lo anuncia en una región aria-live (visible junto al botón). */
export function CopyButton({ text, children, variant = 'secondary', small, okMessage = 'Enlace copiado', ...rest }: Props) {
  const [msg, setMsg] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* sin permiso o sin API */ }
    setMsg(ok ? okMessage : 'No se pudo copiar. Copialo a mano.');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), 3000);
  }
  return (
    <span className="copy-wrap">
      <Button variant={variant} small={small} onClick={() => void copy()} aria-label={rest['aria-label']}>{children}</Button>
      <span className="copy-msg" role="status" aria-live="polite">{msg}</span>
    </span>
  );
}
