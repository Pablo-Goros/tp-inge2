import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createMockClient } from '../../api/mock/MockApiClient';
import { clearSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';

const gis = vi.hoisted(() => ({ loadGis: vi.fn(), cb: undefined as undefined | ((r: { credential: string }) => void) }));
vi.mock('./googleIdentity', () => ({ loadGis: gis.loadGis }));

function renderLogin() {
  const client = createMockClient({ latencyMs: 0, scenarios: () => new Set<string>() });
  const router = createMemoryRouter(buildRoutes(client), { initialEntries: ['/login'] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  clearSession();
  gis.cb = undefined;
  gis.loadGis.mockReset();
  gis.loadGis.mockResolvedValue({
    accounts: { id: {
      initialize: (o: { callback: (r: { credential: string }) => void }) => { gis.cb = o.callback; },
      renderButton: (el: HTMLElement) => { el.setAttribute('data-gsi', '1'); },
    } },
  });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('login con Google', () => {
  it('sin VITE_GOOGLE_CLIENT_ID no hay botón ni se carga el script', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    renderLogin();
    expect(screen.queryByTestId('google-button')).toBeNull();
    expect(gis.loadGis).not.toHaveBeenCalled();
  });

  it('con ID renderiza el botón y una credencial válida navega al home del alumno', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
    const router = renderLogin();
    await waitFor(() => expect(screen.getByTestId('google-button')).toHaveAttribute('data-gsi', '1'));
    gis.cb!({ credential: 'mock-google:alumno01@demo.test' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/student/certificates'));
  });

  it('credencial rechazada muestra el error y deja el formulario', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
    const router = renderLogin();
    await waitFor(() => expect(gis.cb).toBeDefined());
    gis.cb!({ credential: 'mock-google:nadie@demo.test' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos');
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('si el script no carga avisa y el formulario sigue operativo', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
    gis.loadGis.mockRejectedValue(new Error('blocked'));
    renderLogin();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el acceso con Google. Podés ingresar con email y contraseña.');
    expect(screen.getByLabelText('Email')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });
});
