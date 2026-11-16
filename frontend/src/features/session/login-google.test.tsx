import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createMockClient } from '../../api/mock/MockApiClient';
import { clearSession, loadSession } from '../../api/token';
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

  it('credencial rechazada (401) muestra el error y deja el formulario', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
    const router = renderLogin();
    await waitFor(() => expect(gis.cb).toBeDefined());
    gis.cb!({ credential: 'basura' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos');
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  describe('primer ingreso (email sin cuenta)', () => {
    // USERS del mock es global al módulo: cada test usa un email distinto.
    async function toWelcome(email = 'ana.nueva@demo.test') {
      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
      const router = renderLogin();
      await waitFor(() => expect(gis.cb).toBeDefined());
      gis.cb!({ credential: `mock-google:${email}` });
      await screen.findByRole('heading', { name: '¡Bienvenido/a!' });
      return router;
    }

    it('muestra la bienvenida con nombre precargado, sin el error de credenciales', async () => {
      const router = await toWelcome();
      expect(screen.getByLabelText('Nombre')).toHaveValue('ana.nueva');
      expect(screen.getByLabelText('Nombre')).toHaveFocus();
      expect(screen.getByText(/ana\.nueva@demo\.test/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Crear mi cuenta de alumno' })).toBeInTheDocument();
      expect(screen.queryByText(/Email o contraseña incorrectos/)).toBeNull();
      expect(router.state.location.pathname).toBe('/login');
    });

    it('confirmar crea la cuenta con el nombre editado y navega al home del alumno', async () => {
      const router = await toWelcome('confirma@demo.test');
      const name = screen.getByLabelText('Nombre');
      await userEvent.clear(name);
      await userEvent.type(name, 'Ana Nueva');
      await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta de alumno' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/student/certificates'));
    });

    it('Volver regresa al formulario sin sesión', async () => {
      const router = await toWelcome('volver@demo.test');
      await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '¡Bienvenido/a!' })).toBeNull();
      expect(router.state.location.pathname).toBe('/login');
      expect(loadSession()).toBeNull();
    });

    it('si el alta falla por red muestra el error y permite reintentar', async () => {
      vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
      let offline = false;
      const client = createMockClient({ latencyMs: 0, scenarios: () => new Set(offline ? ['offline'] : []) });
      const router = createMemoryRouter(buildRoutes(client), { initialEntries: ['/login'] });
      render(<RouterProvider router={router} />);
      await waitFor(() => expect(gis.cb).toBeDefined());
      gis.cb!({ credential: 'mock-google:reintento@demo.test' });
      await screen.findByRole('heading', { name: '¡Bienvenido/a!' });
      offline = true;
      await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta de alumno' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar con el servidor');
      expect(router.state.location.pathname).toBe('/login');
      offline = false;
      await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta de alumno' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/student/certificates'));
    });
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
