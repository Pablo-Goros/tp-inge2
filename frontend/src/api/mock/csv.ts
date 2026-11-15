import { ApiError } from '../ApiClient';
import type { CsvIssue } from '../types';

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

/** Devuelve los emails (normalizados) por fila. Acepta columnas `nombre`+`email` o solo `email`; `,` o `;`. */
export function parseCsv(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new ApiError(400, 'VALIDATION_ERROR', 'El archivo está vacío.');
  const sep = lines[0].includes(';') ? ';' : ',';
  const cols = lines[0].split(sep).map((c) => c.trim().toLowerCase());
  const idx = cols.indexOf('email');
  if (idx < 0) throw new ApiError(400, 'VALIDATION_ERROR', 'El archivo necesita una columna "email".');
  const rows = lines.slice(1).map((l) => (l.split(sep)[idx] ?? '').trim().toLowerCase());
  if (!rows.length) throw new ApiError(400, 'VALIDATION_ERROR', 'El archivo no tiene filas de datos.');
  if (rows.length > MAX_ROWS) throw new ApiError(400, 'VALIDATION_ERROR', `El archivo supera el máximo de ${MAX_ROWS} filas.`);
  return rows;
}

/** Un motivo por fila, en este orden de prioridad (contracts §5, `row` desde 1 sin cabecera). */
export function validateRows(
  emails: string[], hasAccount: (e: string) => boolean, alreadyRequested: (e: string) => boolean,
): CsvIssue[] {
  const seen = new Set<string>();
  const issues: CsvIssue[] = [];
  emails.forEach((email, i) => {
    const row = i + 1;
    if (!EMAIL_RE.test(email)) issues.push({ row, email, reason: 'INVALID_EMAIL' });
    else if (seen.has(email)) issues.push({ row, email, reason: 'DUPLICATE_IN_FILE' });
    else if (!hasAccount(email)) issues.push({ row, email, reason: 'NO_ACCOUNT' });
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
