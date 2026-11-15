/** Lleva a un bloque del editor: scroll suave (si no se pidió reducir movimiento) y foco en su encabezado. */
export function goTo(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  return true;
}

/** Foco y scroll al campo con error (data-field). */
export function focusField(key: string): void {
  const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
  if (!el) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}
