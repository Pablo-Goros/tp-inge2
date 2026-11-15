import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';

/** Etiqueta compacta (aptitudes, intereses, estados). El tono no es lo único que comunica: llevar texto/ícono. */
export function Chip({ tone = 'neutral', icon, children, className }: { tone?: ChipTone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={['uchip', `uchip-${tone}`, className].filter(Boolean).join(' ')}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
export { Chip as Tag };
