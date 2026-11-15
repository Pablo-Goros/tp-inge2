import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  flush?: boolean;
  danger?: boolean;
}

export function Card({ flush, danger, className, ...rest }: CardProps) {
  return <div {...rest} className={['card', flush && 'card-flush', danger && 'card-danger', className].filter(Boolean).join(' ')} />;
}
