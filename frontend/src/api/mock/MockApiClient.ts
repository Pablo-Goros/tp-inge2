import { ApiError, type ApiClient, type CreateBatchInput, type CreateBatchResult } from '../ApiClient';
import { getToken } from '../token';
import type {
  BatchDetail, BatchItem, BatchStatus, BatchSummary, CertificateDetail, CertificateItem, CsvIssue, LoginResponse, Profile, ProfileSummary,
  PublicCertificate, Role, VerifyOutcome,
} from '../types';
import { isValidGrade, parseCsv, readText, REJECTED_SAMPLE, validateRows } from './csv';
import {
  DEMO_PASSWORD, INSTITUTION, normalizeCourse, seedBatches, studentEmail, studentName, USERS, type MockBatch, type MockUser,
} from './data';
import { AVATAR_MAX_BYTES, AVATAR_TYPES, toSquareDataUrl } from './avatarImage';
import { findByOwner, findBySlug, listProfiles, saveProfile, toPublic, validateProfile } from './profileStore';
import { isValidSlug, toSummary } from '../profileUtils';
import { readScenarios, type ScenarioSource } from './scenarios';

export interface MockOptions {
  /** Latencia base en ms (por defecto 350; el escenario `slow` la fija en 1500). */
  latencyMs?: number;
  scenarios?: ScenarioSource;
  /** Para tests: reloj inyectable. */
  now?: () => number;
  /** Ms por cada certificado que avanza en un lote en curso. */
  stepMs?: number;
}

const PAGE_SIZE = 12;
/** Fecha de hoy (YYYY-MM-DD) en America/Argentina/Buenos_Aires. */
const todayBuenosAires = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(ms));
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TOKEN_PREFIX = 'mock:';
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));
/** certificate_id determinista: los primeros 24 caracteres del lote + nº de alumno en 12 dígitos. */
const certId = (b: MockBatch, student: number) => b.id.slice(0, 24) + String(student).padStart(12, '0');

/** tx_hash simulado y determinista (0x + 64 hex) derivado del certificate_id. */
const mockTxHash = (id: string) =>
  '0x' + Array.from({ length: 32 }, (_, i) => ((id.charCodeAt(i % id.length) * 31 + i * 7) & 0xff).toString(16).padStart(2, '0')).join('');

