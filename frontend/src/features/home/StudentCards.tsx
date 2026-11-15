import { Link } from 'react-router-dom';
import type { CertificateItem } from '../../api';
import { Alert, Button, EmptyState, LinkButton } from '../../components/ui';
import { useApi } from '../session/AuthProvider';
import { usePdfDownload } from '../student/usePdfDownload';
import { formatDate } from '../verify/RegisteredDataCard';
import { HomeCard } from './HomeCard';
import { useAsync } from './useAsync';

function CertRow({ cert }: { cert: CertificateItem }) {
  const { state, download } = usePdfDownload(cert.certificate_id, cert.course_name);
  return (
    <li className="hm-cert">
      <div className="hm-cert-main">
        <Link className="lnk-draw hm-cert-title" to={`/student/certificates/${cert.certificate_id}`}>{cert.course_name}</Link>
        <span className="help">Emitido el {formatDate(cert.issued_at)}{cert.institution ? ` · ${cert.institution}` : ''}</span>
        {state === 'error' && <Alert tone="error">No se pudo descargar el PDF. Probá de nuevo.</Alert>}
      </div>
      <Button variant="secondary" small loading={state === 'busy'} loadingLabel="Descargando…" onClick={() => void download()}
        aria-label={state === 'busy' ? undefined : `${state === 'error' ? 'Reintentar descarga' : 'Descargar PDF'} de ${cert.course_name}`}>
        {state === 'error' ? '↻ Descargar PDF' : '↓ Descargar PDF'}
      </Button>
    </li>
  );
}

export function RecentCertificatesCard({ span }: { span?: string }) {
  const api = useApi();
  const { state, retrying, retry } = useAsync(async () => [...(await api.listMyCertificates())].sort((a, b) => b.issued_at.localeCompare(a.issued_at)));
  return (
    <HomeCard title="Certificados recientes" span={span} state={state} retrying={retrying} onRetry={retry} errorMessage="No pudimos cargar tus certificados."
      action={{ to: '/student/certificates', label: 'Ver todos' }}>
      {(items) => items.length === 0
        ? <EmptyState icon="·" title="Todavía no tenés certificados" description="Cuando tu institución emita uno, lo vas a ver acá." />
        : <ul className="hm-certs">{items.slice(0, 3).map((c) => <CertRow key={c.certificate_id} cert={c} />)}</ul>}
    </HomeCard>
  );
}

export function StudentShortcutsCard({ span }: { span?: string }) {
  return (
    <section className={['card', 'hm-card', span].filter(Boolean).join(' ')} aria-labelledby="hm-sc-h">
      <header className="hm-card-head"><h2 id="hm-sc-h" className="hm-card-title">Atajos</h2></header>
      <div className="hm-shortcuts">
        <LinkButton to="/profile/edit">Editar perfil</LinkButton>
        <LinkButton to="/student/certificates" variant="secondary">Ver mis certificados</LinkButton>
        <LinkButton to="/directory" variant="secondary">Explorar el directorio</LinkButton>
      </div>
    </section>
  );
}
