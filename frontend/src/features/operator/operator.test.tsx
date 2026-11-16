import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  ApiError, type ApiClient, type BatchDetail, type BatchItem, type BatchSummary, type CsvIssue,
} from '../../api';
import { clearSession, saveSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';
import { describeIssue } from './csvIssues';
import { parseDisplayDate } from './dates';

const nope = () => { throw new Error('no usado'); };
function fake(over: Partial<ApiClient> = {}): ApiClient {
  return {
    login: nope, listMyCertificates: nope, downloadCertificatePdf: nope, getPublicCertificate: nope, verifyFile: nope,
    createBatch: nope, listBatches: nope, getBatch: nope, ...over,
  } as ApiClient;
}
function renderAt(c: ApiClient, path: string) {
  saveSession({ token: 'tok', user: { name: 'Marcos Quiroga', role: 'operator' } });
  const router = createMemoryRouter(buildRoutes(c), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => clearSession());

const counts = (p: Partial<BatchDetail['counts']> = {}) => ({ total: 0, pending: 0, processing: 0, issued: 0, failed: 0, ...p });
const summary = (id: string, course: string, created: string, over: Partial<BatchSummary> = {}): BatchSummary => ({
  batch_id: id, course_name: course, completion_date: '2026-10-30', status: 'COMPLETED', total: 4,
  counts: { pending: 0, processing: 0, issued: 4, failed: 0 }, created_at: created, ...over,
});

describe('lista de lotes', () => {
  const list = [
    summary('1111-aaaa', 'Redes y Seguridad I', '2026-11-02T10:00:00Z'),
    summary('7f3a-bbbb', 'Introducción a Criptografía Aplicada', '2026-11-14T10:00:00Z', {
      status: 'IN_PROGRESS', total: 48, counts: { pending: 13, processing: 2, issued: 31, failed: 2 },
    }),
    summary('3333-cccc', 'Programación Segura en Python', '2026-09-09T10:00:00Z'),
  ];

  it('más recientes primero, con código corto y enlace al detalle', async () => {
    renderAt(fake({ listBatches: vi.fn(async () => list) }), '/operator/batches');
    expect(screen.getByRole('heading', { name: 'Lotes' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual([
      'Introducción a Criptografía Aplicada', 'Redes y Seguridad I', 'Programación Segura en Python',
    ]);
    const first = within(rows[0]);
    expect(first.getByText('#7F3A…')).toBeInTheDocument();
    expect(first.getByText('En curso')).toBeInTheDocument();
    expect(first.getByText('30/10/2026')).toBeInTheDocument();
    expect(first.getByText('14/11/2026')).toBeInTheDocument();
    expect(first.getByRole('link', { name: 'Introducción a Criptografía Aplicada' })).toHaveAttribute('href', '/operator/batches/7f3a-bbbb');
    expect(screen.getByRole('link', { name: '+ Nuevo lote' })).toHaveAttribute('href', '/operator/batches/new');
  });

  it('vacío', async () => {
    renderAt(fake({ listBatches: vi.fn(async () => []) }), '/operator/batches');
    expect(await screen.findByText('Todavía no hay lotes')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '+ Nuevo lote' })).toHaveLength(2);
  });

  it('error con reintento', async () => {
    const listBatches = vi.fn().mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'x')).mockResolvedValue(list);
    renderAt(fake({ listBatches }), '/operator/batches');
    expect(await screen.findByText('No se pudo cargar la lista de lotes. Revisá tu conexión e intentá de nuevo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(listBatches).toHaveBeenCalledTimes(2);
  });
});

describe('describeIssue / fechas', () => {
  it('textos en español de los motivos de fila y de archivo', () => {
    expect(describeIssue('NO_ACCOUNT')).toBe('No existe una cuenta de alumno con este email');
    expect(describeIssue('DUPLICATE_IN_FILE')).toBe('Email repetido en el archivo');
    expect(describeIssue('ALREADY_REQUESTED')).toBe('Ya existe un certificado para este alumno, curso y fecha');
    expect(describeIssue('INVALID_EMAIL')).toBe('Email mal formado');
    expect(describeIssue('INVALID_GRADE')).toBe('Nota final inválida (0-10, hasta dos decimales)');
    expect(describeIssue('UNKNOWN_COLUMN')).toBe('Columna no reconocida (solo email y final_grade)');
    expect(describeIssue('OTRO')).toBe('Problema en la fila');
    expect(describeIssue('OTRO', 0)).toBe('Problema en el archivo');
  });
  it('dd/mm/aaaa → YYYY-MM-DD, rechaza fechas inexistentes', () => {
    expect(parseDisplayDate('30/10/2026')).toBe('2026-10-30');
    expect(parseDisplayDate('1/2/2026')).toBe('2026-02-01');
    expect(parseDisplayDate('31/02/2026')).toBeNull();
    expect(parseDisplayDate('2026-10-30')).toBeNull();
  });
});

describe('nuevo lote', () => {
  const csv = (name = 'alumnos.csv', rows = 2) =>
    new File([['email', ...Array.from({ length: rows }, (_, i) => `a${i}@demo.test`)].join('\n')], name, { type: 'text/csv' });
  const user = () => userEvent.setup({ applyAccept: false });
  const ISSUES: CsvIssue[] = [
    { row: 3, email: 'ana@x.com', reason: 'NO_ACCOUNT' }, { row: 11, email: 'tomas@x.com', reason: 'DUPLICATE_IN_FILE' },
    { row: 17, email: 'lucia@x.com', reason: 'ALREADY_REQUESTED' }, { row: 23, email: 'mariana@x', reason: 'INVALID_EMAIL' },
  ];

  async function fill(u: ReturnType<typeof user>, file: File = csv()) {
    await u.type(screen.getByLabelText('Nombre del curso'), 'Redes y Seguridad I');
    await u.type(screen.getByLabelText('Fecha de finalización'), '30/10/2026');
    await u.upload(screen.getByLabelText('Archivo CSV'), file);
    await screen.findByText(file.name);
  }
  const submit = (u: ReturnType<typeof user>) => u.click(screen.getByRole('button', { name: /Emitir certificados|Reintentar/ }));
  const keys = (m: ReturnType<typeof vi.fn>) => (m.mock.calls as { idempotencyKey: string }[][]).map((c) => c[0].idempotencyKey);

  it('valida obligatorios sin llamar a la API', async () => {
    const createBatch = vi.fn();
    renderAt(fake({ createBatch }), '/operator/batches/new');
    await user().click(screen.getByRole('button', { name: 'Emitir certificados' }));
    expect(screen.getByText('Ingresá el nombre del curso.')).toBeInTheDocument();
    expect(screen.getByText('Ingresá la fecha de finalización.')).toBeInTheDocument();
    expect(screen.getByText('Elegí un archivo CSV.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del curso')).toHaveFocus();
    expect(createBatch).not.toHaveBeenCalled();
  });

  it('muestra ayuda de formato, enlace al CSV de ejemplo y valida extensión y filas', async () => {
    renderAt(fake({ createBatch: vi.fn() }), '/operator/batches/new');
    expect(screen.getByText('Formato dd/mm/aaaa.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar CSV de ejemplo' })).toHaveAttribute('download');
    const u = user();
    await u.upload(screen.getByLabelText('Archivo CSV'), csv('datos.txt'));
    expect(await screen.findByText('El archivo debe ser .csv')).toBeInTheDocument();
    await u.upload(screen.getByLabelText('Archivo CSV'), csv('mucho.csv', 101));
    expect(await screen.findByText('El archivo supera las 100 filas')).toBeInTheDocument();
  });

  it('fecha inválida no llama a la API', async () => {
    const createBatch = vi.fn();
    renderAt(fake({ createBatch }), '/operator/batches/new');
    const u = user();
    await u.type(screen.getByLabelText('Fecha de finalización'), '31/02/2026');
    await submit(u);
    expect(screen.getByText('Ingresá una fecha válida con formato dd/mm/aaaa.')).toBeInTheDocument();
    expect(createBatch).not.toHaveBeenCalled();
  });

  it('doble clic = una sola petición; envía la fecha como YYYY-MM-DD y muestra el estado de envío', async () => {
    let resolve!: (v: { batch_id: string; status: 'IN_PROGRESS'; total: number }) => void;
    const createBatch = vi.fn((_: unknown) => new Promise<{ batch_id: string; status: 'IN_PROGRESS'; total: number }>((r) => { resolve = r; }));
    renderAt(fake({ createBatch, getBatch: vi.fn(async () => detail([])) }), '/operator/batches/new');
    const u = user();
    await fill(u);
    const btn = screen.getByRole('button', { name: 'Emitir certificados' });
    fireEvent.submit(btn.closest('form')!);
    fireEvent.submit(btn.closest('form')!);
    expect(screen.getByRole('button', { name: 'Emitiendo…' })).toBeDisabled();
    expect(screen.getByText('Enviando 2 alumnos. No cierres esta página.')).toBeInTheDocument();
    expect(createBatch).toHaveBeenCalledTimes(1);
    expect(createBatch.mock.calls[0][0]).toMatchObject({ courseName: 'Redes y Seguridad I', completionDate: '2026-10-30' });
    await act(async () => resolve({ batch_id: 'b1', status: 'IN_PROGRESS', total: 2 }));
  });

  it('éxito navega al detalle', async () => {
    const createBatch = vi.fn(async () => ({ batch_id: 'b1', status: 'IN_PROGRESS' as const, total: 2 }));
    const router = renderAt(fake({ createBatch, getBatch: vi.fn(async () => detail([])) }), '/operator/batches/new');
    const u = user();
    await fill(u);
    await submit(u);
    await waitFor(() => expect(router.state.location.pathname).toBe('/operator/batches/b1'));
  });

  it('error de red conserva datos y reusa la misma clave en cada reintento', async () => {
    const createBatch = vi.fn()
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'x'))
      .mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'x'))
      .mockResolvedValue({ batch_id: 'b1', status: 'IN_PROGRESS', total: 2 });
    renderAt(fake({ createBatch, getBatch: vi.fn(async () => detail([])) }), '/operator/batches/new');
    const u = user();
    await fill(u);
    await submit(u);
    expect(await screen.findByText('No se pudo enviar el lote')).toBeInTheDocument();
    expect(screen.getByText('Hubo un problema de conexión. Lo que cargaste se conserva; no se emitió nada todavía.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del curso')).toHaveValue('Redes y Seguridad I');
    await submit(u); // "↻ Reintentar"
    await screen.findByText('No se pudo enviar el lote');
    await submit(u);
    await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(3));
    const k = keys(createBatch);
    expect(k[0]).toBe(k[1]);
    expect(k[1]).toBe(k[2]);
    expect(k[0]).toMatch(/.{8,}/);
  });

  it('cambiar un campo o el archivo regenera la clave', async () => {
    const createBatch = vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK', 'x'));
    renderAt(fake({ createBatch }), '/operator/batches/new');
    const u = user();
    await fill(u);
    await submit(u);
    await screen.findByText('No se pudo enviar el lote');
    await u.type(screen.getByLabelText('Nombre del curso'), '!');
    await submit(u);
    await screen.findByText('No se pudo enviar el lote');
    await u.upload(screen.getByLabelText('Archivo CSV'), csv('otro.csv', 3));
    await screen.findByText('otro.csv');
    await submit(u);
    await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(3));
    expect(new Set(keys(createBatch)).size).toBe(3);
  });

  it('CSV rechazado: lista las 4 filas con su motivo y no navega', async () => {
    const createBatch = vi.fn().mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'x', ISSUES));
    const router = renderAt(fake({ createBatch }), '/operator/batches/new');
    const u = user();
    await fill(u, csv('alumnos.csv', 48));
    await submit(u);
    expect(await screen.findByText('Se rechazó el archivo completo, no se emitió nada')).toBeInTheDocument();
    expect(screen.getByText('4 de 48 filas tienen problemas. Corregí el archivo, elegí otro archivo y reenviá.')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Filas con problemas' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['3', 'ana@x.com', 'No existe una cuenta de alumno con este email'],
      ['11', 'tomas@x.com', 'Email repetido en el archivo'],
      ['17', 'lucia@x.com', 'Ya existe un certificado para este alumno, curso y fecha'],
      ['23', 'mariana@x', 'Email mal formado'],
    ]);
    expect(screen.getByRole('button', { name: 'Elegir otro archivo' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/operator/batches/new');
  });

  it('error de archivo (row 0): muestra un Alert con el motivo y no la tabla "N de M filas"', async () => {
    const createBatch = vi.fn().mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'CSV inválido', [{ row: 0, reason: 'UNKNOWN_COLUMN' }]));
    renderAt(fake({ createBatch }), '/operator/batches/new');
    const u = user();
    await fill(u, csv('alumnos.csv', 5));
    await submit(u);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Columna no reconocida (solo email y final_grade)');
    expect(screen.queryByRole('table', { name: 'Filas con problemas' })).not.toBeInTheDocument();
    expect(screen.queryByText(/filas tienen problemas/)).not.toBeInTheDocument();
  });

  it('fecha futura no llama a la API', async () => {
    const createBatch = vi.fn();
    renderAt(fake({ createBatch }), '/operator/batches/new');
    const u = user();
    await u.type(screen.getByLabelText('Nombre del curso'), 'Curso');
    await u.type(screen.getByLabelText('Fecha de finalización'), '01/01/2999');
    await u.upload(screen.getByLabelText('Archivo CSV'), csv());
    await screen.findByText('alumnos.csv');
    await submit(u);
    expect(screen.getByText('La fecha no puede ser futura.')).toBeInTheDocument();
    expect(createBatch).not.toHaveBeenCalled();
  });

  it('valida el archivo: más de 1 MB, sin filas de datos y línea vacía intermedia', async () => {
    renderAt(fake({ createBatch: vi.fn() }), '/operator/batches/new');
    const u = user();
    const big = new File(['email\n'], 'grande.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 1_048_577 });
    await u.upload(screen.getByLabelText('Archivo CSV'), big);
    expect(await screen.findByText('El archivo supera 1 MB')).toBeInTheDocument();
    await u.upload(screen.getByLabelText('Archivo CSV'), new File(['email\n'], 'vacio.csv', { type: 'text/csv' }));
    expect(await screen.findByText('El archivo no tiene filas de datos')).toBeInTheDocument();
    await u.upload(screen.getByLabelText('Archivo CSV'), new File(['email\na@x.com\n\nb@x.com\n'], 'huecos.csv', { type: 'text/csv' }));
    expect(await screen.findByText(/3 filas/)).toBeInTheDocument();
  });

  it('409 IDEMPOTENCY_CONFLICT muestra un mensaje claro', async () => {
    renderAt(fake({ createBatch: vi.fn().mockRejectedValue(new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'x')) }), '/operator/batches/new');
    const u = user();
    await fill(u);
    await submit(u);
    expect(await screen.findByText('Este envío ya se había hecho con otros datos')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('no emitió nada con este intento');
  });
});

