import { ApiError } from '../ApiClient';
import type { CsvFileReason, CsvIssue } from '../types';

export const MAX_ROWS = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ''));
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

export interface CsvRow { email: string; grade: string }

const fileError = (reason: CsvFileReason) => new ApiError(400, 'VALIDATION_ERROR', 'CSV inválido', [{ row: 0, reason }]);
/** Igual que el backend: número sin signo con hasta 2 decimales y <= 10. */
const GRADE_RE = /^\d+(\.\d{1,2})?$/;
export const isValidGrade = (raw: string) => GRADE_RE.test(raw) && Number(raw) <= 10;

/**
 * Filas (email normalizado + nota cruda) como lo hace el backend: solo `,`, cabecera `email` obligatoria y
 * `final_grade` opcional; cualquier otra columna → UNKNOWN_COLUMN. Errores de archivo con `{row: 0, reason}`.
 */
export function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) throw fileError('EMPTY_FILE');
  const cols = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const idx = cols.indexOf('email');
  if (idx < 0) throw fileError('MISSING_EMAIL_COLUMN');
  if (new Set(cols).size !== cols.length) throw fileError('DUPLICATE_COLUMN');
  if (cols.some((c) => c !== 'email' && c !== 'final_grade')) throw fileError('UNKNOWN_COLUMN');
  const gIdx = cols.indexOf('final_grade');
  const data = lines.slice(1);
  if (!data.length) throw fileError('NO_DATA_ROWS');
  if (data.length > MAX_ROWS) throw fileError('TOO_MANY_ROWS');
  const issues: CsvIssue[] = [];
  const rows = data.map((l, i): CsvRow => {
    const f = l === '' ? [] : l.split(',');
    const email = (f[idx] ?? '').trim().toLowerCase();
    if (!f.length) issues.push({ row: i + 1, email, reason: 'EMPTY_ROW' });
    else if (f.length !== cols.length) issues.push({ row: i + 1, email, reason: 'INVALID_FIELD_COUNT' });
    return { email, grade: gIdx >= 0 ? (f[gIdx] ?? '').trim() : '' };
  });
  if (issues.length) throw new ApiError(400, 'VALIDATION_ERROR', 'El CSV tiene filas con problemas.', issues);
  return rows;
}

/** Un motivo de correo por fila, en el orden del backend (INVALID_EMAIL → NO_ACCOUNT → DUPLICATE_IN_FILE → ALREADY_REQUESTED). */
export function validateRows(
  emails: string[], hasAccount: (e: string) => boolean, alreadyRequested: (e: string) => boolean,
): CsvIssue[] {
  const seen = new Set<string>();
  const issues: CsvIssue[] = [];
  emails.forEach((email, i) => {
    const row = i + 1;
    if (!EMAIL_RE.test(email)) issues.push({ row, email, reason: 'INVALID_EMAIL' });
    else if (!hasAccount(email)) issues.push({ row, email, reason: 'NO_ACCOUNT' });
    else if (seen.has(email)) issues.push({ row, email, reason: 'DUPLICATE_IN_FILE' });
    else if (alreadyRequested(email)) issues.push({ row, email, reason: 'ALREADY_REQUESTED' });
    seen.add(email);
  });
  return issues;
}

export const REJECTED_SAMPLE: CsvIssue[] = [
  { row: 3, email: 'sofia.acuna@alumnos.edu.ar', reason: 'NO_ACCOUNT' },
  { row: 5, email: 'bruno.paz@demo.test', reason: 'DUPLICATE_IN_FILE' },
  { row: 8, email: 'alumno01@demo.test', reason: 'ALREADY_REQUESTED' },
  { row: 12, email: 'lucas.benitez@', reason: 'INVALID_EMAIL' },
];
