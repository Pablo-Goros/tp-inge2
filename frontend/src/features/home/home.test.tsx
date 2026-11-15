import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiError, type ApiClient } from '../../api';
import { createMockClient } from '../../api/mock/MockApiClient';
import { resetProfiles } from '../../api/mock/profileStore';
import { clearSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';

const student = { token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' as const } };
const tutor = { token: 'mock:operador@demo.test', user: { name: 'Marcos Quiroga', role: 'operator' as const } };
const mk = (over: Partial<ApiClient> = {}): ApiClient => ({ ...createMockClient({ latencyMs: 0, scenarios: () => new Set<string>() }), ...over }) as ApiClient;
const boom = () => Promise.reject(new ApiError(503, 'UNAVAILABLE', 'caído'));

function renderHome(c: ApiClient) {
  render(<RouterProvider router={createMemoryRouter(buildRoutes(c), { initialEntries: ['/home'] })} />);
}
const card = (name: string) => screen.getByRole('region', { name });
const clipboard = (writeText = vi.fn(async () => {})) => { Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }); return writeText; };

beforeEach(() => { clearSession(); resetProfiles(); URL.createObjectURL = vi.fn(() => 'blob:x') as never; URL.revokeObjectURL = vi.fn() as never; vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('Inicio de alumno', () => {
  it('saluda por nombre, un solo h1 y una tarjeta con h2 por sección', async () => {
    saveSession(student);
    renderHome(mk());
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Camila' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const t of ['Completitud del perfil', 'Certificados recientes', 'Tu perfil público', 'Atajos', 'Personas para conocer']) {
      expect(screen.getByRole('heading', { level: 2, name: t })).toBeInTheDocument();
    }
    expect(within(screen.getByRole('navigation', { name: 'Principal' })).getAllByRole('link')[0]).toHaveTextContent('Inicio');
    expect(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  });

  it('muestra esqueletos con aria-busy mientras carga', () => {
    saveSession(student);
    renderHome(mk());
    expect(card('Certificados recientes')).toHaveAttribute('aria-busy', 'true');
  });

  it('completitud con pasos que enlazan al editor, y perfil público con copiar', async () => {
    saveSession(student);
    const write = clipboard();
    renderHome(mk());
    const comp = within(card('Completitud del perfil'));
    expect(await comp.findByRole('progressbar', { name: 'Completitud del perfil' })).toBeInTheDocument();
    for (const a of comp.queryAllByRole('link')) expect(a.getAttribute('href')).toMatch(/^\/profile\/edit#/);
    const pub = within(card('Tu perfil público'));
    expect(await pub.findByRole('link', { name: '/p/camila-ferreyra' })).toHaveAttribute('href', '/p/camila-ferreyra');
    await userEvent.click(pub.getByRole('button', { name: 'Copiar enlace de tu perfil público' }));
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/p/camila-ferreyra`);
    expect(await pub.findByRole('status')).toHaveTextContent('Enlace copiado');
  });

  it('certificados recientes (hasta 3) con descargar PDF y detalle', async () => {
    saveSession(student);
    const c = mk();
    const spy = vi.spyOn(c, 'downloadCertificatePdf');
    renderHome(c);
    const certs = within(card('Certificados recientes'));
    await waitFor(() => expect(certs.getAllByRole('listitem').length).toBeGreaterThan(0));
    expect(certs.getAllByRole('listitem').length).toBeLessThanOrEqual(3);
    for (const a of certs.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/student/certificates/'))) expect(a.getAttribute('href')).toMatch(/^\/student\/certificates\/[^/]+$/);
    await userEvent.click(certs.getAllByRole('button', { name: /Descargar PDF/ })[0]);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('descarga fallida muestra el error en la tarjeta y se puede reintentar', async () => {
    saveSession(student);
    const c = mk();
    const spy = vi.spyOn(c, 'downloadCertificatePdf').mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'x'));
    renderHome(c);
    const certs = within(card('Certificados recientes'));
    await userEvent.click((await certs.findAllByRole('button', { name: /Descargar PDF/ }))[0]);
    expect(await certs.findByText('No se pudo descargar el PDF. Probá de nuevo.')).toBeInTheDocument();
    await userEvent.click(certs.getAllByRole('button', { name: /Reintentar descarga/ })[0]);
    await waitFor(() => expect(certs.queryByText('No se pudo descargar el PDF. Probá de nuevo.')).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('una tarjeta que falla no rompe las otras y se reintenta sola', async () => {
    saveSession(student);
    let fail = true;
    const base = mk();
    renderHome(mk({ listMyCertificates: () => (fail ? boom() : base.listMyCertificates()) }));
    const certs = within(card('Certificados recientes'));
    expect(await certs.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(await within(card('Completitud del perfil')).findByRole('progressbar')).toBeInTheDocument();
    expect(await within(card('Personas para conocer')).findAllByRole('link')).not.toHaveLength(0);
    fail = false;
    await userEvent.click(certs.getByRole('button', { name: /Reintentar/ }));
    await waitFor(() => expect(certs.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument());
    expect(certs.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('vacío amable sin certificados', async () => {
    saveSession(student);
    renderHome(mk({ listMyCertificates: async () => [] }));
    expect(await screen.findByText('Todavía no tenés certificados')).toBeInTheDocument();
  });

  it('personas para conocer: 4 perfiles sin vos, con habilidades en común', async () => {
    saveSession(student);
    renderHome(mk());
    const people = within(card('Personas para conocer'));
    await waitFor(() => expect(people.getAllByRole('listitem')).toHaveLength(4));
    expect(people.queryByRole('link', { name: /Camila Ferreyra/ })).not.toBeInTheDocument();
    for (const a of people.getAllByRole('listitem')) expect(within(a).getByRole('link').getAttribute('href')).toMatch(/^\/p\//);
  });

  it('si falla el directorio, solo esa tarjeta muestra error', async () => {
    saveSession(student);
    renderHome(mk({ searchProfiles: boom }));
    expect(await within(card('Personas para conocer')).findByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(await within(card('Completitud del perfil')).findByRole('progressbar')).toBeInTheDocument();
  });

  it('atajos', async () => {
    saveSession(student);
    renderHome(mk());
    const a = within(card('Atajos'));
    expect(a.getByRole('link', { name: 'Editar perfil' })).toHaveAttribute('href', '/profile/edit');
    expect(a.getByRole('link', { name: 'Ver mis certificados' })).toHaveAttribute('href', '/student/certificates');
    expect(a.getByRole('link', { name: 'Explorar el directorio' })).toHaveAttribute('href', '/directory');
  });
});

describe('Inicio de tutor', () => {
  it('saluda, destaca el lote en curso y calcula las estadísticas', async () => {
    saveSession(tutor);
    const c = mk();
    renderHome(c);
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Marcos' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '+ Nuevo lote' })).toHaveAttribute('href', '/operator/batches/new');
    const batches = await c.listBatches();
    const lotes = within(card('Lotes recientes'));
    await waitFor(() => expect(lotes.getAllByRole('link').length).toBeGreaterThan(1));
    expect(lotes.getAllByRole('link').length).toBeLessThanOrEqual(5);
    const live = batches.filter((b) => b.status === 'IN_PROGRESS');
    if (live.length) expect(lotes.getByText('Lote en curso')).toBeInTheDocument();
    const stats = card('Resumen de emisión');
    const val = (label: string) => within(stats).getByText(label).previousElementSibling!.textContent;
    await within(stats).findByText('Certificados emitidos');
    expect(val('Certificados emitidos')).toBe(String(batches.reduce((s, b) => s + b.counts.issued, 0)));
    expect(val('Lotes completados')).toBe(String(batches.filter((b) => b.status !== 'IN_PROGRESS').length));
    expect(val('Fallidos a revisar')).toBe(String(batches.reduce((s, b) => s + b.counts.failed, 0)));
    expect(stats.querySelectorAll('dl > div')).toHaveLength(3);
  });

  it('alumnos destacados: 4 alumnos del directorio', async () => {
    saveSession(tutor);
    renderHome(mk());
    const s = within(card('Alumnos destacados'));
    await waitFor(() => expect(s.getAllByRole('listitem')).toHaveLength(4));
  });

  it('error de lotes: fallan lotes y resumen, el resto sigue', async () => {
    saveSession(tutor);
    renderHome(mk({ listBatches: boom }));
    expect(await within(card('Lotes recientes')).findByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(await within(card('Resumen de emisión')).findByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(await within(card('Tu perfil público')).findByRole('link', { name: /^\/p\// })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Nuevo lote' })).toBeInTheDocument();
  });

  it('sin lotes: vacío con acción', async () => {
    saveSession(tutor);
    renderHome(mk({ listBatches: async () => [] }));
    const lotes = within(card('Lotes recientes'));
    expect(await lotes.findByText('Todavía no hay lotes')).toBeInTheDocument();
    expect(lotes.getByRole('link', { name: '+ Nuevo lote' })).toBeInTheDocument();
  });

  it('no pide los lotes cuando es alumno', async () => {
    saveSession(student);
    const c = mk();
    const spy = vi.spyOn(c, 'listBatches');
    renderHome(c);
    await screen.findByRole('heading', { level: 1, name: 'Hola, Camila' });
    expect(spy).not.toHaveBeenCalled();
  });
});
