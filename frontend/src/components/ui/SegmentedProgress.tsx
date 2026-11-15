import type { BatchCounts } from '../../api/types';

interface Props {
  counts: Required<BatchCounts>;
  /** Barra fina sin leyenda (tarjetas de lista). */
  compact?: boolean;
  legend?: boolean;
}

export function progressLabel(c: Required<BatchCounts>): string {
  return `${c.issued} emitidos, ${c.failed} fallidos, ${c.processing} procesando, ${c.pending} pendientes de ${c.total}`;
}

export function SegmentedProgress({ counts, compact, legend }: Props) {
  const pct = (n: number) => (counts.total > 0 ? `${(n / counts.total) * 100}%` : '0%');
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className={compact ? 'bar bar-sm' : 'bar'} role="img" aria-label={progressLabel(counts)}>
        <div style={{ width: pct(counts.issued), background: 'var(--g1)' }} />
        <div style={{ width: pct(counts.failed), background: 'var(--red)' }} />
        <div className="stripe" style={{ width: pct(counts.processing) }} />
      </div>
      {legend && (
        <div className="bar-legend" aria-hidden="true">
          <span style={{ color: 'var(--g1)' }}>■ Emitidos {counts.issued}</span>
          <span style={{ color: 'var(--red)' }}>■ Fallidos {counts.failed}</span>
          <span style={{ color: 'var(--cy)' }}>■ Procesando {counts.processing}</span>
          <span>□ Pendientes {counts.pending}</span>
        </div>
      )}
    </div>
  );
}
