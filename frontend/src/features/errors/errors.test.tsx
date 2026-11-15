import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createMockClient } from '../../api/mock/MockApiClient';
import { clearSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';
import { AppErrorBoundary } from './UnexpectedErrorPage';

const client = createMockClient({ latencyMs: 0, scenarios: () => new Set<string>() });
const SESSIONS = {
  operator: { token: 'mock:operador@demo.test', user: { name: 'Marcos Quiroga', role: 'operator' as const } },
  student: { token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' as const } },
};
type Who = 'none' | 'operator' | 'student';

function renderAt(path: string, who: Who) {
  clearSession();
  if (who !== 'none') saveSession(SESSIONS[who]);
  const router = createMemoryRouter(buildRoutes(client), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => clearSession());

const OP = ['/operator/batches', '/operator/batches/new', '/operator/batches/b1'];
const ST = ['/student/certificates'];

describe('guards: matriz rol x ruta', () => {
  const cases: [string, Who, 'ok' | '403'][] = [
    ...OP.flatMap((p): [string, Who, 'ok' | '403'][] => [[p, 'operator', 'ok'], [p, 'student', '403'], [p, 'none', '403']]),
    ...ST.flatMap((p): [string, Who, 'ok' | '403'][] => [[p, 'student', 'ok'], [p, 'operator', '403'], [p, 'none', '403']]),
  ];
  it.each(cases)('%s con %s -> %s', async (path, who, expected) => {
    renderAt(path, who);
    if (expected === '403') {
      expect(await screen.findByRole('heading', { level: 1, name: 'No tenés permiso' })).toBeInTheDocument();
    } else {
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'No tenés permiso' })).toBeNull());
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    }
  });

  it.each(['none', 'operator', 'student'] as Who[])('ruta inexistente -> 404 (%s)', (who) => {
    renderAt('/no-existe', who);
    expect(screen.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it.each(['none', 'operator', 'student'] as Who[])('/verify/:certId es público (%s)', async (who) => {
    renderAt('/verify/c-1', who);
    expect(screen.queryByRole('heading', { name: 'No tenés permiso' })).toBeNull();
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1));
  });

  it('/ redirige por rol', async () => {
    for (const [who, dest] of [['none', '/login'], ['operator', '/operator/batches'], ['student', '/student/certificates']] as [Who, string][]) {
      const router = renderAt('/', who);
      await waitFor(() => expect(router.state.location.pathname).toBe(dest));
      document.body.innerHTML = '';
    }
  });
});

describe('pantallas 403', () => {
  it('sin sesión: texto, botón a /login, foco y título', async () => {
    renderAt('/operator/batches/new', 'none');
    const h1 = await screen.findByRole('heading', { level: 1, name: 'No tenés permiso' });
    expect(screen.getByText('Para ver esta página tenés que ingresar con una cuenta autorizada.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a ingresar' })).toHaveAttribute('href', '/login');
    expect(h1).toHaveFocus();
    expect(document.title).toBe('No tenés permiso · Certificados verificables');
    expect(screen.queryByText('403')).toBeInTheDocument();
    expect(screen.getByText('403')).toHaveAttribute('aria-hidden', 'true');
  });
  it('alumno en ruta de operador', () => {
    renderAt('/operator/batches', 'student');
    expect(screen.getByText('No tenés permiso para ver esta página. Tu cuenta de alumno solo accede a Mis certificados.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Mis certificados' })).toHaveAttribute('href', '/student/certificates');
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
  it('operador en ruta de alumno', () => {
    renderAt('/student/certificates', 'operator');
    expect(screen.getByText('No tenés permiso para ver esta página. Tu cuenta de operador solo accede a Lotes.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Lotes' })).toHaveAttribute('href', '/operator/batches');
  });
});

describe('pantalla 404', () => {
  it('texto, botón al inicio, foco y título', () => {
    renderAt('/nada', 'none');
    const h1 = screen.getByRole('heading', { level: 1, name: 'Página no encontrada' });
    expect(screen.getByText('La dirección que buscás no existe o fue movida.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
    expect(screen.getByText('404')).toHaveAttribute('aria-hidden', 'true');
    expect(h1).toHaveFocus();
    expect(document.title).toBe('Página no encontrada · Certificados verificables');
  });
});

describe('error inesperado', () => {
  function Boom(): never { throw new Error('detalle técnico secreto'); }

  function expectScreen() {
    const h1 = screen.getByRole('heading', { level: 1, name: 'Algo salió mal' });
    expect(screen.getByText('Ocurrió un error inesperado. Probá de nuevo; si el problema sigue, volvé al inicio.')).toBeInTheDocument();
    expect(screen.getByText('!')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(h1).toHaveFocus();
    expect(screen.queryByText(/detalle técnico/)).toBeNull();
  }

  it('ErrorBoundary captura errores de render, loguea y no filtra detalles', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AppErrorBoundary><Boom /></AppErrorBoundary>);
    expectScreen();
    expect(log.mock.calls.flat().some((a) => a instanceof Error && a.message.includes('secreto'))).toBe(true);
    log.mockRestore();
  });

  it('errorElement del router', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const routes = buildRoutes(client);
    routes[0].children![0].children = [{ path: '/boom', element: <Boom /> }];
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/boom'] })} />);
    expectScreen();
    log.mockRestore();
  });

  it('Reintentar recarga la página', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, reload } });
    render(<AppErrorBoundary><Boom /></AppErrorBoundary>);
    screen.getByRole('button', { name: 'Reintentar' }).click();
    expect(reload).toHaveBeenCalled();
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
    log.mockRestore();
  });
});
