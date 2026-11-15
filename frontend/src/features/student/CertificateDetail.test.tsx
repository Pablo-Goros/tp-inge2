import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiError, type ApiClient, type CertificateItem } from '../../api';
import { createMockClient } from '../../api/mock/MockApiClient';
import { resetProfiles } from '../../api/mock/profileStore';
import { clearSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';
import { encodeQr } from '../../lib/qr';

const student = { token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' as const } };
const mk = (over: Partial<ApiClient> = {}): ApiClient => ({ ...createMockClient({ latencyMs: 0, scenarios: () => new Set<string>() }), ...over }) as ApiClient;
const clipboard = () => { const writeText = vi.fn(async () => {}); Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }); return writeText; };

let c: ApiClient;
let cert: CertificateItem;
function renderDetail(id: string, client = c) {
  render(<RouterProvider router={createMemoryRouter(buildRoutes(client), { initialEntries: [`/student/certificates/${id}`] })} />);
}
const status = (re: RegExp) => waitFor(() => expect(screen.getAllByRole('status').some((e) => re.test(e.textContent ?? ''))).toBe(true));

beforeEach(async () => {
  clearSession(); resetProfiles();
  saveSession(student);
  c = mk();
  cert = (await c.listMyCertificates())[0];
  URL.createObjectURL = vi.fn(() => 'blob:x') as never; URL.revokeObjectURL = vi.fn() as never;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Detalle de certificado', () => {
  it('muestra la credencial con sus datos, estado, huella y aviso fijo', async () => {
    renderDetail(cert.certificate_id);
    expect(screen.getByRole('heading', { level: 1, name: 'Detalle del certificado' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: cert.course_name })).toBeInTheDocument();
    expect(screen.getByText('Verificable')).toBeInTheDocument();
    const dl = screen.getByText('Alumno', { selector: 'dt' }).closest('dl')!;
    expect(within(dl).getByText('Camila Ferreyra')).toBeInTheDocument();
    expect(within(dl).getByText('Instituto Demo')).toBeInTheDocument();
    expect(within(dl).getByText('Finalización').nextElementSibling).toHaveTextContent(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(within(dl).getByText('Emisión')).toBeInTheDocument();
    const id = within(dl).getByText(cert.certificate_id);
    expect(id.tagName).toBe('CODE');
    expect(within(dl).getByText('Huella SHA-256').nextElementSibling!.textContent).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.getByText('Esta credencial comprueba que el archivo coincide con lo registrado por el emisor; no prueba que la persona haya aprobado el curso.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir verificación pública' })).toHaveAttribute('href', `/verify/${cert.certificate_id}`);
    expect(screen.getByRole('link', { name: '← Mis certificados' })).toHaveAttribute('href', '/student/certificates');
  });

  it('sin huella en la respuesta, la fila se omite', async () => {
    renderDetail(cert.certificate_id, mk({ getCertificateDetail: async (id) => { const { sha256: _s, ...d } = await c.getCertificateDetail(id); return d; } }));
    await screen.findByRole('heading', { level: 2, name: cert.course_name });
    expect(screen.queryByText('Huella SHA-256')).not.toBeInTheDocument();
  });

  it('QR real: tamaño de módulos correcto y apunta a /verify/:id', async () => {
    renderDetail(cert.certificate_id);
    const svg = await screen.findByRole('img', { name: /Código QR/ });
    const url = `${window.location.origin}/verify/${cert.certificate_id}`;
    const qr = encodeQr(url);
    expect(Number(svg.getAttribute('data-modules'))).toBe(17 + 4 * qr.version);
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${qr.size + 8} ${qr.size + 8}`);
    expect(svg.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(100);
  });

  it('copia el identificador y el enlace de verificación con aviso aria-live', async () => {
    const write = clipboard();
    renderDetail(cert.certificate_id);
    await screen.findByRole('heading', { level: 2, name: cert.course_name });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace de verificación' }));
    expect(write).toHaveBeenLastCalledWith(`${window.location.origin}/verify/${cert.certificate_id}`);
    await status(/Enlace copiado/);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar identificador' }));
    expect(write).toHaveBeenLastCalledWith(cert.certificate_id);
    await status(/Identificador copiado/);
  });

  it('descarga el PDF; si falla muestra el error y permite reintentar', async () => {
    const spy = vi.spyOn(c, 'downloadCertificatePdf').mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'x'));
    renderDetail(cert.certificate_id);
    await screen.findByRole('heading', { level: 2, name: cert.course_name });
    await userEvent.click(screen.getByRole('button', { name: '↓ Descargar PDF' }));
    expect(await screen.findByText('No se pudo descargar el PDF. Probá de nuevo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '↻ Reintentar descarga' }));
    await waitFor(() => expect(screen.queryByText('No se pudo descargar el PDF. Probá de nuevo.')).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(cert.certificate_id);
  });

  it('destaca y quita el certificado del perfil (certificatesFeatured)', async () => {
    renderDetail(cert.certificate_id);
    await screen.findByRole('heading', { level: 2, name: cert.course_name });
    const before = (await c.getMyProfile()).certificatesFeatured.includes(cert.certificate_id);
    const on = await screen.findByRole('button', { name: before ? /Quitar de mi perfil/ : /Destacar en mi perfil/ });
    await userEvent.click(on);
    await status(before ? /Se quitó de tu perfil/ : /Ahora se muestra en tu perfil/);
    expect((await c.getMyProfile()).certificatesFeatured.includes(cert.certificate_id)).toBe(!before);
    await userEvent.click(await screen.findByRole('button', { name: before ? /Destacar en mi perfil/ : /Quitar de mi perfil/ }));
    await status(before ? /Ahora se muestra en tu perfil/ : /Se quitó de tu perfil/);
    expect((await c.getMyProfile()).certificatesFeatured.includes(cert.certificate_id)).toBe(before);
  });

  it('si falla guardar el perfil, avisa', async () => {
    renderDetail(cert.certificate_id, mk({ updateMyProfile: () => Promise.reject(new ApiError(503, 'UNAVAILABLE', 'x')) }));
    await userEvent.click(await screen.findByRole('button', { name: /mi perfil/ }));
    await status(/No se pudo actualizar tu perfil/);
  });

  it('404: "Certificado no encontrado" con vuelta a Mis certificados', async () => {
    renderDetail('no-existe');
    expect(await screen.findByText('Certificado no encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a Mis certificados' })).toHaveAttribute('href', '/student/certificates');
  });

  it('error con Reintentar y estado de carga', async () => {
    const real = mk();
    let fail = true;
    renderDetail(cert.certificate_id, mk({ getCertificateDetail: (id) => (fail ? Promise.reject(new ApiError(503, 'UNAVAILABLE', 'x')) : real.getCertificateDetail(id)) }));
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByText('No pudimos cargar el certificado. Intentá de nuevo.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('heading', { level: 2, name: cert.course_name })).toBeInTheDocument();
  });

  it('Mis certificados enlaza al detalle', async () => {
    render(<RouterProvider router={createMemoryRouter(buildRoutes(c), { initialEntries: ['/student/certificates'] })} />);
    const link = await screen.findByRole('link', { name: `Ver detalle de ${cert.course_name}` });
    expect(link).toHaveAttribute('href', `/student/certificates/${cert.certificate_id}`);
  });
});
