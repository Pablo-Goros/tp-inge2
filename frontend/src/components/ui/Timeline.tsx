import type { ReactNode } from 'react';

export function Timeline({ children, label }: { children: ReactNode; label?: string }) {
  return <ol className="tl" aria-label={label}>{children}</ol>;
}

interface ItemProps {
  title: string;
  /** Organización / institución. */
  subtitle?: string;
  /** Fechas o lugar, ya formateados. */
  meta?: string;
  current?: boolean;
  children?: ReactNode;
}

export function TimelineItem({ title, subtitle, meta, current, children }: ItemProps) {
  return (
    <li className={current ? 'tl-item tl-cur' : 'tl-item'}>
      <span className="tl-dot" aria-hidden="true" />
      <div className="tl-body">
        <h3 className="tl-title">{title}</h3>
        {subtitle && <p className="tl-sub">{subtitle}</p>}
        {meta && <p className="help tl-meta">{meta}{current && <span className="sr-only"> (actual)</span>}</p>}
        {children && <div className="tl-text">{children}</div>}
      </div>
    </li>
  );
}
