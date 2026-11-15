import { useEffect, useRef, type ReactNode } from 'react';

export const APP_TITLE = 'Certificados verificables';

interface Props {
  /** Código grande decorativo (404, 403, !). */
  code: string;
  warn?: boolean;
  title: string;
  message: string;
  children: ReactNode;
}

/** Pantalla de estado: número decorativo, h1 (recibe el foco al renderizar), texto y acción. */
export function StatusScreen({ code, warn, title, message, children }: Props) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · ${APP_TITLE}`;
    h1.current?.focus();
    return () => { document.title = prev; };
  }, [title]);
  return (
    <main className="ctr">
      <div className={warn ? 'disp ctr-code ctr-warn' : 'disp grad ctr-code'} aria-hidden="true">{code}</div>
      <h1 className="ctr-title" tabIndex={-1} ref={h1}>{title}</h1>
      <p>{message}</p>
      <div className="ctr-actions">{children}</div>
    </main>
  );
}
