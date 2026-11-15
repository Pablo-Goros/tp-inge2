import { Link } from 'react-router-dom';
import type { CertificateItem } from '../../api';
import { Alert, Button, Card } from '../../components/ui';
import { formatDate } from '../verify/RegisteredDataCard';
import { usePdfDownload } from './usePdfDownload';

export function CertificateCard({ cert }: { cert: CertificateItem }) {
  const { state: dl, download } = usePdfDownload(cert.certificate_id, cert.course_name);

  const rows: [string, string][] = [];
  if (cert.institution) rows.push(['Institución', cert.institution]);
  rows.push(['Finalización', formatDate(cert.completion_date)], ['Emisión', formatDate(cert.issued_at)]);

  return (
    <Card className="cert" danger={dl === 'error'} role="listitem">
      <span className="lbl">Certificado de finalización</span>
      <h2 className="cert-title">{cert.course_name}</h2>
      {rows.map(([k, v]) => (
        <div className="k" key={k}><span>{k}</span><b>{v}</b></div>
      ))}
      {dl === 'error' && <Alert tone="error">No se pudo descargar el PDF. Probá de nuevo.</Alert>}
      <Button
        variant="secondary"
        className="cert-btn"
        loading={dl === 'busy'}
        loadingLabel="Descargando…"
        onClick={() => { void download(); }}
        aria-label={dl === 'busy' ? undefined : `${dl === 'error' ? '↻' : '↓'} Descargar PDF de ${cert.course_name}`}
      >
        {dl === 'error' ? '↻ Descargar PDF' : '↓ Descargar PDF'}
      </Button>
      <Link className="lnk-draw cert-detail" to={`/student/certificates/${cert.certificate_id}`} aria-label={`Ver detalle de ${cert.course_name}`}>Ver detalle</Link>
    </Card>
  );
}
