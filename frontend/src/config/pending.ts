// Formato del CSV según el backend (docs/contracts.md §5, backend/app/domain/csv_validation.py).
// TODO(equipo): confirmar el texto de ayuda y el enlace/archivo de ejemplo definitivos.
export const CSV_COLUMNS = ['email', 'final_grade'] as const;
export const CSV_EXAMPLE = 'email,final_grade\nalumno01@demo.test,9.50\nalumno02@demo.test,\n';
export const CSV_HELP =
  'CSV en UTF-8, separado por comas, con encabezado. Columna obligatoria "email"; columna opcional "final_grade" (nota 0-10, hasta dos decimales). De 1 a 100 filas, hasta 1 MB, sin líneas vacías en el medio.';
/** TODO(equipo): enlace/archivo de ejemplo definitivo. Por ahora se genera en el navegador con CSV_EXAMPLE. */
export const CSV_EXAMPLE_FILENAME = 'lote-ejemplo.csv';
export const CSV_EXAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_EXAMPLE)}`;
/** contracts §5: máximo 100 filas de datos. */
export const CSV_MAX_ROWS = 100;
/** Backend: el CSV no puede superar 1.048.576 bytes. */
export const CSV_MAX_BYTES = 1_048_576;
