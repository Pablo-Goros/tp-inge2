import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  icon?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon = '[ ]', action }: Props) {
  return (
    <div className="empty">
      <div className="disp empty-icon" aria-hidden="true">{icon}</div>
      <b>{title}</b>
      {description && <p className="help">{description}</p>}
      {action}
    </div>
  );
}
