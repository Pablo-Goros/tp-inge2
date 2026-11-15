import { useEffect, useRef, useState } from 'react';
import type { CertificateItem } from '../../api';
import { Alert, Button, Card } from '../../components/ui';
import { useApi } from '../session/AuthProvider';
import { formatDate } from '../verify/RegisteredDataCard';
import { pdfFileName, saveBlob } from './downloadPdf';

type Dl = 'idle' | 'busy' | 'error';

export function CertificateCard({ cert }: { cert: CertificateItem }) {
  const api = useApi();
  const [dl, setDl] = useState<Dl>('idle');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function download() {
    if (busy.current) return; // una sola petición aunque se haga doble clic
    busy.current = true;
    setDl('busy');
    try {
      const blob = await api.downloadCertificatePdf(cert.certificate_id);
      saveBlob(blob, pdfFileName(cert.course_name));
      if (alive.current) setDl('idle');
    } catch {
      if (alive.current) setDl('error');
    } finally {
      busy.current = false;
    }
  }

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
    </Card>
  );
}
