import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, type CertificateDetail } from '../../api';
import { Alert, Badge, Button, Card, CopyButton, EmptyState, ErrorState, LinkButton, QrCode, Skeleton } from '../../components/ui';
import { useAsync } from '../home/useAsync';
import { useApi, useAuth } from '../session/AuthProvider';
import { formatDate } from '../verify/RegisteredDataCard';
import { usePdfDownload } from './usePdfDownload';
import './detail.css';

type FeatureMsg = { tone: 'success' | 'error'; text: string } | null;

/** Destacar / quitar el certificado del perfil: alterna su id en `certificatesFeatured`. */
function FeatureToggle({ certId }: { certId: string }) {
  const api = useApi();
  const { state, retrying, retry } = useAsync(() => api.getMyProfile(), certId);
  const [featured, setFeatured] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<FeatureMsg>(null);
  useEffect(() => { if (state.s === 'ok') setFeatured(state.data.certificatesFeatured); }, [state]);

  if (state.s === 'loading') return <Skeleton height={44} />;
  if (state.s === 'error') return <ErrorState message="No pudimos cargar tu perfil para destacar el certificado." retrying={retrying} onRetry={retry} />;
  const list = featured ?? state.data.certificatesFeatured;
  const on = list.includes(certId);

  async function toggle() {
    const next = on ? list.filter((id) => id !== certId) : [...list, certId];
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api.updateMyProfile({ certificatesFeatured: next });
      setFeatured(saved.certificatesFeatured);
      setMsg({ tone: 'success', text: on ? 'Se quitó de tu perfil.' : 'Ahora se muestra en tu perfil.' });
    } catch {
      setMsg({ tone: 'error', text: 'No se pudo actualizar tu perfil. Probá de nuevo.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cd-feature">
      <Button variant="secondary" loading={busy} loadingLabel="Guardando…" aria-pressed={on} onClick={() => void toggle()}>
        {on ? '★ Quitar de mi perfil' : '☆ Destacar en mi perfil'}
      </Button>
      <span className="cd-msg" role="status" aria-live="polite" data-tone={msg?.tone}>{msg?.text ?? ''}</span>
    </div>
  );
}

function Credential({ cert, studentName }: { cert: CertificateDetail; studentName: string }) {
  const pdf = usePdfDownload(cert.certificate_id, cert.course_name);
  const rows: [string, string, boolean?][] = [
    ['Alumno', studentName], ...(cert.institution ? [['Institución', cert.institution] as [string, string]] : []),
    ['Finalización', formatDate(cert.completion_date)], ['Emisión', formatDate(cert.issued_at)],
  ];
  return (
    <>
      <Card flush className="cd-cred" aria-labelledby="cd-course">
        <div className="cd-band">
          <span className="lbl cd-band-l">Credencial de finalización</span>
          <Badge tone="ok" icon="✓" className="cd-ver">Verificable</Badge>
        </div>
        <div className="cd-body">
          <div className="cd-main">
            <h2 id="cd-course" className="disp cd-course">{cert.course_name}</h2>
            <dl className="cd-dl">
              {rows.map(([k, v]) => <div key={k} className="cd-row"><dt>{k}</dt><dd>{v}</dd></div>)}
              <div className="cd-row">
                <dt>Identificador</dt>
                <dd className="cd-id"><code className="mono">{cert.certificate_id}</code>
                  <CopyButton text={cert.certificate_id} variant="ghost" small okMessage="Identificador copiado" aria-label="Copiar identificador">Copiar</CopyButton></dd>
              </div>
              {/* TODO(equipo): el contrato aún no expone el hash del PDF; se muestra solo si el backend lo envía. */}
              {cert.sha256 && <div className="cd-row"><dt>Huella SHA-256</dt><dd><code className="mono cd-hash">{cert.sha256}</code></dd></div>}
            </dl>
          </div>
          <div className="cd-qr">
            <span className="lbl">Escaneá para verificar</span>
            <QrCode value={cert.verifyUrl} label="Código QR que lleva a la verificación pública de este certificado" size={176} />
          </div>
        </div>
      </Card>

      <div className="cd-actions" role="group" aria-label="Acciones">
        <div className="cd-dl-wrap">
          {pdf.state === 'error' && <Alert tone="error">No se pudo descargar el PDF. Probá de nuevo.</Alert>}
          <Button loading={pdf.state === 'busy'} loadingLabel="Descargando…" onClick={() => void pdf.download()}>
            {pdf.state === 'error' ? '↻ Reintentar descarga' : '↓ Descargar PDF'}
          </Button>
        </div>
        <CopyButton text={cert.verifyUrl} okMessage="Enlace copiado">Copiar enlace de verificación</CopyButton>
        <LinkButton to={`/verify/${cert.certificate_id}`} variant="secondary">Abrir verificación pública</LinkButton>
        <FeatureToggle certId={cert.certificate_id} />
      </div>

      <Alert tone="info">Esta credencial comprueba que el archivo coincide con lo registrado por el emisor; no prueba que la persona haya aprobado el curso.</Alert>
    </>
  );
}

/** Detalle de un certificado propio, con aspecto de credencial. */
export function CertificateDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const [load, setLoad] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [cert, setCert] = useState<CertificateDetail | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad('loading');
    api.getCertificateDetail(id).then(
      (c) => { if (live) { setCert(c); setLoad('ok'); setRetrying(false); } },
      (e: unknown) => { if (live) { setLoad(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error'); setRetrying(false); } },
    );
    return () => { live = false; };
  }, [api, id, nonce]);

  return (
    <main className="page cd">
      <Link className="lnk-draw cd-back" to="/student/certificates">← Mis certificados</Link>
      <h1 className="disp page-title">Detalle del certificado</h1>
      {load === 'loading' && (
        <div className="stack" aria-busy="true" role="status"><span className="sr-only">Cargando certificado…</span><Skeleton height={240} /><Skeleton height={44} opacity={0.7} /></div>
      )}
      {load === 'error' && <ErrorState message="No pudimos cargar el certificado. Intentá de nuevo." retrying={retrying} onRetry={() => { setRetrying(true); setNonce((n) => n + 1); }} />}
      {load === 'notfound' && (
        <EmptyState icon="?" title="Certificado no encontrado" description="Puede que el enlace sea incorrecto o que ese certificado no sea tuyo."
          action={<LinkButton to="/student/certificates" variant="secondary">Volver a Mis certificados</LinkButton>} />
      )}
      {load === 'ok' && cert && <Credential cert={cert} studentName={cert.student_name ?? user?.name ?? ''} />}
    </main>
  );
}