export function createMockClient(opts: MockOptions = {}): ApiClient {
  const scenarios = opts.scenarios ?? readScenarios;
  const now = opts.now ?? Date.now;
  const stepMs = opts.stepMs ?? 1200;
  const batches: MockBatch[] = seedBatches(now());
  const idem = new Map<string, { fingerprint: string; result: CreateBatchResult }>();
  let frozenAt: number | null = null;
  const passwords = new Map<string, string>(); // cuentas creadas con register()

  const delay = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

  /** Pasos comunes: latencia, red caída, 503 global. */
  async function gate(opts2: { anonymous?: boolean } = {}) {
    const sc = scenarios();
    await delay(opts.latencyMs ?? (sc.has('slow') ? 1500 : 350));
    if (sc.has('offline')) throw new ApiError(0, 'NETWORK', 'No pudimos conectar con el servidor.');
    if (sc.has('down') && !opts2.anonymous) throw new ApiError(503, 'UNAVAILABLE', 'El servicio no está disponible por el momento.');
    return sc;
  }

  function auth(role: Role | 'any', sc: ReadonlySet<string>): MockUser {
    const token = getToken();
    const user = token?.startsWith(TOKEN_PREFIX) ? USERS.find((u) => u.email === token.slice(TOKEN_PREFIX.length)) : undefined;
    if (!user || sc.has('expired')) throw new ApiError(401, 'UNAUTHENTICATED', 'Falta el token o no es válido.');
    if (role !== 'any' && user.role !== role) throw new ApiError(403, 'FORBIDDEN', 'No tenés permiso para esta acción.');
    return user;
  }

  /** Avance del lote en el tiempo: cuántos no fallidos están emitidos ahora. */
  function issuedNow(b: MockBatch, sc: ReadonlySet<string>): number {
    const nonFailed = b.students.length - b.failed.length;
    if (!b.live) return Math.min(nonFailed, b.baseIssued);
    if (sc.has('frozen')) frozenAt ??= now(); else frozenAt = null;
    const t = (frozenAt ?? now()) - b.startedAt;
    return Math.min(nonFailed, b.baseIssued + Math.floor(t / stepMs));
  }

  function itemsOf(b: MockBatch, sc: ReadonlySet<string>): BatchItem[] {
    const issued = issuedNow(b, sc);
    let k = 0;
    return b.students.map((n, i): BatchItem => {
      const base = { certificate_id: certId(b, n), student_name: studentName(n), student_email: studentEmail(n), final_grade: b.grades?.[i] ?? null };
      if (b.failed.includes(i)) return { ...base, status: 'FAILED', attempts: 3, last_error: 'No se pudo generar el PDF.' };
      const rank = k++;
      if (rank < issued) return { ...base, status: 'ISSUED', attempts: 1, last_error: null, tx_hash: mockTxHash(base.certificate_id) };
      if (rank === issued) return { ...base, status: 'PROCESSING', attempts: 1, last_error: null };
      if (rank === issued + 1) return { ...base, status: 'PENDING', attempts: 1, last_error: null }; // reintento
      return { ...base, status: 'PENDING', attempts: 0, last_error: null };
    });
  }

  function countsOf(items: BatchItem[]) {
    const c = { total: items.length, pending: 0, processing: 0, issued: 0, failed: 0 };
    for (const it of items) c[it.status.toLowerCase() as 'pending' | 'processing' | 'issued' | 'failed']++;
    return c;
  }

  const statusOf = (c: ReturnType<typeof countsOf>): BatchStatus =>
    c.pending + c.processing > 0 ? 'IN_PROGRESS' : c.failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';

  function findCert(id: string, sc: ReadonlySet<string>) {
    for (const b of batches) {
      const item = itemsOf(b, sc).find((it) => it.certificate_id === id && it.status === 'ISSUED');
      if (item) return { b, item };
    }
    return undefined;
  }

  return {
    async login(email, password): Promise<LoginResponse> {
      await gate({ anonymous: true });
      const user = USERS.find((u) => u.email === email.trim().toLowerCase());
      if (!user || password !== (passwords.get(user.email) ?? DEMO_PASSWORD)) throw new ApiError(401, 'UNAUTHENTICATED', 'Email o contraseña incorrectos.');
      return { token: TOKEN_PREFIX + user.email, user: { name: user.name, role: user.role } };
    },

    async register(name, email, password): Promise<LoginResponse> {
      await gate({ anonymous: true });
      const e = email.trim().toLowerCase();
      if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || password.length < 8) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Solicitud inválida');
      }
      if (USERS.some((u) => u.email === e)) throw new ApiError(409, 'CONFLICT', 'Ya existe una cuenta con ese email');
      const user: MockUser = { email: e, name: name.trim(), role: 'student' };
      USERS.push(user);
      passwords.set(e, password);
      return { token: TOKEN_PREFIX + e, user: { name: user.name, role: user.role } };
    },

    async createBatch({ courseName, completionDate, file, idempotencyKey }: CreateBatchInput): Promise<CreateBatchResult> {
      const sc = await gate();
      auth('operator', sc);
      const course = courseName.trim();
      if (!course || course.length > 200) throw new ApiError(400, 'VALIDATION_ERROR', 'El nombre del curso debe tener entre 1 y 200 caracteres.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(completionDate)) throw new ApiError(400, 'VALIDATION_ERROR', 'La fecha debe tener formato AAAA-MM-DD.');
      if (completionDate > todayBuenosAires(now())) throw new ApiError(400, 'VALIDATION_ERROR', 'La fecha no puede ser futura.');
      const text = await readText(file);
      const fingerprint = [normalizeCourse(course), completionDate, text].join('\u0000');
      const prev = idem.get(idempotencyKey);
      if (prev) {
        if (prev.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Esa clave de idempotencia ya se usó con otro contenido.');
        return prev.result;
      }
      if (sc.has('csv-reject')) throw new ApiError(400, 'VALIDATION_ERROR', 'El CSV tiene filas con problemas.', REJECTED_SAMPLE);
      const rows = parseCsv(text);
      const emails = rows.map((r) => r.email);
      const key = normalizeCourse(course);
      const emailIssues = validateRows(
        emails,
        (e) => USERS.some((u) => u.role === 'student' && u.email === e),
        (e) => batches.some((b) => normalizeCourse(b.course) === key && b.date === completionDate && b.students.some((n) => studentEmail(n) === e)),
      );
      const gradeIssues: CsvIssue[] = rows.flatMap((r, i) => (r.grade && !isValidGrade(r.grade) ? [{ row: i + 1, email: r.email, reason: 'INVALID_GRADE' as const }] : []));
      const issues = [...gradeIssues, ...emailIssues].sort((a, b) => a.row - b.row); // como el backend: por fila
      if (issues.length) throw new ApiError(400, 'VALIDATION_ERROR', 'El CSV tiene filas con problemas.', issues);
      const batch: MockBatch = {
        id: uuid(), course, date: completionDate, created: new Date(now()).toISOString(),
        students: emails.map((e) => Number(e.slice(6, 8))), grades: rows.map((r) => (r.grade ? Number(r.grade) : null)), failed: [], baseIssued: 0, live: true, startedAt: now(),
      };
      batches.unshift(batch);
      const result: CreateBatchResult = { batch_id: batch.id, status: 'IN_PROGRESS', total: emails.length };
      idem.set(idempotencyKey, { fingerprint, result });
      return result;
    },

    async listBatches(): Promise<BatchSummary[]> {
      const sc = await gate();
      auth('operator', sc);
      if (sc.has('empty')) return [];
      return batches.map((b) => {
        const { total, ...counts } = countsOf(itemsOf(b, sc));
        return { batch_id: b.id, course_name: b.course, completion_date: b.date, status: statusOf({ total, ...counts }), total, counts, created_at: b.created };
      });
    },

    async getBatch(id): Promise<BatchDetail> {
      const sc = await gate();
      auth('operator', sc);
      const b = batches.find((x) => x.id === id);
      if (!b || sc.has('empty')) throw new ApiError(404, 'NOT_FOUND', 'No existe ese lote.');
      const items = itemsOf(b, sc);
      const counts = countsOf(items);
      const detail: BatchDetail = {
        batch_id: b.id, course_name: b.course, completion_date: b.date, status: statusOf(counts), counts, items,
        created_at: b.created,
      };
      if (sc.has('strict-contract')) delete detail.created_at;
      return detail;
    },

    async listMyCertificates(): Promise<CertificateItem[]> {
      const sc = await gate();
      const user = auth('student', sc);
      if (sc.has('empty')) return [];
      const mine: CertificateItem[] = [];
      for (const b of batches) {
        const it = itemsOf(b, sc).find((x) => x.student_email === user.email && x.status === 'ISSUED');
        if (!it) continue;
        const c: CertificateItem = { certificate_id: it.certificate_id, course_name: b.course, completion_date: b.date, issued_at: b.created, institution: INSTITUTION };
        if (sc.has('strict-contract')) delete c.institution;
        mine.push(c);
      }
      return mine.sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    },

    async downloadCertificatePdf(id): Promise<Blob> {
      const sc = await gate();
      const user = auth('any', sc);
      if (sc.has('pdf-fail')) throw new ApiError(503, 'UNAVAILABLE', 'No se pudo descargar el PDF.');
      const found = findCert(id, sc);
      if (!found || (user.role === 'student' && found.item.student_email !== user.email)) throw new ApiError(404, 'NOT_FOUND', 'No existe ese certificado.');
      const body = `%PDF-1.1\n% Certificado de demostración ${id}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
      return new Blob([body], { type: 'application/pdf' });
    },

    async getPublicCertificate(id): Promise<PublicCertificate> {
      const sc = await gate({ anonymous: true });
      if (sc.has('verify-unavailable')) throw new ApiError(503, 'UNAVAILABLE', 'El registro no responde.');
      const found = sc.has('verify-notfound') ? undefined : findCert(id, sc);
      if (!found) throw new ApiError(404, 'NOT_FOUND', 'Ese certificado no está registrado.');
      const out: PublicCertificate = {
        status: 'REGISTERED', certificate_id: id, student_name: found.item.student_name, institution: INSTITUTION,
        course_name: found.b.course, completion_date: found.b.date, issued_at: found.b.created,
      };
      if (sc.has('strict-contract')) delete out.issued_at;
      return out;
    },

    /** Por defecto: VALID, salvo que el nombre del archivo contenga "alterado"/"altered"; id desconocido → NOT_FOUND. */
    async verifyFile(id, file): Promise<VerifyOutcome> {
      const sc = await gate({ anonymous: true });
      if (file.size > 5 * 1024 * 1024) throw new ApiError(400, 'VALIDATION_ERROR', 'El archivo supera los 5 MB.');
      if (sc.has('verify-unavailable')) return 'UNAVAILABLE';
      if (sc.has('verify-notfound')) return 'NOT_FOUND';
      if (sc.has('verify-altered')) return 'ALTERED';
      if (sc.has('verify-valid')) return 'VALID';
      if (!findCert(id, sc)) return 'NOT_FOUND';
      return /alterad|altered/i.test(file.name) ? 'ALTERED' : 'VALID';
    },
    // ───────── Perfiles ─────────
    async getMyProfile(): Promise<Profile> {
      const sc = await gate();
      const user = auth('any', sc);
      if (sc.has('profile-fail')) throw new ApiError(503, 'UNAVAILABLE', 'No se pudo cargar tu perfil.');
      const mine = findByOwner(user.email);
      if (!mine) throw new ApiError(404, 'NOT_FOUND', 'Todavía no tenés perfil.');
      return mine.profile;
    },

    async updateMyProfile(patch): Promise<Profile> {
      const sc = await gate();
      const user = auth('any', sc);
      if (sc.has('profile-fail')) throw new ApiError(503, 'UNAVAILABLE', 'No se pudo guardar tu perfil.');
      const mine = findByOwner(user.email);
      if (!mine) throw new ApiError(404, 'NOT_FOUND', 'Todavía no tenés perfil.');
      // El rol y la cuenta no se editan desde el perfil.
      const next: Profile = { ...mine.profile, ...patch, role: mine.profile.role };
      if (typeof next.contactEmail === 'string') next.contactEmail = next.contactEmail.trim();
      if (!next.contactEmail) delete next.contactEmail;
      const changed = next.slug !== mine.profile.slug;
      const taken = changed && (sc.has('slug-taken') || listProfiles().some((p) => p.key !== mine.key && p.profile.slug === next.slug));
      const issues = validateProfile(next, false);
      if (taken) {
        if (isValidSlug(next.slug)) throw new ApiError(409, 'VALIDATION_ERROR', 'Ese enlace ya está en uso.', [{ field: 'slug', reason: 'SLUG_TAKEN' }]);
      }
      if (issues.length) throw new ApiError(400, 'VALIDATION_ERROR', 'El perfil tiene datos inválidos.', issues);
      saveProfile(mine.key, next);
      return next;
    },

    async uploadAvatar(file): Promise<{ avatarUrl: string }> {
      const sc = await gate();
      const user = auth('any', sc);
      if (sc.has('avatar-fail')) throw new ApiError(503, 'UNAVAILABLE', 'No se pudo subir la foto.');
      if (!AVATAR_TYPES.includes(file.type)) throw new ApiError(400, 'VALIDATION_ERROR', 'La foto debe ser JPG, PNG o WebP.', [{ field: 'file', reason: 'INVALID_TYPE' }]);
      if (file.size > AVATAR_MAX_BYTES) throw new ApiError(400, 'VALIDATION_ERROR', 'La foto supera los 2 MB.', [{ field: 'file', reason: 'TOO_LARGE' }]);
      const mine = findByOwner(user.email);
      if (!mine) throw new ApiError(404, 'NOT_FOUND', 'Todavía no tenés perfil.');
      const avatarUrl = await toSquareDataUrl(file, 512);
      saveProfile(mine.key, { ...mine.profile, avatarUrl });
      return { avatarUrl };
    },

    async getPublicProfile(slug): Promise<Profile> {
      const sc = await gate({ anonymous: true });
      if (sc.has('profile-fail')) throw new ApiError(503, 'UNAVAILABLE', 'No se pudo cargar el perfil.');
      const found = findBySlug(slug);
      if (!found) throw new ApiError(404, 'NOT_FOUND', 'No existe ese perfil.');
      return toPublic(found.profile);
    },

    async searchProfiles(params = {}): Promise<ProfileSummary[]> {
      const sc = await gate({ anonymous: true });
      if (sc.has('profile-fail')) throw new ApiError(503, 'UNAVAILABLE', 'No se pudo cargar el directorio.');
      if (sc.has('empty')) return [];
      const q = norm(params.q?.trim() ?? '');
      const skill = norm(params.skill?.trim() ?? '');
      const hits = listProfiles().map((p) => p.profile).filter((p) => {
        if (params.role && p.role !== params.role) return false;
        if (skill && !p.skills.some((s) => norm(s.name).includes(skill))) return false;
        if (!q) return true;
        const hay = norm([p.displayName, p.headline, p.location, ...p.skills.map((s) => s.name), ...(p.specialties ?? [])].join(' '));
        return q.split(/\s+/).every((w) => hay.includes(w));
      });
      const page = Math.max(1, params.page ?? 1);
      return hits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toSummary);
    },

    async checkSlugAvailable(slug): Promise<boolean> {
      const sc = await gate();
      const user = auth('any', sc);
      const mine = findByOwner(user.email);
      if (mine?.profile.slug === slug) return true;
      if (sc.has('slug-taken') || !isValidSlug(slug)) return false;
      return !findBySlug(slug);
    },

    async getCertificateDetail(id): Promise<CertificateDetail> {
      const sc = await gate();
      const user = auth('any', sc);
      const found = findCert(id, sc);
      if (!found || (user.role === 'student' && found.item.student_email !== user.email)) throw new ApiError(404, 'NOT_FOUND', 'No existe ese certificado.');
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const out: CertificateDetail = {
        certificate_id: id, course_name: found.b.course, completion_date: found.b.date, issued_at: found.b.created, institution: INSTITUTION,
        verifyUrl: `${origin}/verify/${id}`, student_name: found.item.student_name,
        sha256: (id.replace(/[^0-9a-f]/gi, '0') + '0'.repeat(64)).slice(0, 64).toLowerCase(), // TODO(equipo): hash real del PDF registrado
      };
      if (sc.has('strict-contract')) { delete out.institution; delete out.sha256; delete out.student_name; }
      return out;
    },
  };
}
