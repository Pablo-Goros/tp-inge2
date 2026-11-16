import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, type CsvIssue } from '../../api';
import { Alert, Button, Card, Field, formatSize } from '../../components/ui';
import { CSV_EXAMPLE_FILENAME, CSV_EXAMPLE_HREF, CSV_HELP } from '../../config/pending';
import { useApi } from '../session/AuthProvider';
import { inspectCsv, newIdempotencyKey } from './csvFile';
import { CsvRejection } from './CsvRejection';
import { describeIssue } from './csvIssues';
import { parseDisplayDate, todayBuenosAires } from './dates';
import './operator.css';

type Phase =
  | { s: 'idle' }
  | { s: 'sending' }
  | { s: 'rejected'; issues: CsvIssue[] }
  | { s: 'fileError'; message: string }
  | { s: 'network' }
  | { s: 'conflict' }
  | { s: 'error'; message: string };

interface Picked { file: File; rows: number }
interface Errors { course?: string; date?: string; file?: string }

export function NewBatchPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [course, setCourse] = useState('');
  const [dateText, setDateText] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<Phase>({ s: 'idle' });
  const [focusTick, setFocusTick] = useState(0);
  // Una clave por formulario: se reusa en los reintentos y se regenera tras un éxito o al cambiar cualquier dato.
  const keyRef = useRef(newIdempotencyKey());
  const sendingRef = useRef(false);
  const alive = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const sending = phase.s === 'sending';

  // Foco: al primer campo inválido o al aviso que aparece.
  useEffect(() => {
    if (focusTick === 0) return;
    const bad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (bad ?? noticeRef.current)?.focus();
  }, [focusTick]);

  function touched() {
    keyRef.current = newIdempotencyKey();
    setPhase((p) => (p.s === 'sending' ? p : { s: 'idle' }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    touched();
    const r = await inspectCsv(file);
    if (!alive.current) return;
    if (r.ok) {
      setPicked({ file, rows: r.rows });
      setErrors((e) => ({ ...e, file: undefined }));
    } else {
      setPicked(null);
      setErrors((e) => ({ ...e, file: r.error }));
      setFocusTick((t) => t + 1);
    }
  }

  async function send(date: string, p: Picked) {
    sendingRef.current = true;
    setPhase({ s: 'sending' });
    try {
      const res = await api.createBatch({ courseName: course.trim(), completionDate: date, file: p.file, idempotencyKey: keyRef.current });
      keyRef.current = newIdempotencyKey();
      if (alive.current) navigate(`/operator/batches/${res.batch_id}`);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR' && e.csvIssues.length > 0) {
        setPhase({ s: 'rejected', issues: e.csvIssues });
      } else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR' && e.csvFileIssues.length > 0) {
        setPhase({ s: 'fileError', message: describeIssue(e.csvFileIssues[0].reason, 0) }); // row 0: error del archivo, no de filas
      } else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        setPhase({ s: 'error', message: e.message });
      } else if (e instanceof ApiError && e.code === 'IDEMPOTENCY_CONFLICT') {
        keyRef.current = newIdempotencyKey(); // la clave vieja quedó asociada a otro contenido
        setPhase({ s: 'conflict' });
      } else {
        setPhase({ s: 'network' }); // red, 503 u otro fallo: se conserva todo y se reusa la misma clave
      }
      setFocusTick((t) => t + 1);
    } finally {
      sendingRef.current = false;
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (sendingRef.current) return; // doble clic: una sola petición
    const next: Errors = {};
    if (!course.trim()) next.course = 'Ingresá el nombre del curso.';
    let date: string | null = null;
    if (!dateText.trim()) next.date = 'Ingresá la fecha de finalización.';
    else {
      date = parseDisplayDate(dateText);
      if (!date) next.date = 'Ingresá una fecha válida con formato dd/mm/aaaa.';
      else if (date > todayBuenosAires()) next.date = 'La fecha no puede ser futura.';
    }
    if (!picked) next.file = errors.file ?? 'Elegí un archivo CSV.';
    setErrors(next);
    if (next.course || next.date || next.file || !date || !picked) {
      setFocusTick((t) => t + 1);
      return;
    }
    void send(date, picked);
  }

  const noticeProps = { ref: noticeRef, tabIndex: -1, className: 'op-notice' } as const;

  return (
    <div className="page page-narrow">
      <div className="op-head">
        <div>
          <Link className="lnk op-back" to="/operator/batches">← Lotes</Link>
          <h1 className="disp page-title">Nuevo lote</h1>
        </div>
      </div>

      {phase.s === 'network' && (
        <div {...noticeProps}>
          <div className="al al-warn" role="alert">
            <span aria-hidden="true">!</span>
            <div className="al-body">
              <b>No se pudo enviar el lote</b>
              <span>Hubo un problema de conexión. Lo que cargaste se conserva; no se emitió nada todavía.</span>
            </div>
          </div>
        </div>
      )}
      {phase.s === 'conflict' && (
        <div {...noticeProps}>
          <div className="al al-error" role="alert">
            <span aria-hidden="true">✕</span>
            <div className="al-body">
              <b>Este envío ya se había hecho con otros datos</b>
              <span>El sistema reconoció la solicitud anterior y no emitió nada con este intento. Revisá los datos y volvé a emitir.</span>
            </div>
          </div>
        </div>
      )}
      {phase.s === 'fileError' && (
        <div {...noticeProps}>
          <Alert tone="error" title="Se rechazó el archivo, no se emitió nada">
            {phase.message}. Corregí el archivo, elegí otro archivo y reenviá.
          </Alert>
        </div>
      )}
      {phase.s === 'error' && (
        <div {...noticeProps}>
          <div className="al al-error" role="alert"><span aria-hidden="true">✕</span><div className="al-body"><b>No se emitió nada</b><span>{phase.message}</span></div></div>
        </div>
      )}

      <Card>
        <form ref={formRef} className="op-form" onSubmit={onSubmit} noValidate aria-busy={sending || undefined}>
          <Field
            label="Nombre del curso" value={course} placeholder="Ej.: Redes y Seguridad I" maxLength={200} readOnly={sending}
            error={errors.course} onChange={(e) => { setCourse(e.target.value); setErrors((x) => ({ ...x, course: undefined })); touched(); }}
          />
          <Field
            label="Fecha de finalización" value={dateText} placeholder="dd/mm/aaaa" inputMode="numeric" readOnly={sending}
            error={errors.date} help="Formato dd/mm/aaaa."
            onChange={(e) => { setDateText(e.target.value); setErrors((x) => ({ ...x, date: undefined })); touched(); }}
          />
          <div className="fld">
            <span className="fld-label" id="csv-label">Archivo CSV</span>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-label="Archivo CSV" disabled={sending}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(f); }}
            />
            <div className={errors.file ? 'op-file op-file-err' : 'op-file'}>
              {picked ? (
                <>
                  <span className="op-file-name"><b>{picked.file.name}</b> <span className="help">· {picked.rows} filas · {formatSize(picked.file.size)}</span></span>
                  <Button variant="ghost" disabled={sending} onClick={() => fileRef.current?.click()}>Cambiar</Button>
                </>
              ) : (
                <Button variant="secondary" disabled={sending} aria-invalid={errors.file ? true : undefined} aria-describedby="csv-help csv-err" onClick={() => fileRef.current?.click()}>
                  Elegir archivo
                </Button>
              )}
            </div>
            {errors.file && <span id="csv-err" className="err">{errors.file}</span>}
            <span id="csv-help" className="help">
              {CSV_HELP} <a className="lnk" href={CSV_EXAMPLE_HREF} download={CSV_EXAMPLE_FILENAME}>Descargar CSV de ejemplo</a>
            </span>
          </div>
          <div className="op-actions">
            <Button variant="primary" type="submit" loading={sending} loadingLabel="Emitiendo…">
              {phase.s === 'network' ? '↻ Reintentar' : 'Emitir certificados'}
            </Button>
            {sending && <span className="help" role="status">Enviando {picked?.rows} alumnos. No cierres esta página.</span>}
            {phase.s === 'network' && <span className="help">Si el lote se emite, pasás al detalle del lote automáticamente.</span>}
          </div>
        </form>
      </Card>

      {phase.s === 'rejected' && (
        <CsvRejection ref={noticeRef} issues={phase.issues} totalRows={picked?.rows ?? null} onPickOther={() => fileRef.current?.click()} />
      )}
    </div>
  );
}
