import { ApiError } from '../ApiClient';
import { clearSession, saveSession } from '../token';
import { createMockClient } from './MockApiClient';

const csv = (rows: string[], header = 'email') => new File([[header, ...rows].join('\n')], 'alumnos.csv', { type: 'text/csv' });
const mk = (sc: string[] = []) => createMockClient({ latencyMs: 0, scenarios: () => new Set(sc) });
const asOperator = () => saveSession({ token: 'mock:operador@demo.test', user: { name: 'Marcos Quiroga', role: 'operator' } });

beforeEach(() => { clearSession(); asOperator(); });

describe('createBatch', () => {
  const input = (file: File, key = 'k1') => ({ courseName: 'Curso Nuevo', completionDate: '2026-11-01', file, idempotencyKey: key });

  it('la misma Idempotency-Key no crea un lote nuevo; otro contenido da 409', async () => {
    const api = mk();
    const before = (await api.listBatches()).length;
    const a = await api.createBatch(input(csv(['alumno03@demo.test', 'alumno04@demo.test'])));
    const b = await api.createBatch(input(csv(['alumno03@demo.test', 'alumno04@demo.test'])));
    expect(b.batch_id).toBe(a.batch_id);
    expect(a.total).toBe(2);
    expect((await api.listBatches()).length).toBe(before + 1);
    await expect(api.createBatch(input(csv(['alumno05@demo.test'])))).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('informa los 4 motivos del CSV y no crea nada', async () => {
    const api = mk();
    const before = (await api.listBatches()).length;
    const rows = ['alumno03@demo.test', 'sin-arroba', 'alumno03@demo.test', 'nadie@demo.test', 'alumno01@demo.test'];
    const err = await api
      .createBatch({ courseName: 'Introducción a Criptografía Aplicada', completionDate: '2026-10-30', file: csv(rows), idempotencyKey: 'k2' })
      .then(() => { throw new Error('debía rechazar'); }, (e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.csvIssues.map((i: { reason: string }) => i.reason)).toEqual(['ALREADY_REQUESTED', 'INVALID_EMAIL', 'DUPLICATE_IN_FILE', 'NO_ACCOUNT', 'ALREADY_REQUESTED']);
    expect(err.csvIssues[1].row).toBe(2);
    expect((await api.listBatches()).length).toBe(before);
  });

  it('acepta columnas nombre+email', async () => {
    const r = await mk().createBatch({ courseName: 'X', completionDate: '2026-11-01', file: csv(['Ana,alumno10@demo.test'], 'nombre,email'), idempotencyKey: 'k3' });
    expect(r.total).toBe(1);
  });
});

describe('escenarios y datos', () => {
  it('lote #7 en curso con 48 alumnos y avanza con el tiempo', async () => {
    let t = 1_000_000;
    const api = createMockClient({ latencyMs: 0, scenarios: () => new Set(), now: () => t, stepMs: 1000 });
    const [first] = await api.listBatches();
    expect(first).toMatchObject({ total: 48, status: 'IN_PROGRESS' });
    const issued0 = first.counts.issued;
    t += 5000;
    expect((await api.getBatch(first.batch_id)).counts.issued).toBe(issued0 + 5);
  });

  it('401, red y 503 simulados', async () => {
    await expect(mk(['expired']).listBatches()).rejects.toMatchObject({ status: 401 });
    await expect(mk(['offline']).listBatches()).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(mk(['down']).listBatches()).rejects.toMatchObject({ status: 503 });
  });

  it('verificación: los 4 resultados', async () => {
    const api = mk();
    const certs = await (async () => { saveSession({ token: 'mock:alumno01@demo.test', user: { name: 'C', role: 'student' } }); return api.listMyCertificates(); })();
    expect(certs).toHaveLength(3);
    const id = certs[0].certificate_id;
    const pdf = (name: string) => new File(['x'], name, { type: 'application/pdf' });
    expect(await api.verifyFile(id, pdf('cert.pdf'))).toBe('VALID');
    expect(await api.verifyFile(id, pdf('cert-alterado.pdf'))).toBe('ALTERED');
    expect(await api.verifyFile('00000000-0000-4000-8000-000000000000', pdf('cert.pdf'))).toBe('NOT_FOUND');
    expect(await mk(['verify-unavailable']).verifyFile(id, pdf('cert.pdf'))).toBe('UNAVAILABLE');
    expect((await api.getPublicCertificate(id)).student_name).toBe('Camila Ferreyra');
  });

  it('descarga de PDF falla con pdf-fail', async () => {
    saveSession({ token: 'mock:alumno01@demo.test', user: { name: 'C', role: 'student' } });
    const [c] = await mk().listMyCertificates();
    await expect(mk(['pdf-fail']).downloadCertificatePdf(c.certificate_id)).rejects.toMatchObject({ status: 503 });
    expect((await mk().downloadCertificatePdf(c.certificate_id)).type).toBe('application/pdf');
  });
});
