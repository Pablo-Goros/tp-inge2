export function Skeleton({ height = 36, opacity = 1 }: { height?: number; opacity?: number }) {
  return <div className="sk" style={{ height, opacity }} aria-hidden="true" />;
}

/** Contenedor de carga: aria-busy + texto anunciado para lectores de pantalla. */
export function SkeletonList({ label, rows = 4, height = 36 }: { label: string; rows?: number; height?: number }) {
  return (
    <div className="stack" aria-busy="true" role="status" style={{ gap: 12 }}>
      <span className="help">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} opacity={1 - i * 0.15} />
      ))}
    </div>
  );
}
