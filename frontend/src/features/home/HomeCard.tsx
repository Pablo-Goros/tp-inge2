import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Skeleton } from '../../components/ui';
import type { Async } from './useAsync';

interface Props<T> {
  title: string;
  state: Async<T>;
  retrying: boolean;
  onRetry: () => void;
  /** Clases de ubicación en la grilla (hm-c4, hm-c8, hm-c12...). */
  span?: string;
  /** Enlace secundario junto al título. */
  action?: { to: string; label: string };
  skeleton?: number[];
  errorMessage?: string;
  className?: string;
  children: (data: T) => ReactNode;
}

/** Tarjeta del inicio: h2, y según el estado esqueleto (aria-busy), error con Reintentar o el contenido. */
export function HomeCard<T>({ title, state, retrying, onRetry, span = 'hm-c6', action, skeleton = [20, 56, 56], errorMessage, className, children }: Props<T>) {
  const id = useId();
  return (
    <section className={['card', 'hm-card', span, className].filter(Boolean).join(' ')} aria-labelledby={id} aria-busy={state.s === 'loading' || undefined}>
      <header className="hm-card-head">
        <h2 id={id} className="hm-card-title">{title}</h2>
        {action && state.s === 'ok' && <Link className="lnk-draw hm-card-link" to={action.to}>{action.label}</Link>}
      </header>
      {state.s === 'loading' && (
        <div className="hm-skel" role="status"><span className="sr-only">Cargando {title.toLowerCase()}…</span>{skeleton.map((h, i) => <Skeleton key={i} height={h} opacity={1 - i * 0.15} />)}</div>
      )}
      {state.s === 'error' && <ErrorState message={errorMessage ?? `No pudimos cargar esta sección.`} retrying={retrying} onRetry={onRetry} />}
      {state.s === 'ok' && children(state.data)}
    </section>
  );
}
