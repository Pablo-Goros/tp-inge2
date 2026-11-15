// Tipos según docs/contracts.md §5. Ver docs/frontend-api.md para las diferencias pedidas al equipo.
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
}

export interface BatchDetail {
  batch_id: string;
  course_name: string;
  completion_date: string;
  status: BatchStatus;
  counts: Required<BatchCounts>;
  items: BatchItem[];
  created_at?: string; // TODO(equipo): no está en contracts §5
}

export type CsvIssueReason = 'NO_ACCOUNT' | 'DUPLICATE_IN_FILE' | 'ALREADY_REQUESTED' | 'INVALID_EMAIL';

export interface CsvIssue {
  row: number;
  email: string;
  reason: CsvIssueReason;
}

export interface CertificateItem {
  certificate_id: string;
  course_name: string;
  completion_date: string;
  issued_at: string;
  institution?: string; // TODO(equipo): no está en contracts §5
}

export interface PublicCertificate {
  status: 'REGISTERED';
  certificate_id: string;
  student_name: string;
  institution: string;
  course_name: string;
  completion_date: string;
  issued_at?: string; // TODO(equipo): no está en contracts §5
}

export type VerifyOutcome = 'VALID' | 'ALTERED' | 'NOT_FOUND' | 'UNAVAILABLE';
