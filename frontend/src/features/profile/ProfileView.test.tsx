import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ApiClient, Profile } from '../../api';
import { createMockClient } from '../../api/mock/MockApiClient';
import { resetProfiles } from '../../api/mock/profileStore';
import { clearSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';

const student = { token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' as const } };
const tutor = { token: 'mock:operador@demo.test', user: { name: 'Marcos Quiroga', role: 'operator' as const } };
const mk = (sc: Iterable<string> = []) => createMockClient({ latencyMs: 0, scenarios: () => new Set(sc) });

function renderAt(path: string, c: ApiClient = mk()) {
  const router = createMemoryRouter(buildRoutes(c), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
const h1 = (name: string) => screen.findByRole('heading', { level: 1, name });
const h2 = (name: string) => screen.queryByRole('heading', { level: 2, name });

/** Cliente que devuelve el perfil propio/público modificado. */
const withProfile = (slug: string, mod: (p: Profile) => Profile): ApiClient => {
  const base = mk();
  return {
    ...base,
    getMyProfile: async () => mod(await base.getMyProfile()),
    getPublicProfile: async (s) => { const p = await base.getPublicProfile(s); return s === slug ? mod(p) : p; },
  } as ApiClient;
};

beforeEach(() => { clearSession(); resetProfiles(); document.title = ''; });

describe('Mi perfil', () => {
  it('muestra botones de edición, atajos por sección y completitud', async () => {
    saveSession(student);
    renderAt('/profile', withProfile('', (p) => ({ ...p, languages: [] })));
    await h1('Camila Ferreyra');
    await waitFor(() => expect(document.title).toBe('Camila Ferreyra · Perfil'));
    expect(screen.getByRole('link', { name: 'Editar perfil' })).toHaveAttribute('href', '/profile/edit');
    expect(screen.getByRole('link', { name: 'Ver como público' })).toHaveAttribute('href', '/p/camila-ferreyra');
    expect(screen.getByRole('link', { name: 'Editar Experiencia' })).toHaveAttribute('href', '/profile/edit#experience');
    expect(screen.getByRole('progressbar', { name: 'Completitud del perfil' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agregá tus idiomas' })).toHaveAttribute('href', '/profile/edit#languages');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const id of ['about', 'experience', 'education', 'skills', 'projects', 'certificates']) expect(document.getElementById(id)).not.toBeNull();
  });

  it('sección vacía: invita a completar, con enlace; la pública no la muestra', async () => {
    saveSession(student);
    const c = withProfile('camila-ferreyra', (p) => ({ ...p, projects: [] }));
    renderAt('/profile', c);
    await h1('Camila Ferreyra');
    const sec = document.getElementById('projects')!;
    expect(within(sec).getByRole('link', { name: 'Completar' })).toHaveAttribute('href', '/profile/edit#projects');
    cleanup();
    renderAt('/p/camila-ferreyra', c);
    await h1('Camila Ferreyra');
    expect(h2('Proyectos')).toBeNull();
    expect(document.getElementById('projects')).toBeNull();
  });

  it('secciones ocultas: atenuadas con etiqueta en la propia, ausentes en la pública', async () => {
    saveSession(student);
    const c = withProfile('camila-ferreyra', (p) => ({ ...p, hiddenSections: ['projects'] }));
    renderAt('/profile', c);
    await h1('Camila Ferreyra');
    expect(within(document.getElementById('projects')!).getByText('Oculta en tu perfil público')).toBeInTheDocument();
    cleanup();
    renderAt('/p/camila-ferreyra', c);
    await h1('Camila Ferreyra');
    expect(h2('Proyectos')).toBeNull();
  });

  it('carga con aria-busy y error con Reintentar', async () => {
    saveSession(student);
    const sc = new Set(['profile-fail']);
    const c = createMockClient({ latencyMs: 0, scenarios: () => sc });
    renderAt('/profile', c);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el perfil');
    sc.clear();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await h1('Camila Ferreyra');
  });
});

describe('Perfil público', () => {
  it('sin controles de edición, con certificados que enlazan a /verify/:id', async () => {
    renderAt('/p/camila-ferreyra');
    await h1('Camila Ferreyra');
    expect(screen.queryByRole('link', { name: 'Editar perfil' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Editar / })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    const link = await screen.findByRole('link', { name: 'Verificar Redes y Seguridad I' });
    expect(link).toHaveAttribute('href', '/verify/c2b84e10-9a37-4f52-8d6b-000000000001');
    expect(within(document.getElementById('certificates')!).getAllByText('Verificable').length).toBeGreaterThan(0);
  });

  it('enlaces externos con rel noopener', async () => {
    renderAt('/p/camila-ferreyra');
    await h1('Camila Ferreyra');
    const ext = within(document.getElementById('links')!).getAllByRole('link');
    expect(ext.length).toBeGreaterThan(0);
    for (const a of ext) { expect(a).toHaveAttribute('target', '_blank'); expect(a.getAttribute('rel')).toContain('noopener'); }
  });

  it('no muestra nunca el email de cuenta; "Contactar" solo con contactEmail', async () => {
    renderAt('/p/camila-ferreyra');
    await h1('Camila Ferreyra');
    expect(document.body.innerHTML).not.toContain('alumno01@demo.test');
    expect(screen.getByRole('link', { name: /Contactar/ })).toHaveAttribute('href', 'mailto:camila.ferreyra.contacto@ejemplo.test');
    cleanup();
    renderAt('/p/camila-ferreyra', withProfile('camila-ferreyra', (p) => { const { contactEmail: _c, ...rest } = p; return rest as Profile; }));
    await h1('Camila Ferreyra');
    expect(screen.queryByRole('link', { name: /Contactar/ })).toBeNull();
    expect(document.body.innerHTML).not.toContain('mailto:');
    expect(document.body.innerHTML).not.toContain('alumno01@demo.test');
  });

  it('aviso al dueño con enlace Editar; sin aviso para otros o sin sesión', async () => {
    saveSession(student);
    renderAt('/p/camila-ferreyra');
    await h1('Camila Ferreyra');
    const note = await screen.findByText(/Este es tu perfil público/);
    expect(within(note).getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/profile/edit');
    cleanup();
    renderAt('/p/marcos-quiroga');
    await h1('Marcos Quiroga');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Este es tu perfil público/)).toBeNull();
    cleanup();
    clearSession();
    renderAt('/p/camila-ferreyra');
    await h1('Camila Ferreyra');
    expect(screen.queryByText(/Este es tu perfil público/)).toBeNull();
  });

  it('slug inexistente: "Perfil no encontrado" con botón al directorio', async () => {
    renderAt('/p/nadie-por-aca');
    expect(await h1('Perfil no encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al directorio' })).toHaveAttribute('href', '/directory');
  });

  it('error al cargar muestra Reintentar', async () => {
    const sc = new Set(['profile-fail']);
    renderAt('/p/camila-ferreyra', createMockClient({ latencyMs: 0, scenarios: () => sc }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    sc.clear();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await h1('Camila Ferreyra');
  });

  it('copiar enlace: llama al portapapeles y avisa en una región aria-live', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt('/p/camila-ferreyra');
    await h1('Camila Ferreyra');
    const live = screen.getAllByRole('status').find((e) => e.getAttribute('aria-live') === 'polite')!;
    expect(live).toHaveTextContent('');
    await user.click(screen.getByRole('button', { name: /Copiar enlace/ }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/camila-ferreyra`);
    await waitFor(() => expect(live).toHaveTextContent('Enlace copiado'));
  });

  it('certificados vacíos: estado amable', async () => {
    renderAt('/p/marcos-quiroga');
    await h1('Marcos Quiroga');
    expect(await screen.findByText('Todavía no destacó certificados.')).toBeInTheDocument();
  });
});

describe('tutor vs alumno', () => {
  it('tutor: docencia con horarios; sin objetivos', async () => {
    saveSession(tutor);
    renderAt('/profile');
    await h1('Marcos Quiroga');
    expect(screen.getByText('Tutor')).toBeInTheDocument();
    expect(h2('Docencia')).not.toBeNull();
    expect(h2('Horarios de consulta')).toBeNull(); // es un h3 dentro de Docencia
    expect(screen.getByText('Horarios de consulta')).toBeInTheDocument();
    expect(h2('Objetivos y búsqueda')).toBeNull();
    expect(document.getElementById('teaching')).not.toBeNull();
  });

  it('alumno: objetivos y búsqueda; sin docencia', async () => {
    renderAt('/p/camila-ferreyra');
    await h1('Camila Ferreyra');
    expect(screen.getByText('Alumno')).toBeInTheDocument();
    expect(h2('Docencia')).toBeNull();
    expect(h2('Objetivos y búsqueda') ?? h2('Acerca de')).not.toBeNull();
  });
});
