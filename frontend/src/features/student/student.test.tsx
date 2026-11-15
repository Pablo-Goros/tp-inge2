import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiError, type ApiClient, type CertificateItem } from '../../api';
import { clearSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';
import { pdfFileName } from './downloadPdf';

const A: CertificateItem = { certificate_id: 'a', course_name: 'Redes y Seguridad I', completion_date: '2026-10-16', issued_at: '2026-11-02T10:00:00Z', institution: 'Instituto Demo' };
const B: CertificateItem = { certificate_id: 'b', course_name: 'Introducción a Criptografía Aplicada', completion_date: '2026-10-30', issued_at: '2026-11-14T13:20:00Z', institution: 'Instituto Demo' };
const C: CertificateItem = { certificate_id: 'c', course_name: 'Programación Segura en Python', completion_date: '2026-08-28', issued_at: '2026-09-09T09:00:00Z', institution: 'Instituto Demo' };

function fake(over: Partial<ApiClient> = {}): ApiClient {
  const nope = () => { throw new Error('no usado'); };
  return {
    login: nope, createBatch: nope, listBatches: nope, getBatch: nope, getPublicCertificate: nope, verifyFile: nope,
    listMyCertificates: vi.fn(async () => [A, B, C]),
    downloadCertificatePdf: vi.fn(async () => new Blob(['%PDF'], { type: 'application/pdf' })),
    ...over,
  } as ApiClient;
}

function renderPage(c: ApiClient) {
  saveSession({ token: 'tok', user: { name: 'Camila Ferreyra', role: 'student' } });
  const router = createMemoryRouter(buildRoutes(c), { initialEntries: ['/student/certificates'] });
  render(<RouterProvider router={router} />);
}
const cards = () => screen.getAllByRole('listitem');

let create: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.fn>;
let click: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clearSession();
  create = vi.fn(() => 'blob:x');
  revoke = vi.fn();
  URL.createObjectURL = create as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => click.mockRestore());

describe('lista', () => {
  it('muestra título, subtítulo, curso, institución y fechas; más recientes primero', async () => {
    renderPage(fake());
    expect(screen.getByRole('heading', { name: 'Mis certificados' })).toBeInTheDocument();
    expect(screen.getByText('Certificados emitidos a tu cuenta. Cada PDF incluye un QR para verificarlo.')).toBeInTheDocument();
    await screen.findByText('Redes y Seguridad I');
    const items = cards();
    expect(items.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Introducción a Criptografía Aplicada', 'Redes y Seguridad I', 'Programación Segura en Python',
    ]);
    const first = within(items[0]);
    expect(first.getByText('Certificado de finalización')).toBeInTheDocument();
    expect(first.getByText('Instituto Demo')).toBeInTheDocument();
    expect(first.getByText('30/10/2026')).toBeInTheDocument();
    expect(first.getByText('14/11/2026')).toBeInTheDocument();
    expect(first.getByRole('button', { name: /Descargar PDF/ })).toHaveTextContent('↓ Descargar PDF');
  });

  it('sin institution no muestra la fila', async () => {
    const { institution: _i, ...strict } = B;
    renderPage(fake({ listMyCertificates: vi.fn(async () => [strict]) }));
    await screen.findByText(B.course_name);
    expect(screen.queryByText('Institución')).not.toBeInTheDocument();
  });

  it('no hay elementos de operador ni mención a blockchain', async () => {
    renderPage(fake());
    await screen.findByText(B.course_name);
    expect(screen.queryByText(/Nuevo lote|Lotes/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /lote/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/blockchain/i);
  });

  it('cargando: skeleton con aria-busy', () => {
    renderPage(fake({ listMyCertificates: vi.fn(() => new Promise<CertificateItem[]>(() => {})) }));
    expect(screen.getByText('Cargando certificados…').closest('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('vacío', async () => {
    renderPage(fake({ listMyCertificates: vi.fn(async () => []) }));
    expect(await screen.findByText('Todavía no tenés certificados emitidos')).toBeInTheDocument();
    expect(screen.getByText('Cuando tu institución emita uno, va a aparecer acá.')).toBeInTheDocument();
  });

  it('error: Reintentar vuelve a pedir y muestra la lista', async () => {
    const list = vi.fn().mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'x')).mockResolvedValue([A]);
    renderPage(fake({ listMyCertificates: list }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar tus certificados. Intentá de nuevo.');
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText(A.course_name)).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('descarga', () => {
  it('pide el PDF una vez, dispara el guardado con nombre sensato y revoca la URL', async () => {
    const dl = vi.fn(async () => new Blob(['%PDF']));
    renderPage(fake({ downloadCertificatePdf: dl }));
    await screen.findByText(B.course_name);
    await userEvent.click(within(cards()[0]).getByRole('button'));
    expect(dl).toHaveBeenCalledTimes(1);
    expect(dl).toHaveBeenCalledWith('b');
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(1);
    const a = click.mock.contexts[0] as HTMLAnchorElement;
    expect(a.download).toBe('certificado-introduccion-a-criptografia-aplicada.pdf');
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:x'));
    expect(within(cards()[0]).getByRole('button')).toBeEnabled();
  });

  it('mientras descarga: botón deshabilitado, aria-busy; doble clic = una petición', async () => {
    let done!: (b: Blob) => void;
    const dl = vi.fn(() => new Promise<Blob>((r) => { done = r; }));
    renderPage(fake({ downloadCertificatePdf: dl }));
    await screen.findByText(B.course_name);
    const btn = within(cards()[0]).getByRole('button');
    await userEvent.dblClick(btn);
    expect(dl).toHaveBeenCalledTimes(1);
    const busy = within(cards()[0]).getByRole('button', { name: 'Descargando…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    done(new Blob(['x']));
    await waitFor(() => expect(within(cards()[0]).getByRole('button')).toBeEnabled());
  });

  it('fallo: error en esa tarjeta, las otras y la lista siguen, y se puede reintentar', async () => {
    const dl = vi.fn().mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'x')).mockResolvedValue(new Blob(['x']));
    renderPage(fake({ downloadCertificatePdf: dl }));
    await screen.findByText(B.course_name);
    await userEvent.click(within(cards()[2]).getByRole('button'));
    const alert = await within(cards()[2]).findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo descargar el PDF. Probá de nuevo.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(cards()).toHaveLength(3);
    expect(click).not.toHaveBeenCalled();
    const retry = within(cards()[2]).getByRole('button');
    expect(retry).toHaveTextContent('↻ Descargar PDF');
    await userEvent.click(retry);
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(dl).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it('pdfFileName: slug sin tildes', () => {
  expect(pdfFileName('Programación Segura en Python')).toBe('certificado-programacion-segura-en-python.pdf');
  expect(pdfFileName('???')).toBe('certificado-curso.pdf');
});
