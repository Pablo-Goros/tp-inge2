import { Topbar } from '../../components/ui';

// TODO etapa 6: versión definitiva. Se usa como errorElement: no depende de la sesión ni del layout.
export function UnexpectedErrorPage() {
  return (
    <>
      <Topbar />
      <div className="ctr">
        <div className="disp ctr-code ctr-warn" aria-hidden="true">!</div>
        <h1 className="ctr-title">Algo salió mal</h1>
        <p>Ocurrió un error inesperado. Probá de nuevo; si el problema sigue, volvé al inicio.</p>
        <a className="btn btn-p" href="/">Volver al inicio</a>
      </div>
    </>
  );
}
