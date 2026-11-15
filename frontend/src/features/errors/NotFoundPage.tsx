import { LinkButton } from '../../components/ui';

// TODO etapa 6: versión definitiva (hoy: copy de Globales.dc.html).
export function NotFoundPage() {
  return (
    <div className="ctr">
      <div className="disp grad ctr-code" aria-hidden="true">404</div>
      <h1 className="ctr-title">Página no encontrada</h1>
      <p>La dirección que buscás no existe o fue movida.</p>
      <LinkButton to="/">Volver al inicio</LinkButton>
    </div>
  );
}
