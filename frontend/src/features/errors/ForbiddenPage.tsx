import { LinkButton } from '../../components/ui';
import { StatusScreen } from './StatusScreen';

export function ForbiddenPage({ message, actionTo, actionLabel }: { message: string; actionTo: string; actionLabel: string }) {
  return (
    <StatusScreen code="403" title="No tenés permiso" message={message}>
      <LinkButton to={actionTo}>{actionLabel}</LinkButton>
    </StatusScreen>
  );
}
