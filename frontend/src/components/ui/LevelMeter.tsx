/** Nivel 1-5. Accesible: role="img" con texto; los segmentos llenos y vacíos difieren en relleno y borde, no solo en color. */
export function LevelMeter({ value, max = 5 }: { value: number; max?: number }) {
  const v = Math.min(max, Math.max(0, Math.round(value)));
  return (
    <span className="lvl" role="img" aria-label={`Nivel ${v} de ${max}`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < v ? 'lvl-seg lvl-on' : 'lvl-seg'} aria-hidden="true" />)}
    </span>
  );
}
