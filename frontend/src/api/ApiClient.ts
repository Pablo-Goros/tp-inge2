import type {
  BatchDetail, BatchSummary, CertificateDetail, CertificateItem, CsvIssue, LoginResponse, Profile, ProfileSearchParams, ProfileSummary,
  PublicCertificate, VerifyOutcome,
} from './types';

/** Códigos de error de docs/contracts.md §5, más 'NETWORK' (sin respuesta del servidor). */
export type ApiErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'IDEMPOTENCY_CONFLICT'
  | 'UNAVAILABLE' | 'HTTP_ERROR' | 'INTERNAL_ERROR' | 'NETWORK';

export class ApiError extends Error {
  /** Estado HTTP; 0 si no hubo respuesta (NETWORK). */
  readonly status: number;
  readonly code: ApiErrorCode;
  /** `error.details` del contrato. En VALIDATION_ERROR de POST /batches es CsvIssue[]. */
  readonly details: unknown[];

  constructor(status: number, code: ApiErrorCode, message: string, details: unknown[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  private issues(): CsvIssue[] {
    return this.code === 'VALIDATION_ERROR' ? (this.details as CsvIssue[]).filter((d) => d && typeof d === 'object' && 'row' in d) : [];
  }

  /** Filas con problema del CSV (row >= 1; solo en VALIDATION_ERROR de createBatch). */
  get csvIssues(): CsvIssue[] {
    return this.issues().filter((d) => d.row > 0);
  }

  /** Errores del archivo completo (row 0: UNKNOWN_COLUMN, EMPTY_FILE, FILE_TOO_LARGE…). */
  get csvFileIssues(): CsvIssue[] {
    return this.issues().filter((d) => d.row === 0);
  }
}

export interface CreateBatchInput {
  courseName: string;
  /** YYYY-MM-DD */
  completionDate: string;
  file: File;
  /** Se envía como cabecera Idempotency-Key. Reusar la misma clave al reintentar el mismo envío. */
  idempotencyKey: string;
}

export interface CreateBatchResult {
  batch_id: string;
  status: 'IN_PROGRESS';
  total: number;
}

/**
 * Contrato del frontend con el backend (docs/frontend-api.md). Las etapas 3-6 la consumen sin modificarla.
 * Todos los métodos rechazan con ApiError. El cliente toma el token de la sesión (src/api/token.ts).
 *
 * Notas de semántica:
 * - login: 401 → ApiError UNAUTHENTICATED.
 * - getPublicCertificate: 404 → NOT_FOUND, 503 → UNAVAILABLE (se lanzan).
 * - verifyFile: resuelve con los 4 resultados; el 503 del registro se devuelve como 'UNAVAILABLE'
 *   (no se lanza). Otros errores (red, 5xx) sí se lanzan.
 * - createBatch: 400 → VALIDATION_ERROR con `csvIssues`; 409 → IDEMPOTENCY_CONFLICT.
 */
export interface ApiClient {
  login(email: string, password: string): Promise<LoginResponse>;
  /** POST /auth/google con el ID token de Google. 401 → UNAUTHENTICATED (no cierra sesión); 404 → NOT_FOUND = email sin cuenta (ofrecer el alta). */
  loginWithGoogle(credential: string): Promise<LoginResponse>;
  /** POST /auth/google/signup: crea la cuenta de alumno (nunca operador) y devuelve el login. `name` opcional. */
  signupWithGoogle(credential: string, name?: string): Promise<LoginResponse>;
  createBatch(input: CreateBatchInput): Promise<CreateBatchResult>;
  listBatches(): Promise<BatchSummary[]>;
  getBatch(id: string): Promise<BatchDetail>;
  listMyCertificates(): Promise<CertificateItem[]>;
  downloadCertificatePdf(id: string): Promise<Blob>;
  getPublicCertificate(certId: string): Promise<PublicCertificate>;
  verifyFile(certId: string, file: File): Promise<VerifyOutcome>;

  // Perfiles (TODO(equipo): el backend aún no tiene estos endpoints; ver docs/frontend-api.md §Perfiles).
  /** Con sesión. */
  getMyProfile(): Promise<Profile>;
  /** Con sesión. Acepta un parche parcial o el perfil completo. 400 VALIDATION_ERROR (details: {field, reason}[]; slug repetido = 409). */
  updateMyProfile(patch: Partial<Profile>): Promise<Profile>;
  /** Con sesión. jpg/png/webp, máx. 2 MB; el servidor guarda la foto como avatar del perfil. */
  uploadAvatar(file: File): Promise<{ avatarUrl: string }>;
  /** PÚBLICO (sin token). 404 si no existe. Sin email de cuenta. */
  getPublicProfile(slug: string): Promise<Profile>;
  /** PÚBLICO (sin token). */
  searchProfiles(params?: ProfileSearchParams): Promise<ProfileSummary[]>;
  /** Con sesión. */
  checkSlugAvailable(slug: string): Promise<boolean>;
  /** Con sesión (alumno: solo los propios). */
  getCertificateDetail(id: string): Promise<CertificateDetail>;
}
