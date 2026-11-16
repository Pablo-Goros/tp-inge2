import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createMockClient } from '../../api/mock/MockApiClient';
import { clearSession, loadSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';
import { homeFor, useApi, useAuth } from './AuthProvider';

const client = (sc: string[] = []) => createMockClient({ latencyMs: 0, scenarios: () => new Set(sc) });

function renderAt(path: string, c = client()) {
  const router = createMemoryRouter(buildRoutes(c), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const operator = { token: 'mock:operador@demo.test', user: { name: 'Marcos Quiroga', role: 'operator' as const } };
const student = { token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' as const } };

async function fillLogin(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Contraseña'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
}

beforeEach(() => clearSession());

describe('login', () => {
  it('operador entra a /operator/batches', async () => {
    const router = renderAt('/login');
    await fillLogin('operador@demo.test', 'demo1234');
    await waitFor(() => expect(router.state.location.pathname).toBe('/operator/batches'));
    expect(screen.getByRole('heading', { name: 'Lotes' })).toBeInTheDocument();
    expect(screen.getByText('Marcos Quiroga')).toBeInTheDocument();
  });

  it('alumno entra a /student/certificates', async () => {
    const router = renderAt('/login');
    await fillLogin('alumno01@demo.test', 'demo1234');
    await waitFor(() => expect(router.state.location.pathname).toBe('/student/certificates'));
    expect(screen.getByRole('heading', { name: 'Mis certificados' })).toBeInTheDocument();
  });

  it('clave incorrecta muestra el mensaje y se queda en /login', async () => {
    const router = renderAt('/login');
    await fillLogin('operador@demo.test', 'mala');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos. Revisá los datos e intentá de nuevo.');
    expect(router.state.location.pathname).toBe('/login');
    expect(loadSession()).toBeNull();
  });

  it('sin conexión muestra un mensaje de red', async () => {
    renderAt('/login', client(['offline']));
    await fillLogin('operador@demo.test', 'demo1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar');
  });
});

describe('guards', () => {
  it('alumno en ruta de operador ve 403 sin redirección', () => {
    saveSession(student);
    const router = renderAt('/operator/batches');
    expect(screen.getByRole('heading', { name: 'No tenés permiso' })).toBeInTheDocument();
    expect(screen.getByText(/Tu cuenta de alumno solo accede a Mis certificados/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/operator/batches');
  });

  it('sin sesión en ruta protegida ve 403', () => {
    renderAt('/operator/batches/new');
    expect(screen.getByRole('heading', { name: 'No tenés permiso' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a ingresar' })).toHaveAttribute('href', '/login');
  });

  it('/verify/:certId es pública y / redirige según sesión', async () => {
    renderAt('/verify/abc');
    expect(screen.getByRole('heading', { name: 'Verificación de certificado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('ruta inexistente muestra 404', () => {
    renderAt('/no-existe');
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it('/ lleva a la home del rol', async () => {
    saveSession(operator);
    const router = renderAt('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/operator/batches'));
  });
});

describe('guards de perfiles', () => {
  const heading = (name: string) => expect(screen.getByRole('heading', { name })).toBeInTheDocument();

  it.each(['/home', '/profile', '/profile/edit', '/profile/settings'])('%s exige sesión (cualquier rol)', (path) => {
    renderAt(path);
    heading('No tenés permiso');
    cleanup();
    for (const u of [student, operator]) {
      saveSession(u);
      renderAt(path);
      expect(screen.queryByRole('heading', { name: 'No tenés permiso' })).not.toBeInTheDocument();
      cleanup();
      clearSession();
    }
  });

  it('/p/:slug y /directory son públicas (sin sesión muestran "Ingresar")', async () => {
    renderAt('/p/camila-ferreyra');
    expect(await screen.findByRole('heading', { level: 1, name: 'Camila Ferreyra' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ingresar' })).toBeInTheDocument();
    cleanup();
    renderAt('/directory');
    expect(await screen.findByRole('heading', { level: 1, name: 'Directorio' })).toBeInTheDocument();
  });

  it('con sesión, las rutas públicas muestran la topbar de sesión con la nav del rol', () => {
    saveSession(student);
    renderAt('/directory');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Inicio', 'Mis certificados', 'Mi perfil', 'Directorio']);
    cleanup();
    saveSession(operator);
    renderAt('/p/marcos-quiroga');
    expect(within(screen.getByRole('navigation', { name: 'Principal' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Inicio', 'Lotes', 'Nuevo lote', 'Mi perfil', 'Directorio']);
  });

  it('/student/certificates/:id es solo de alumnos', () => {
    saveSession(operator);
    renderAt('/student/certificates/abc');
    heading('No tenés permiso');
    cleanup();
    saveSession(student);
    renderAt('/student/certificates/abc');
    heading('Detalle del certificado');
  });

  it('los destinos post-login no cambian', () => {
    expect(homeFor('operator')).toBe('/operator/batches');
    expect(homeFor('student')).toBe('/student/certificates');
  });
});

describe('sesión', () => {
  it('sobrevive a la recarga (sessionStorage)', async () => {
    saveSession(student);
    renderAt('/student/certificates'); // "recarga": árbol nuevo, mismo sessionStorage
    expect(screen.getByRole('heading', { name: 'Mis certificados' })).toBeInTheDocument();
    expect(screen.getByText('Camila Ferreyra')).toBeInTheDocument();
    await screen.findAllByRole('button', { name: /Descargar PDF/ }); // espera la lista: evita el warning de act()
  });

  it('cerrar sesión la limpia y va a /login', async () => {
    saveSession(operator);
    const router = renderAt('/operator/batches');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(loadSession()).toBeNull();
  });

  it('un 401 en cualquier llamada limpia la sesión y lleva a /login', async () => {
    saveSession(operator);
    function Probe() {
      const api = useApi();
      return <button onClick={() => api.listBatches().catch(() => {})}>cargar</button>;
    }
    const routes = buildRoutes(client(['expired']));
    routes[0].children![0].children = [{ path: '/probe', element: <Probe /> }, { path: '/login', element: <p>pantalla login</p> }];
    const router = createMemoryRouter(routes, { initialEntries: ['/probe'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole('button', { name: 'cargar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(loadSession()).toBeNull();
  });
});

describe('loginWithGoogle', () => {
  function GoogleProbe() {
    const auth = useAuth();
    return (
      <>
        <button onClick={() => auth.loginWithGoogle('mock-google:alumno01@demo.test').catch(() => {})}>google ok</button>
        <button onClick={() => auth.api.loginWithGoogle('basura').catch(() => {})}>google mal</button>
        <button onClick={() => auth.signupWithGoogle('mock-google:nuevo.alumno@demo.test', 'Nuevo Alumno').catch(() => {})}>signup ok</button>
        <button onClick={() => auth.api.signupWithGoogle('basura').catch(() => {})}>signup mal</button>
      </>
    );
  }
  function renderProbe() {
    const routes = buildRoutes(client());
    routes[0].children![0].children = [{ path: '/probe', element: <GoogleProbe /> }, { path: '/login', element: <p>pantalla login</p> }];
    const router = createMemoryRouter(routes, { initialEntries: ['/probe'] });
    render(<RouterProvider router={router} />);
    return router;
  }

  it('guarda usuario y token como login', async () => {
    renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'google ok' }));
    await waitFor(() => expect(loadSession()?.user.role).toBe('student'));
    expect(loadSession()?.token).toBe('mock:alumno01@demo.test');
  });

  it('un 401 no cierra la sesión ni redirige', async () => {
    saveSession(operator);
    const router = renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'google mal' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe('/probe');
    expect(loadSession()).not.toBeNull();
  });

  it('signupWithGoogle guarda usuario y token como login', async () => {
    renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'signup ok' }));
    await waitFor(() => expect(loadSession()?.user).toEqual({ name: 'Nuevo Alumno', role: 'student' }));
    expect(loadSession()?.token).toBe('mock:nuevo.alumno@demo.test');
  });

  it('un 401 en signupWithGoogle no cierra la sesión ni redirige', async () => {
    saveSession(operator);
    const router = renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'signup mal' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe('/probe');
    expect(loadSession()).not.toBeNull();
  });
});
