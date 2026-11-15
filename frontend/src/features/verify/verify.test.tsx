import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiError, type ApiClient, type PublicCertificate, type VerifyOutcome } from '../../api';
import { clearSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';

const CERT: PublicCertificate = {
  status: 'REGISTERED', certificate_id: 'c7f3a9e2', student_name: 'Camila Ferreyra', institution: 'Instituto Demo',
  course_name: 'Introducción a Criptografía Aplicada', completion_date: '2026-10-30', issued_at: '2026-11-14T13:20:00Z',
};
const SCOPE = 'Esta verificación comprueba que el archivo coincide con lo registrado por el emisor; no prueba que la persona haya aprobado el curso.';

function fake(over: Partial<ApiClient> = {}): ApiClient {
  const nope = () => { throw new Error('no usado'); };
  return {
    login: nope, createBatch: nope, listBatches: nope, getBatch: nope, listMyCertificates: nope, downloadCertificatePdf: nope,
    getPublicCertificate: vi.fn(async () => CERT),
    verifyFile: vi.fn(async (): Promise<VerifyOutcome> => 'VALID'),
    ...over,
  } as ApiClient;
}

function renderAt(path: string, c: ApiClient) {
  const router = createMemoryRouter(buildRoutes(c), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
const pdf = (name = 'certificado.pdf', size = 1000) => {
  const f = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const upload = (f: File) => userEvent.upload(screen.getByLabelText('Seleccionar archivo', { selector: 'input' }), f);

beforeEach(() => clearSession());

describe('datos registrados', () => {
  it('muestra los datos, el aviso y el alcance, sin email', async () => {
    renderAt('/verify/c7f3a9e2', fake({ getPublicCertificate: vi.fn(async () => ({ ...CERT, student_email: 'x@demo.test' }) as PublicCertificate) }));
    expect(screen.getByText('Cargando los datos registrados…').closest('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByText('Camila Ferreyra')).toBeInTheDocument();
    expect(screen.getByText('Instituto Demo')).toBeInTheDocument();
    expect(screen.getByText('30/10/2026')).toBeInTheDocument();
    expect(screen.getByText('14/11/2026')).toBeInTheDocument();
    expect(screen.getByText('c7f3a9e2')).toBeInTheDocument();
    expect(screen.getByText(/Estos son los datos registrados\. Para comprobar/)).toBeInTheDocument();
    expect(screen.getByText(SCOPE)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@|blockchain/i);
  });

  it('sin issued_at no muestra Emisión', async () => {
    const { issued_at: _omit, ...strict } = CERT;
    renderAt('/verify/c7f3a9e2', fake({ getPublicCertificate: vi.fn(async () => strict) }));
    await screen.findByText('Camila Ferreyra');
    expect(screen.queryByText('Emisión')).not.toBeInTheDocument();
  });

  it('id inexistente: Certificado no encontrado con el id', async () => {
    renderAt('/verify/zzz', fake({ getPublicCertificate: vi.fn(async () => { throw new ApiError(404, 'NOT_FOUND', 'x'); }) }));
    expect(await screen.findByText('Certificado no encontrado')).toBeInTheDocument();
    expect(screen.getByText('zzz')).toBeInTheDocument();
    expect(screen.getByText(SCOPE)).toBeInTheDocument();
  });

  it('503 al cargar: error con Reintentar que recupera', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'x'))
      .mockResolvedValue(CERT);
    renderAt('/verify/c7f3a9e2', fake({ getPublicCertificate: get }));
    await userEvent.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Camila Ferreyra')).toBeInTheDocument();
  });

  it('con el mock real y la API pública no se usa sesión: id desconocido da no encontrado', async () => {
    const { createMockClient } = await import('../../api/mock/MockApiClient');
    renderAt('/verify/no-existe', createMockClient({ latencyMs: 0, scenarios: () => new Set() }));
    expect(await screen.findByText('Certificado no encontrado')).toBeInTheDocument();
  });
});

describe('verificación de archivo', () => {
  async function run(outcome: VerifyOutcome | Error, name = 'certificado.pdf') {
    const verifyFile = vi.fn(async () => { if (outcome instanceof Error) throw outcome; return outcome; });
    renderAt('/verify/c7f3a9e2', fake({ verifyFile }));
    await screen.findByText('Camila Ferreyra');
    await upload(pdf(name));
    return verifyFile;
  }

  it('válido', async () => {
    const vf = await run('VALID');
    expect(await screen.findByRole('heading', { name: 'Válido' })).toBeInTheDocument();
    expect(vf).toHaveBeenCalledWith('c7f3a9e2', expect.any(File));
  });

  it('muestra Verificando… con el nombre mientras espera', async () => {
    let release!: (o: VerifyOutcome) => void;
    const verifyFile = vi.fn(() => new Promise<VerifyOutcome>((r) => { release = r; }));
    renderAt('/verify/c7f3a9e2', fake({ verifyFile }));
    await screen.findByText('Camila Ferreyra');
    await upload(pdf('mi.pdf'));
    const busy = (await screen.findByText('Verificando…')).closest('[aria-busy="true"]')!;
    expect(busy).toHaveTextContent('mi.pdf');
    release('VALID');
    await screen.findByRole('heading', { name: 'Válido' });
  });

  it('alterado pide el original (role alert)', async () => {
    await run('ALTERED', 'certificado_editado.pdf');
    const panel = (await screen.findByRole('heading', { name: 'Alterado' })).closest('[role="alert"]')!;
    expect(panel).toHaveTextContent('El archivo fue modificado. Subí el original emitido.');
    expect(panel).toHaveFocus();
  });

  it('no registrado', async () => {
    await run('NOT_FOUND');
    expect(await screen.findByRole('heading', { name: 'No registrado' })).toBeInTheDocument();
    expect(screen.getByText('Este archivo no está registrado.')).toBeInTheDocument();
  });

  it.each([
    ['UNAVAILABLE', 'UNAVAILABLE' as VerifyOutcome],
    ['NETWORK', new ApiError(0, 'NETWORK', 'x')],
    ['503', new ApiError(503, 'UNAVAILABLE', 'x')],
  ])('%s: No se pudo verificar y nunca Alterado', async (_n, o) => {
    await run(o);
    expect(await screen.findByRole('heading', { name: 'No se pudo verificar' })).toBeInTheDocument();
    expect(screen.queryByText('Alterado')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('rechaza no-.pdf y >5 MB sin llamar a la API', async () => {
    const verifyFile = vi.fn(async (): Promise<VerifyOutcome> => 'VALID');
    renderAt('/verify/c7f3a9e2', fake({ verifyFile }));
    await screen.findByText('Camila Ferreyra');
    const input = screen.getByLabelText('Seleccionar archivo', { selector: 'input' });
    await userEvent.upload(input, new File(['x'], 'foto.png', { type: 'image/png' }), { applyAccept: false });
    expect(await screen.findByText(/Solo se aceptan archivos \.pdf de hasta 5 MB\./)).toBeInTheDocument();
    await userEvent.upload(input, pdf('grande.pdf', 8.4 * 1024 * 1024));
    expect(await screen.findByText('Solo se aceptan archivos .pdf de hasta 5 MB. El archivo elegido pesa 8,4 MB.')).toBeInTheDocument();
    expect(verifyFile).not.toHaveBeenCalled();
  });

  it('Verificar otro archivo vuelve a la dropzone', async () => {
    await run('VALID');
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar otro archivo' }));
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Válido' })).not.toBeInTheDocument();
    expect(screen.getByText(SCOPE)).toBeInTheDocument();
  });

  it('el alcance está presente en todos los estados', async () => {
    await run('ALTERED');
    await screen.findByRole('heading', { name: 'Alterado' });
    expect(screen.getByText(SCOPE)).toBeInTheDocument();
  });
});

describe('/verify sin id', () => {
  it('pide el identificador y navega a /verify/:id', async () => {
    const router = renderAt('/verify', fake());
    expect(screen.getByText('Lo encontrás en el PDF o en el QR')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Identificador del certificado'), 'abc123');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar certificado' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/verify/abc123'));
  });
});

describe('llamadas públicas', () => {
  it('el cliente HTTP no manda Authorization en /verify', async () => {
    localStorage.clear();
    const { saveSession } = await import('../../api/token');
    saveSession({ token: 'secreto', user: { name: 'X', role: 'student' } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(CERT), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { httpClient } = await import('../../api/httpClient');
    await httpClient.getPublicCertificate('c7f3a9e2');
    await httpClient.verifyFile('c7f3a9e2', pdf());
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(new Headers(call[1].headers).has('Authorization')).toBe(false);
    }
    vi.unstubAllGlobals();
  });
});
