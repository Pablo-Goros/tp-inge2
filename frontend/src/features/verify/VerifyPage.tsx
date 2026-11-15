import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, type PublicCertificate, type VerifyOutcome } from '../../api';
import { Alert, ErrorState, FileDropzone, formatSize, SkeletonList } from '../../components/ui';
import { useApi } from '../session/AuthProvider';
import { RegisteredDataCard } from './RegisteredDataCard';
import { VerifyingPanel, VerifyResultPanel } from './VerifyResultPanel';
import { VerifyLookup } from './VerifyLookup';
import './verify.css';

const MAX_BYTES = 5 * 1024 * 1024;
const SCOPE = 'Esta verificación comprueba que el archivo coincide con lo registrado por el emisor; no prueba que la persona haya aprobado el curso.';

type Load = { s: 'loading' } | { s: 'ok'; cert: PublicCertificate } | { s: 'notfound' } | { s: 'error' };
type Check = { s: 'idle' } | { s: 'checking'; name: string } | { s: 'done'; name: string; outcome: VerifyOutcome };

function Head({ sub }: { sub: string }) {
  return (
    <div className="vf-head">
      <h1 className="disp page-title">Verificación de certificado</h1>
      <p className="help">{sub}</p>
    </div>
  );
}

export function VerifyPage() {
  const { certId } = useParams();
  if (!certId) {
    return (
      <div className="page page-narrow">
        <Head sub="No necesitás cuenta. Ingresá el identificador del certificado para comprobarlo contra el registro." />
        <VerifyLookup />
      </div>
    );
  }
  return <VerifyCertificate key={certId} certId={certId} />;
}

function VerifyCertificate({ certId }: { certId: string }) {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ s: 'loading' });
  const [check, setCheck] = useState<Check>({ s: 'idle' });
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const fetchCert = useCallback(async () => {
    try {
      const cert = await api.getPublicCertificate(certId);
      if (alive.current) setLoad({ s: 'ok', cert });
    } catch (e) {
      if (!alive.current) return;
      setLoad(e instanceof ApiError && e.code === 'NOT_FOUND' ? { s: 'notfound' } : { s: 'error' });
    } finally {
      if (alive.current) setRetrying(false);
    }
  }, [api, certId]);

  useEffect(() => { void fetchCert(); }, [fetchCert]);

  async function onFile(file: File) {
    setCheck({ s: 'checking', name: file.name });
    let outcome: VerifyOutcome;
    try {
      outcome = await api.verifyFile(certId, file);
    } catch {
      outcome = 'UNAVAILABLE'; // red, 5xx, etc.: nunca se confunde con "alterado"
    }
    if (alive.current) setCheck({ s: 'done', name: file.name, outcome });
  }

  const sub = 'No necesitás cuenta. Comprobá un certificado contra el registro.';

  if (load.s === 'notfound') {
    return (
      <div className="page">
        <Head sub={sub} />
        <div className="card vf-nf res r-nr" style={{ background: 'none' }}>
          <div className="gl gl-nr" aria-hidden="true">?</div>
          <h2>Certificado no encontrado</h2>
          <p className="help">No existe un certificado con el identificador <span className="mono">{certId}</span>. Revisá el enlace o volvé a escanear el QR.</p>
        </div>
        <p className="vf-scope">{SCOPE}</p>
      </div>
    );
  }

  let action;
  if (check.s === 'checking') action = <VerifyingPanel fileName={check.name} />;
  else if (check.s === 'done') action = <VerifyResultPanel outcome={check.outcome} fileName={check.name} onReset={() => setCheck({ s: 'idle' })} />;
  else {
    action = (
      <FileDropzone
        accept=".pdf"
        maxBytes={MAX_BYTES}
        title="Arrastrá tu PDF acá"
        hint="Solo .pdf · máximo 5 MB"
        buttonLabel="Seleccionar archivo"
        onFile={(f) => { void onFile(f); }}
        rejectMessage={(f) => `Solo se aceptan archivos .pdf de hasta 5 MB. El archivo elegido pesa ${formatSize(f.size)}.`}
      />
    );
  }

  return (
    <div className="page">
      <Head sub={sub} />
      {load.s === 'loading' && <SkeletonList label="Cargando los datos registrados…" rows={5} height={32} />}
      {load.s === 'error' && (
        <ErrorState
          message="No pudimos consultar el registro en este momento. Probá de nuevo en unos minutos."
          retrying={retrying}
          onRetry={() => { setRetrying(true); void fetchCert(); }}
        />
      )}
      {load.s === 'ok' && (
        <div className={['vf-grid', check.s === 'done' && 'vf-has-result'].filter(Boolean).join(' ')}>
          <div className="vf-left">
            <RegisteredDataCard cert={load.cert} />
            <Alert tone="info" className="vf-info">Estos son los datos registrados. Para comprobar que tu PDF no fue modificado, subí el archivo original.</Alert>
          </div>
          <div className="vf-right">
            <div className="vf-action">{action}</div>
            <p className="vf-scope">{SCOPE}</p>
          </div>
        </div>
      )}
      {load.s !== 'ok' && <p className="vf-scope">{SCOPE}</p>}
    </div>
  );
}
