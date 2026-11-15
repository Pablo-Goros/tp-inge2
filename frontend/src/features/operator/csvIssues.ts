import type { CsvIssueReason } from '../../api';

const TEXTS: Record<CsvIssueReason, string> = {
  NO_ACCOUNT: 'No existe una cuenta de alumno con este email',
  DUPLICATE_IN_FILE: 'Email repetido en el archivo',
  ALREADY_REQUESTED: 'Ya existe un certificado para este alumno, curso y fecha',
  INVALID_EMAIL: 'Email mal formado',
};

/** Motivo del contrato → texto en español. Un motivo desconocido no rompe la pantalla. */
export function describeIssue(reason: CsvIssueReason | string): string {
  return TEXTS[reason as CsvIssueReason] ?? 'Problema en la fila';
}
