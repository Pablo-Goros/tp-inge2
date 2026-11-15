import { Card } from '../../components/ui';
import type { PublicCertificate } from '../../api';

/** "2026-10-30" o ISO → "30/10/2026". Si no se puede interpretar, se muestra tal cual. */
export function formatDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Solo muestra campos del contrato (nunca email ni datos de cuenta); `issued_at` solo si viene. */
export function RegisteredDataCard({ cert }: { cert: PublicCertificate }) {
  const rows: [string, string, boolean?][] = [
    ['Alumno', cert.student_name],
    ['Institución', cert.institution],
    ['Curso', cert.course_name],
    ['Finalización', formatDate(cert.completion_date)],
  ];
  if (cert.issued_at) rows.push(['Emisión', formatDate(cert.issued_at)]);
  rows.push(['Identificador', cert.certificate_id, true]);
  return (
    <Card className="vf-card vf-data" aria-labelledby="vf-data-h">
      <div className="lbl" id="vf-data-h" style={{ marginBottom: 8 }}>Datos registrados</div>
      <dl className="dat">
        {rows.map(([k, v, mono]) => (
          <div className="dat-row" key={k}><dt>{k}</dt><dd className={mono ? 'mono' : undefined}>{v}</dd></div>
        ))}
      </dl>
    </Card>
  );
}
