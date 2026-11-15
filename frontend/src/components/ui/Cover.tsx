import type { CoverStyle } from '../../api/types';

/** Portada generada con CSS (sin imágenes). Decorativa. */
export function Cover({ style, className }: { style: CoverStyle; className?: string }) {
  return <div className={['cover', `cover-${style}`, className].filter(Boolean).join(' ')} aria-hidden="true" />;
}
