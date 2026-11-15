import type { ReactNode } from 'react';

export type AlertTone = 'info' | 'success' | 'warn' | 'error';

const icons: Record<AlertTone, string> = { info: 'i', success: '✓', warn: '!', error: '✕' };

interface AlertProps {
  tone: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** error/warn → role="alert" (asertivo); info/success → role="status" (aria-live polite). */
export function Alert({ tone, title, children, action, className }: AlertProps) {
  const role = tone === 'error' || tone === 'warn' ? 'alert' : 'status';
  return (
    <div className={['al', `al-${tone}`, className].filter(Boolean).join(' ')} role={role}>
      <span aria-hidden="true">{icons[tone]}</span>
      <div className="al-body">
        {title && <b>{title}</b>}
        {children && <span>{children}</span>}
      </div>
      {action && <div className="al-act">{action}</div>}
    </div>
  );
}
