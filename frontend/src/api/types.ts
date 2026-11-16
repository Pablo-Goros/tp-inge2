// Tipos según docs/contracts.md §5. Ver docs/frontend-api.md. `institution?`, `issued_at?`, `created_at?` y `sha256?` están confirmados como ausentes en main; el frontend los trata como opcionales.
export type Role = 'operator' | 'student';

export interface SessionUser {
  name: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export type CertStatus = 'PENDING' | 'PROCESSING' | 'ISSUED' | 'FAILED';
export type BatchStatus = 'IN_PROGRESS' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS';

export interface BatchCounts {
  total?: number;
  pending: number;
  processing: number;
  issued: number;
  failed: number;
}

export interface BatchSummary {
  batch_id: string;
  course_name: string;
  completion_date: string; // YYYY-MM-DD
  status: BatchStatus;
  total: number;
  counts: BatchCounts;
  created_at: string;
}

export interface BatchItem {
  certificate_id: string;
  student_name: string;
  student_email: string;
  status: CertStatus;
  attempts: number;
  last_error: string | null;
  /** Nota final 0-10 (backend: BatchItem.final_grade); null o ausente si no se cargó. */
  final_grade?: number | null;
  /** Hash de la transacción simulada de emisión (solo ISSUED). TODO(equipo): el backend aún no lo expone. */
  tx_hash?: string | null;
}

export interface BatchDetail {
  batch_id: string;
  course_name: string;
  completion_date: string;
  status: BatchStatus;
  counts: Required<BatchCounts>;
  items: BatchItem[];
  created_at?: string; // confirmado ausente en main (no está en contracts §5)
}

/** Motivos por fila (row >= 1). */
export type CsvIssueReason =
  | 'NO_ACCOUNT' | 'DUPLICATE_IN_FILE' | 'ALREADY_REQUESTED' | 'INVALID_EMAIL' | 'EMPTY_ROW' | 'INVALID_FIELD_COUNT' | 'INVALID_GRADE';

/** Motivos de archivo completo (row = 0, sin email). */
export type CsvFileReason =
  | 'EMPTY_FILE' | 'INVALID_ENCODING' | 'MALFORMED_CSV' | 'MISSING_EMAIL_COLUMN' | 'DUPLICATE_COLUMN' | 'UNKNOWN_COLUMN'
  | 'NO_DATA_ROWS' | 'TOO_MANY_ROWS' | 'FILE_TOO_LARGE';

export interface CsvIssue {
  /** 0 = error del archivo (no de una fila). */
  row: number;
  email?: string;
  reason: CsvIssueReason | CsvFileReason;
}

export interface CertificateItem {
  certificate_id: string;
  course_name: string;
  completion_date: string;
  issued_at: string;
  institution?: string; // confirmado ausente en main (no está en contracts §5)
}

export interface PublicCertificate {
  status: 'REGISTERED';
  certificate_id: string;
  student_name: string;
  institution: string;
  course_name: string;
  completion_date: string;
  issued_at?: string; // confirmado ausente en main (no está en contracts §5)
}

export type VerifyOutcome = 'VALID' | 'ALTERED' | 'NOT_FOUND' | 'UNAVAILABLE';

// ───────────────────────── Perfiles (TODO(equipo): el backend aún no los tiene; ver docs/frontend-api.md §Perfiles) ─────────────────────────

/** En la UI: 'student' = Alumno, 'operator' = Tutor (no hay un rol nuevo en el sistema). */
export type ProfileRole = Role;

export type LinkKind = 'web' | 'linkedin' | 'github' | 'portfolio' | 'otro';
export interface ProfileLink { label: string; url: string; kind: LinkKind }

/** Fechas "AAAA-MM". `end: null` = actual. */
export interface ExperienceItem { id: string; title: string; org: string; location?: string; start: string; end: string | null; description: string; highlights: string[] }
export interface EducationItem { id: string; institution: string; degree: string; field: string; start: string; end: string | null; description?: string }
export interface SkillItem { id: string; name: string; level: 1 | 2 | 3 | 4 | 5; category?: string; endorsements?: number }
export type LanguageLevel = 'Básico' | 'Intermedio' | 'Avanzado' | 'Nativo';
export interface LanguageItem { id: string; name: string; level: LanguageLevel }
export interface ProjectItem { id: string; title: string; description: string; url?: string; tags: string[]; start?: string; end?: string | null }
export interface AchievementItem { id: string; title: string; issuer?: string; date: string; description?: string }
export interface PublicationItem { id: string; title: string; venue: string; date: string; url?: string }
export interface VolunteeringItem { id: string; role: string; org: string; start: string; end: string | null; description: string }
export interface SubjectTaught { id: string; name: string; level?: string; modality: TeachingModality }
export type TeachingModality = 'Presencial' | 'Virtual' | 'Híbrida';
export interface OfficeHour { day: string; from: string; to: string }

/** Secciones que se pueden ocultar una por una. El perfil en sí es siempre público. */
export type SectionKey =
  | 'about' | 'experience' | 'education' | 'skills' | 'languages' | 'projects' | 'achievements'
  | 'publications' | 'volunteering' | 'interests' | 'certificates' | 'links' | 'teaching';

/** Portadas generadas (sin fotos). Ver COVER_STYLES en profileUtils. */
export type CoverStyle = 'ondas' | 'malla' | 'diagonal' | 'puntos' | 'arcos' | 'tramas' | 'aurora' | 'cuadricula';

/**
 * Perfil público de un alumno o tutor. NUNCA incluye el email de cuenta; `contactEmail` es un campo
 * opcional que la persona escribe a propósito (si está vacío, el campo no se envía).
 * La completitud no se guarda: `profileCompleteness(profile)`.
 */
export interface Profile {
  slug: string; // único, kebab-case
  displayName: string;
  headline: string;
  pronouns?: string;
  location: string;
  avatarUrl: string; // siempre presente (data URL o URL local)
  coverStyle: CoverStyle;
  role: ProfileRole;
  about: string;
  openTo?: string[];
  availability?: string;
  contactEmail?: string;
  links: ProfileLink[];
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  languages: LanguageItem[];
  projects: ProjectItem[];
  achievements: AchievementItem[];
  publications: PublicationItem[];
  volunteering: VolunteeringItem[];
  interests: string[];
  /** ids de certificados del sistema a destacar (se leen de /me/certificates). */
  certificatesFeatured: string[];
  hiddenSections: SectionKey[];
  institution?: string;
  // Alumno
  studyGoals?: string;
  lookingFor?: string;
  // Tutor (role === 'operator')
  specialties?: string[];
  subjectsTaught?: SubjectTaught[];
  teachingYears?: number;
  modality?: TeachingModality;
  officeHours?: OfficeHour[];
  teachingApproach?: string;
}

export interface ProfileSummary {
  slug: string;
  displayName: string;
  headline: string;
  avatarUrl: string;
  role: ProfileRole;
  location: string;
  topSkills: string[];
  institution?: string;
}

export interface ProfileSearchParams { q?: string; role?: ProfileRole; skill?: string; page?: number }

export interface CertificateDetail {
  certificate_id: string;
  course_name: string;
  completion_date: string;
  issued_at: string;
  institution?: string;
  verifyUrl: string;
  sha256?: string; // confirmado ausente en main: el backend no expone el hash
  student_name?: string;
}
