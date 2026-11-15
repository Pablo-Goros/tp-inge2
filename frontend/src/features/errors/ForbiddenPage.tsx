import { LinkButton } from '../../components/ui';

// TODO etapa 6: versión definitiva (hoy: copy de Globales.dc.html, suficiente para los guards).
export function ForbiddenPage({ message, actionTo, actionLabel }: { message: string; actionTo: string; actionLabel: string }) {
  return (
    <div className="ctr">
      <div className="disp grad ctr-code" aria-hidden="true">403</div>
      <h1 className="ctr-title">No tenés permiso</h1>
      <p>{message}</p>
      <LinkButton to={actionTo}>{actionLabel}</LinkButton>
    </div>
  );
}
