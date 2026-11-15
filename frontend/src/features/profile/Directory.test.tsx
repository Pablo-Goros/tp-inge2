import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ApiError, type ApiClient, type ProfileSummary } from '../../api';
import { createMockClient } from '../../api/mock/MockApiClient';
import { resetProfiles } from '../../api/mock/profileStore';
import { clearSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';

const mk = (over: Partial<ApiClient> = {}): ApiClient => ({ ...createMockClient({ latencyMs: 0, scenarios: () => new Set<string>() }), ...over }) as ApiClient;

function renderDir(c: ApiClient, url = '/directory') {
  const router = createMemoryRouter(buildRoutes(c) as RouteObject[], { initialEntries: [url] });
  render(<RouterProvider router={router} />);
  return router;
}
const search = (r: ReturnType<typeof renderDir>) => new URLSearchParams(r.state.location.search);
const list = () => screen.findByRole('list', { name: 'Personas' });
const people = async () => within(await list()).getAllByRole('listitem');
const liveText = (re: RegExp) => waitFor(() => expect(screen.getAllByRole('status').some((e) => re.test(e.textContent ?? ''))).toBe(true));

beforeEach(() => { clearSession(); resetProfiles(); });

describe('Directorio', () => {
  it('es público: encabezado, buscador con label y primera página de 12 tarjetas enlazadas', async () => {
    const r = renderDir(mk());
    expect(screen.getByRole('heading', { level: 1, name: 'Directorio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar personas')).toHaveAttribute('type', 'search');
    const items = await people();
    expect(items).toHaveLength(12);
    const first = within(items[0]).getByRole('link');
    expect(first.getAttribute('href')).toMatch(/^\/p\/[a-z0-9-]+$/);
    expect(first).toHaveClass('card-link');
    expect(within(items[0]).getByRole('heading', { level: 3 })).toBeInTheDocument();
    await liveText(/^32 personas$/);
    expect(search(r).toString()).toBe('');
  });

  it('con sesión usa la topbar de sesión', async () => {
    saveSession({ token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' } });
    renderDir(mk());
    await people();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ingresar' })).not.toBeInTheDocument();
  });

  it('pagina de a 12 y refleja la página en la URL', async () => {
    const r = renderDir(mk());
    await people();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente →' }));
    await waitFor(() => expect(search(r).get('page')).toBe('2'));
    expect(await people()).toHaveLength(12);
    expect(screen.getByRole('heading', { level: 2, name: /página 2 de 3/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente →' }));
    expect(await people()).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
    r.navigate(-1);
    await waitFor(() => expect(search(r).get('page')).toBe('2'));
  });

  it('un ?page= fuera de rango se acota', async () => {
    renderDir(mk(), '/directory?page=99');
    expect(await people()).toHaveLength(8);
    expect(screen.getByRole('heading', { level: 2, name: /página 3 de 3/ })).toBeInTheDocument();
  });

  it('busca (con debounce) y lo refleja en la URL', async () => {
    const c = mk();
    const spy = vi.spyOn(c, 'searchProfiles');
    const r = renderDir(c);
    await people();
    const input = screen.getByLabelText('Buscar personas');
    await userEvent.type(input, 'camila');
    expect(search(r).get('q')).toBeNull(); // aún dentro del debounce
    await waitFor(() => expect(search(r).get('q')).toBe('camila'), { timeout: 2000 });
    const items = await waitFor(async () => { const i = await people(); expect(i.length).toBeLessThan(12); return i; });
    expect(within(items[0]).getByRole('heading', { level: 3 })).toHaveTextContent('Camila Ferreyra');
    expect(spy.mock.calls.some(([p]) => p?.q === 'camila')).toBe(true);
    expect(spy.mock.calls.some(([p]) => p?.q === 'cam')).toBe(false); // sin pedir por cada tecla
  });

  it('filtra por rol con conteos y aria-pressed, y por habilidad', async () => {
    const r = renderDir(mk());
    await people();
    const all = screen.getByRole('button', { name: /^Todos \(32\)$/ });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    const tutors = screen.getByRole('button', { name: /^Tutores \(\d+\)$/ });
    const nTutors = Number(/\((\d+)\)/.exec(tutors.textContent!)![1]);
    const nStudents = Number(/\((\d+)\)/.exec(screen.getByRole('button', { name: /^Alumnos/ }).textContent!)![1]);
    expect(nTutors + nStudents).toBe(32);
    await userEvent.click(tutors);
    await waitFor(() => expect(search(r).get('role')).toBe('operator'));
    expect(tutors).toHaveAttribute('aria-pressed', 'true');
    await liveText(new RegExp(`^${nTutors} personas$`));
    for (const li of await people()) expect(within(li).getByText('Tutor')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: 'Habilidad' });
    const chip = within(group).getAllByRole('button')[0];
    await userEvent.click(chip);
    await waitFor(() => expect(search(r).get('skill')).toBe(chip.textContent));
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(search(r).get('role')).toBe('operator');
    await userEvent.click(chip);
    await waitFor(() => expect(search(r).get('skill')).toBeNull());
  });

  it('el botón Atrás deshace filtros', async () => {
    const r = renderDir(mk());
    await people();
    await userEvent.click(screen.getByRole('button', { name: /^Alumnos/ }));
    await waitFor(() => expect(search(r).get('role')).toBe('student'));
    r.navigate(-1);
    await waitFor(() => expect(search(r).get('role')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: /^Todos/ })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('lee los filtros de la URL, incluido el orden por nombre', async () => {
    const r = renderDir(mk(), '/directory?role=student&sort=name');
    expect(screen.getByRole('button', { name: /^Alumnos/ })).toHaveAttribute('aria-pressed', 'true');
    const names = (await people()).map((li) => within(li).getByRole('heading', { level: 3 }).textContent!);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
    await userEvent.selectOptions(screen.getByLabelText('Orden'), 'relevance');
    await waitFor(() => expect(search(r).get('sort')).toBeNull());
  });

  it('sin resultados: mensaje y Limpiar filtros', async () => {
    const r = renderDir(mk(), '/directory?q=zzzzzz&role=student');
    expect(await screen.findByText('No encontramos personas con esos filtros')).toBeInTheDocument();
    await liveText(/Sin resultados/);
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await people()).toHaveLength(12);
    expect(search(r).toString()).toBe('');
    expect(screen.getByLabelText('Buscar personas')).toHaveValue('');
  });

  it('error con Reintentar', async () => {
    const base = mk();
    let fail = true;
    renderDir(mk({ searchProfiles: (p) => (fail ? Promise.reject(new ApiError(503, 'UNAVAILABLE', 'x')) : base.searchProfiles(p)) }));
    expect(await screen.findByText('No pudimos cargar el directorio. Intentá de nuevo.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await people()).toHaveLength(12);
  });

  it('muestra el estado de carga con aria-busy', () => {
    renderDir(mk());
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('no renderiza más de una página de tarjetas', async () => {
    renderDir(mk());
    await people();
    expect(document.querySelectorAll('.dir-card').length).toBeLessThanOrEqual(12);
  });

  it('la tarjeta cuenta rol, institución y hasta 3 habilidades', async () => {
    const one: ProfileSummary = { slug: 'ana-gomez', displayName: 'Ana Gómez', headline: 'Docente de redes', avatarUrl: '', role: 'operator', location: 'Rosario', topSkills: ['Redes', 'Linux', 'Python', 'Go'], institution: 'Instituto Demo' };
    renderDir(mk({ searchProfiles: async () => [one] }));
    const li = (await people())[0];
    expect(within(li).getByText('Tutor')).toBeInTheDocument();
    expect(within(li).getByText('Instituto Demo')).toBeInTheDocument();
    expect(within(li).getByText('Rosario')).toBeInTheDocument();
    expect(within(li).getByLabelText('Habilidades principales')).toHaveTextContent('Redes · Linux · Python');
    expect(within(li).getByRole('link')).toHaveAttribute('href', '/p/ana-gomez');
  });
});
