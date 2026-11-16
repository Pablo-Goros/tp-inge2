import type { CsvFileReason, CsvIssueReason } from '../../api';

const TEXTS: Record<CsvIssueReason, string> = {
  NO_ACCOUNT: 'No existe una cuenta de alumno con este email',
  DUPLICATE_IN_FILE: 'Email repetido en el archivo',
  ALREADY_REQUESTED: 'Ya existe un certificado para este alumno, curso y fecha',
  INVALID_EMAIL: 'Email mal formado',
  EMPTY_ROW: 'Línea vacía en medio del archivo',
  INVALID_FIELD_COUNT: 'La fila no tiene la misma cantidad de columnas que el encabezado',
  INVALID_GRADE: 'Nota final inválida (0-10, hasta dos decimales)',
};

/** Errores del archivo completo (row 0). */
const FILE_TEXTS: Record<CsvFileReason, string> = {
  EMPTY_FILE: 'El archivo está vacío',
  INVALID_ENCODING: 'El archivo debe estar codificado en UTF-8',
  MALFORMED_CSV: 'El archivo no es un CSV válido',
  MISSING_EMAIL_COLUMN: 'Falta la columna obligatoria "email"',
  DUPLICATE_COLUMN: 'Hay columnas repetidas en el encabezado',
  UNKNOWN_COLUMN: 'Columna no reconocida (solo email y final_grade)',
  NO_DATA_ROWS: 'El archivo no tiene filas de datos',
  TOO_MANY_ROWS: 'El archivo supera las 100 filas',
  FILE_TOO_LARGE: 'El archivo supera 1 MB',
};

/** Motivo del contrato → texto en español. Un motivo desconocido no rompe la pantalla. */
export function describeIssue(reason: CsvIssueReason | string, row?: number): string {
  return TEXTS[reason as CsvIssueReason] ?? FILE_TEXTS[reason as CsvFileReason] ?? (row === 0 ? 'Problema en el archivo' : 'Problema en la fila');
}