// ---------------- detalle ----------------
const item = (n: number, status: BatchItem['status'], over: Partial<BatchItem> = {}): BatchItem => ({
  certificate_id: `cert-${n}-aaaaaaaaaaaa`, student_name: `Alumno ${n}`, student_email: `a${n}@demo.test`, status, attempts: 0, last_error: null, ...over,
});
function detail(items: BatchItem[], status: BatchDetail['status'] = 'IN_PROGRESS', over: Partial<BatchDetail> = {}): BatchDetail {
  const c = counts({ total: items.length });
  items.forEach((i) => { c[i.status.toLowerCase() as 'pending'] += 1; });
  return { batch_id: '7f3a-bbbb', course_name: 'Introducción a Cripto', completion_date: '2026-10-30', status, counts: c, items, ...over };
}
const MIXED = [
  item(1, 'ISSUED', { attempts: 1 }), item(2, 'PENDING'), item(3, 'FAILED', { attempts: 3, last_error: 'No se pudo generar el PDF' }),
  item(4, 'PROCESSING', { attempts: 1 }), item(5, 'PENDING', { attempts: 2, last_error: 'Tiempo de espera agotado' }),
];
const tableNames = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => r.textContent ?? '');

describe('detalle de lote', () => {
  it('encabezado, contadores, fallidos primero con separador, intentos y errores', async () => {
    renderAt(fake({ getBatch: vi.fn(async () => detail(MIXED, 'IN_PROGRESS', { created_at: '2026-11-14T10:00:00Z' })) }), '/operator/batches/7f3a-bbbb');
    expect(await screen.findByRole('heading', { name: 'Introducción a Cripto' })).toBeInTheDocument();
    expect(screen.getByText('Lote #7F3A… · finalización 30/10/2026 · creado 14/11/2026')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
    expect(screen.getByText('El progreso se actualiza solo mientras tengas abierta esta página.')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('1 emitidos, 1 fallidos, 1 procesando, 2 pendientes de 5');
    const rows = tableNames();
    expect(rows[0]).toContain('Cola de fallidos · 1');
    expect(rows[1]).toContain('Alumno 3');
    expect(rows[1]).toContain('3/3');
    expect(rows[1]).toContain('No se pudo generar el PDF');
    expect(rows[2]).toContain('Alumno 5');
    expect(rows[2]).toContain('Reintento 2/3');
    expect(rows[3]).toContain('Alumno 4');
    expect(rows[4]).toContain('Alumno 1');
    expect(rows[4]).toContain('aaaaaaaa');
    expect(rows[5]).toContain('Alumno 2');
  });

  it('columna Nota: 2 decimales o "—" si falta', async () => {
    const items = [item(1, 'ISSUED', { attempts: 1, final_grade: 9.5 }), item(2, 'PENDING', { final_grade: null })];
    renderAt(fake({ getBatch: vi.fn(async () => detail(items)) }), '/operator/batches/7f3a-bbbb');
    await screen.findByRole('table');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Nota' })).toBeInTheDocument();
    const cells = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[3]?.textContent);
    expect(cells).toEqual(['9.50', '—']);
  });

  it('copiar en un certificado emitido copia el enlace de la transacción; sin tx_hash copia el identificador', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const tx = '0x' + 'ab'.repeat(32);
    const items = [item(1, 'ISSUED', { attempts: 1, tx_hash: tx }), item(2, 'ISSUED', { attempts: 1 })];
    renderAt(fake({ getBatch: vi.fn(async () => detail(items)) }), '/operator/batches/7f3a-bbbb');
    await screen.findByRole('table');
    await userEvent.click(screen.getAllByRole('button', { name: `Copiar enlace de la transacción ${tx}` })[0]);
    expect(write).toHaveBeenLastCalledWith(`https://etherscan.io/tx/${tx}`);
    await userEvent.click(screen.getAllByRole('button', { name: 'Copiar identificador cert-2-aaaaaaaaaaaa' })[0]);
    expect(write).toHaveBeenLastCalledWith('cert-2-aaaaaaaaaaaa');
  });

  it('sin created_at no muestra "creado"', async () => {
    renderAt(fake({ getBatch: vi.fn(async () => detail(MIXED)) }), '/operator/batches/7f3a-bbbb');
    expect(await screen.findByText('Lote #7F3A… · finalización 30/10/2026')).toBeInTheDocument();
  });

  it('filtros con conteos y aria-pressed', async () => {
    renderAt(fake({ getBatch: vi.fn(async () => detail(MIXED)) }), '/operator/batches/7f3a-bbbb');
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Todos (5)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Fallidos (1)' }));
    expect(screen.getByRole('button', { name: 'Fallidos (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(tableNames()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pendientes (2)' }));
    expect(tableNames()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Emitidos (1)' }));
    expect(tableNames()[0]).toContain('Alumno 1');
  });

  it('completado con errores: aviso final con role=status y sin polling', async () => {
    const getBatch = vi.fn(async () => detail([item(1, 'ISSUED', { attempts: 1 }), item(2, 'FAILED', { attempts: 3, last_error: 'x' })], 'COMPLETED_WITH_ERRORS'));
    renderAt(fake({ getBatch }), '/operator/batches/7f3a-bbbb');
    const note = await screen.findByText('1 certificado no pudo emitirse; el resto se emitió.');
    expect(note.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByText(/El progreso se actualiza solo/)).not.toBeInTheDocument();
  });

  it('404: "Lote no encontrado" con botón para volver', async () => {
    renderAt(fake({ getBatch: vi.fn().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x')) }), '/operator/batches/nada');
    expect(await screen.findByText('Lote no encontrado')).toBeInTheDocument();
    expect(screen.getByText('El lote no existe o el enlace es incorrecto.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a lotes' })).toHaveAttribute('href', '/operator/batches');
  });

  it('error de carga inicial: ErrorState con reintento', async () => {
    const getBatch = vi.fn().mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'x')).mockResolvedValue(detail(MIXED, 'COMPLETED'));
    renderAt(fake({ getBatch }), '/operator/batches/7f3a-bbbb');
    expect(await screen.findByText('No se pudo cargar el lote. Revisá tu conexión e intentá de nuevo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  it('consulta cada 2 s y se detiene en COMPLETED', async () => {
    const getBatch = vi.fn()
      .mockResolvedValueOnce(detail([item(1, 'PENDING')]))
      .mockResolvedValueOnce(detail([item(1, 'PROCESSING', { attempts: 1 })]))
      .mockResolvedValue(detail([item(1, 'ISSUED', { attempts: 1 })], 'COMPLETED'));
    renderAt(fake({ getBatch }), '/operator/batches/7f3a-bbbb');
    await advance(0);
    expect(getBatch).toHaveBeenCalledTimes(1);
    await advance(1999);
    expect(getBatch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(getBatch).toHaveBeenCalledTimes(2);
    await advance(2000);
    expect(getBatch).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Completado')).toBeInTheDocument();
    await advance(10000);
    expect(getBatch).toHaveBeenCalledTimes(3);
  });

  it('se detiene en COMPLETED_WITH_ERRORS', async () => {
    const getBatch = vi.fn()
      .mockResolvedValueOnce(detail([item(1, 'PROCESSING')]))
      .mockResolvedValue(detail([item(1, 'FAILED', { attempts: 3 })], 'COMPLETED_WITH_ERRORS'));
    renderAt(fake({ getBatch }), '/operator/batches/7f3a-bbbb');
    await advance(0);
    await advance(2000);
    await advance(20000);
    expect(getBatch).toHaveBeenCalledTimes(2);
  });

  it('no solapa peticiones: espera a que termine la anterior', async () => {
    let release!: () => void;
    const getBatch = vi.fn()
      .mockResolvedValueOnce(detail([item(1, 'PENDING')]))
      .mockImplementationOnce(() => new Promise((r) => { release = () => r(detail([item(1, 'PENDING')])); }))
      .mockResolvedValue(detail([item(1, 'PENDING')]));
    renderAt(fake({ getBatch }), '/operator/batches/7f3a-bbbb');
    await advance(0);
    await advance(2000); // arranca la 2.ª, que queda colgada
    await advance(10000);
    expect(getBatch).toHaveBeenCalledTimes(2);
    release();
    await advance(0);
    await advance(2000);
    expect(getBatch).toHaveBeenCalledTimes(3);
  });

  it('se detiene al desmontar', async () => {
    const getBatch = vi.fn(async () => detail([item(1, 'PENDING')]));
    const router = renderAt(fake({ getBatch }), '/operator/batches/7f3a-bbbb');
    await advance(0);
    await advance(2000);
    expect(getBatch).toHaveBeenCalledTimes(2);
    await act(async () => { await router.navigate('/operator/batches/new'); });
    await advance(10000);
    expect(getBatch).toHaveBeenCalledTimes(2);
  });

  it('si un refresco falla conserva los datos, avisa y sigue reintentando', async () => {
    const getBatch = vi.fn()
      .mockResolvedValueOnce(detail(MIXED))
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'x'))
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'x'))
      .mockResolvedValue(detail(MIXED, 'COMPLETED'));
    renderAt(fake({ getBatch }), '/operator/batches/7f3a-bbbb');
    await advance(0);
    await advance(2000);
    expect(screen.getByText(/No se pudo actualizar\. Mostrando datos de hace \d+ s · reintentando…/)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Alumno 3', { selector: 'td' })).toBeInTheDocument();
    await advance(2000);
    expect(getBatch).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/No se pudo actualizar/)).toBeInTheDocument();
    await advance(2000);
    expect(getBatch).toHaveBeenCalledTimes(4);
    expect(screen.queryByText(/No se pudo actualizar/)).not.toBeInTheDocument();
  });
});
