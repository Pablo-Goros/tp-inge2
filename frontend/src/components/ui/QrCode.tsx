import { useMemo } from 'react';
import { encodeQr } from '../../lib/qr';

const QUIET = 4; // zona de silencio de 4 módulos (norma)

/** QR como SVG (un solo <path>). Si el texto no entra en el generador no dibuja nada. */
export function QrCode({ value, label, size = 192 }: { value: string; label: string; size?: number }) {
  const qr = useMemo(() => { try { return encodeQr(value); } catch { return null; } }, [value]);
  if (!qr) return null;
  const n = qr.size + QUIET * 2;
  let d = '';
  qr.modules.forEach((row, y) => {
    let x = 0;
    while (x < qr.size) {
      if (!row[x]) { x++; continue; }
      let len = 0;
      while (x + len < qr.size && row[x + len]) len++;
      d += `M${x + QUIET} ${y + QUIET}h${len}v1h-${len}z`;
      x += len;
    }
  });
  return (
    <svg className="qr" viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" data-modules={qr.size}>
      <rect className="qr-bg" width={n} height={n} />
      <path className="qr-fg" d={d} />
    </svg>
  );
}
