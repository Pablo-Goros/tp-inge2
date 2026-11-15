import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  children: ReactNode;
  /** Muestra "Editar" como enlace a esta ruta. */
  editTo?: string;
  /** O una acción propia (p. ej. un Button). */
  action?: ReactNode;
  className?: string;
}

export function SectionCard({ title, children, editTo, action, className }: Props) {
  const id = useId();
  return (
    <section className={['card sc', className].filter(Boolean).join(' ')} aria-labelledby={id}>
      <div className="sc-head">
        <h2 id={id} className="disp sc-title">{title}</h2>
        {editTo ? <Link to={editTo} className="lnk-draw" aria-label={`Editar ${title}`}>Editar</Link> : action}
      </div>
      <div className="sc-body">{children}</div>
    </section>
  );
}
