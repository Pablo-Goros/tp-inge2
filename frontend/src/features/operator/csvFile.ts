import { CSV_MAX_BYTES, CSV_MAX_ROWS } from '../../config/pending';

function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ''));
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

export type CsvPick = { ok: true; rows: number } | { ok: false; error: string };

/** Validación previa al envío (sin llamar a la API): extensión y cantidad de filas de datos (sin la cabecera). */
export async function inspectCsv(file: File): Promise<CsvPick> {
  if (!file.name.toLowerCase().endsWith('.csv')) return { ok: false, error: 'El archivo debe ser .csv' };
  if (file.size > CSV_MAX_BYTES) return { ok: false, error: 'El archivo supera 1 MB' };
  let text = '';
  try { text = await readText(file); } catch { return { ok: false, error: 'No se pudo leer el archivo. Probá de nuevo.' }; }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  // Solo se descartan las líneas vacías del final; las intermedias cuentan como fila (el backend las informa como EMPTY_ROW).
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const rows = Math.max(0, lines.length - 1);
  if (rows === 0) return { ok: false, error: 'El archivo no tiene filas de datos' };
  if (rows > CSV_MAX_ROWS) return { ok: false, error: `El archivo supera las ${CSV_MAX_ROWS} filas` };
  return { ok: true, rows };
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
