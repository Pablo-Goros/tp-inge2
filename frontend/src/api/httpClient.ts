import { ApiError, type ApiClient, type ApiErrorCode } from './ApiClient';
import { getToken } from './token';
import type { LoginResponse, Role } from './types';

const BASE = '/api';
const CODES: ApiErrorCode[] = ['VALIDATION_ERROR', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'CONFLICT', 'UNAVAILABLE', 'HTTP_ERROR', 'INTERNAL_ERROR'];

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const e = body?.error;
    const code = CODES.includes(e?.code) ? (e.code as ApiErrorCode) : 'HTTP_ERROR';
    return new ApiError(res.status, code, e?.message ?? res.statusText, Array.isArray(e?.details) ? e.details : []);
  } catch {
    return new ApiError(res.status, 'HTTP_ERROR', res.statusText || 'Error HTTP');
  }
}

async function request(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = auth ? getToken() : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No pudimos conectar con el servidor.');
  }
  if (!res.ok) throw await toError(res);
  return res;
}

const json = async <T>(res: Response) => (await res.json()) as T;

/** Cliente HTTP fino hacia /api (docs/contracts.md §5). Sin probar contra el backend real. */
export const httpClient: ApiClient = {
  async login(email, password) {
    const res = await request('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    }, false);
    const b = await json<{ access_token: string; role: Role; name: string }>(res);
    return { token: b.access_token, user: { name: b.name, role: b.role } } satisfies LoginResponse;
  },
  async register(name, email, password) {
    const res = await request('/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }),
    }, false);
    const b = await json<{ access_token: string; role: Role; name: string }>(res);
    return { token: b.access_token, user: { name: b.name, role: b.role } } satisfies LoginResponse;
  },
  async createBatch({ courseName, completionDate, file, idempotencyKey }) {
    const form = new FormData();
    form.set('course_name', courseName);
    form.set('completion_date', completionDate);
    form.set('file', file);
    return json(await request('/batches', { method: 'POST', body: form, headers: { 'Idempotency-Key': idempotencyKey } }));
  },
  async listBatches() { return json(await request('/batches')); },
  async getBatch(id) { return json(await request(`/batches/${encodeURIComponent(id)}`)); },
  async listMyCertificates() { return json(await request('/me/certificates')); },
  async downloadCertificatePdf(id) { return (await request(`/certificates/${encodeURIComponent(id)}/pdf`)).blob(); },
  async getPublicCertificate(certId) { return json(await request(`/verify/${encodeURIComponent(certId)}`, {}, false)); },
  async verifyFile(certId, file) {
    const form = new FormData();
    form.set('file', file);
    try {
      const res = await request(`/verify/${encodeURIComponent(certId)}/file`, { method: 'POST', body: form }, false);
      return (await json<{ result: 'VALID' | 'ALTERED' | 'NOT_FOUND' }>(res)).result;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAVAILABLE') return 'UNAVAILABLE';
      throw e;
    }
  },

  // Perfiles. TODO(equipo): endpoints propuestos, el backend aún no los tiene (docs/frontend-api.md §Perfiles).
  async getMyProfile() { return json(await request('/me/profile')); },
  async updateMyProfile(patch) {
    return json(await request('/me/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }));
  },
  async uploadAvatar(file) {
    const form = new FormData();
    form.set('file', file);
    return json(await request('/me/profile/avatar', { method: 'POST', body: form }));
  },
  async getPublicProfile(slug) { return json(await request(`/profiles/${encodeURIComponent(slug)}`, {}, false)); },
  async searchProfiles(params = {}) {
    const q = new URLSearchParams();
    if (params.q) q.set('q', params.q);
    if (params.role) q.set('role', params.role);
    if (params.skill) q.set('skill', params.skill);
    if (params.page) q.set('page', String(params.page));
    const qs = q.toString();
    return json(await request(`/profiles${qs ? `?${qs}` : ''}`, {}, false));
  },
  async checkSlugAvailable(slug) {
    return (await json<{ available: boolean }>(await request(`/profiles/slug-available?slug=${encodeURIComponent(slug)}`))).available;
  },
  async getCertificateDetail(id) { return json(await request(`/certificates/${encodeURIComponent(id)}`)); },
};
