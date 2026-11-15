interface Props {
  /** 0-100 */
  percent: number;
  /** Texto accesible. */
  label?: string;
  size?: number;
}

/** Anillo de completitud. role="progressbar" con valor y texto visible en el centro. */
export function ProgressRing({ percent, label = 'Completitud del perfil', size = 88 }: Props) {
  const p = Math.min(100, Math.max(0, Math.round(percent)));
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-valuetext={`${p}%`}>
      <svg viewBox="0 0 88 88" width={size} height={size} aria-hidden="true">
        <circle className="ring-bg" cx="44" cy="44" r={r} fill="none" strokeWidth="8" />
        <circle className="ring-fg" cx="44" cy="44" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} transform="rotate(-90 44 44)" />
      </svg>
      <span className="ring-txt" aria-hidden="true">{p}%</span>
    </div>
  );
}
