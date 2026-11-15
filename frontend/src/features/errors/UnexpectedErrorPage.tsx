import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';
import { StatusScreen } from './StatusScreen';

/** No depende del router ni de la sesión: también se usa fuera del RouterProvider (ErrorBoundary). */
export function UnexpectedErrorPage() {
  return (
    <>
      <header className="top top-bare">
        <a href="/" className="disp grad top-brand" aria-label="Certificados verificables, inicio">CERT·VERIF</a>
      </header>
      <StatusScreen code="!" warn title="Algo salió mal" message="Ocurrió un error inesperado. Probá de nuevo; si el problema sigue, volvé al inicio.">
        <a className="btn btn-p" href="/">Volver al inicio</a>
        <button type="button" className="btn btn-s" onClick={() => window.location.reload()}>Reintentar</button>
      </StatusScreen>
    </>
  );
}

/** errorElement del router: loguea el error real y muestra solo el mensaje genérico. */
export function RouteErrorPage() {
  const error = useRouteError();
  useEffect(() => { console.error('Error de ruta', error); }, [error]);
  return <UnexpectedErrorPage />;
}

/** Errores de render fuera del router. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error('Error de render', error, info.componentStack); }
  render() { return this.state.failed ? <UnexpectedErrorPage /> : this.props.children; }
}
