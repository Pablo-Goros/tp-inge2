/** Código corto de lote para mostrar: "#7F3A…" (decisión: sin número correlativo). */
export function shortBatchCode(batchId: string): string {
  return `#${batchId.replace(/-/g, '').slice(0, 4).toUpperCase()}…`;
}
