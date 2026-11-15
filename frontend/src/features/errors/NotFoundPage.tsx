import { LinkButton } from '../../components/ui';
import { StatusScreen } from './StatusScreen';

export function NotFoundPage() {
  return (
    <StatusScreen code="404" title="Página no encontrada" message="La dirección que buscás no existe o fue movida.">
      <LinkButton to="/">Volver al inicio</LinkButton>
    </StatusScreen>
  );
}
