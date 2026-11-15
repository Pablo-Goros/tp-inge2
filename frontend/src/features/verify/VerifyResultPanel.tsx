import { useEffect, useRef } from 'react';
import { Button } from '../../components/ui';
import type { VerifyOutcome } from '../../api';

const VIEW: Record<VerifyOutcome, { cls: string; glyph: string; gl: string; title: string; text: string; role: 'status' | 'alert' }> = {
  VALID: { cls: 'r-ok', glyph: '✓', gl: 'gl-ok', title: 'Válido', text: 'El archivo coincide con lo registrado por la institución.', role: 'status' },
  ALTERED: { cls: 'r-bad', glyph: '✕', gl: 'gl-bad', title: 'Alterado', text: 'El archivo fue modificado. Subí el original emitido.', role: 'alert' },
  NOT_FOUND: { cls: 'r-nr', glyph: '?', gl: 'gl-nr', title: 'No registrado', text: 'Este archivo no está registrado.', role: 'status' },
  UNAVAILABLE: { cls: 'r-no', glyph: '!', gl: 'gl-no', title: 'No se pudo verificar', text: 'No se pudo verificar en este momento. Probá más tarde, o revisá que el archivo sea un PDF válido.', role: 'alert' },
};

/** Resultado de la verificación: color + ícono + forma distintos por resultado. Toma el foco al aparecer. */
export function VerifyResultPanel({ outcome, fileName, onReset }: { outcome: VerifyOutcome; fileName: string; onReset: () => void }) {
  const v = VIEW[outcome];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div ref={ref} tabIndex={-1} className={`res ${v.cls}`} role={v.role} data-outcome={outcome}>
      <div className={`gl ${v.gl}`} aria-hidden="true">{v.glyph}</div>
      <h2>{v.title}</h2>
      <p>{v.text}</p>
      <span className="help">{fileName}</span>
      <Button variant="secondary" onClick={onReset}>Verificar otro archivo</Button>
    </div>
  );
}

export function VerifyingPanel({ fileName }: { fileName: string }) {
  return (
    <div className="vf-busy" role="status" aria-busy="true">
      <span className="spin" aria-hidden="true" />
      <b>Verificando…</b>
      <span className="help">{fileName} · calculando huella y consultando el registro</span>
    </div>
  );
}
