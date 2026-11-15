import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { shortBatchCode, type BatchSummary } from '../../api';
import {
  BatchStatusBadge, EmptyState, ErrorState, LinkButton, SegmentedProgress, SkeletonList, Table, type Column,
} from '../../components/ui';
import { formatDate } from '../verify/RegisteredDataCard';
import { useApi } from '../session/AuthProvider';
import './operator.css';

type Load = { s: 'loading' } | { s: 'ok'; items: BatchSummary[] } | { s: 'error' };

const withTotal = (b: BatchSummary) => ({ ...b.counts, total: b.total });

const columns: Column<BatchSummary>[] = [
  { key: 'code', header: 'Código', render: (b) => <span className="op-code">{shortBatchCode(b.batch_id)}</span> },
  { key: 'course', header: 'Curso', render: (b) => <Link className="lnk" to={`/operator/batches/${b.batch_id}`}>{b.course_name}</Link> },
  { key: 'date', header: 'Finalización', render: (b) => formatDate(b.completion_date) },
  { key: 'status', header: 'Estado', render: (b) => <BatchStatusBadge status={b.status} /> },
  { key: 'total', header: 'Total', numeric: true, render: (b) => b.total },
  { key: 'issued', header: 'Emitidos', numeric: true, render: (b) => b.counts.issued },
  { key: 'failed', header: 'Fallidos', numeric: true, render: (b) => <span className={b.counts.failed > 0 ? 'op-fail' : undefined}>{b.counts.failed}</span> },
  { key: 'created', header: 'Creado', render: (b) => formatDate(b.created_at) },
];

function BatchCard({ b }: { b: BatchSummary }) {
  return (
    <Link to={`/operator/batches/${b.batch_id}`} className="card op-mini-card">
      <div className="op-row-head"><b>{b.course_name}</b><span className="op-code">{shortBatchCode(b.batch_id)}</span></div>
      <div><BatchStatusBadge status={b.status} /></div>
      <SegmentedProgress counts={withTotal(b)} compact />
      <div className="help">
        {b.counts.issued} de {b.total} emitidos · <span className={b.counts.failed > 0 ? 'op-fail' : undefined}>{b.counts.failed} fallidos</span>
      </div>
      <div className="help">Finaliza {formatDate(b.completion_date)} · creado {formatDate(b.created_at)}</div>
    </Link>
  );
}

export function BatchListPage() {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ s: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const fetchList = useCallback(async () => {
    try {
      const items = await api.listBatches();
      if (alive.current) setLoad({ s: 'ok', items });
    } catch {
      if (alive.current) setLoad({ s: 'error' });
    } finally {
      if (alive.current) setRetrying(false);
    }
  }, [api]);
  useEffect(() => { void fetchList(); }, [fetchList]);

  // Más recientes primero (el contrato ya lo promete; se garantiza en el cliente).
  const sorted = useMemo(
    () => (load.s === 'ok' ? [...load.items].sort((a, b) => b.created_at.localeCompare(a.created_at)) : []),
    [load],
  );
  const newBtn = <LinkButton to="/operator/batches/new">+ Nuevo lote</LinkButton>;

  return (
    <div className="page">
      <div className="op-head">
        <div>
          <h1 className="disp grad page-title">Lotes</h1>
          <p className="help">Emisiones de certificados por curso.</p>
        </div>
        {newBtn}
      </div>
      {load.s === 'loading' && <SkeletonList label="Cargando lotes…" rows={5} />}
      {load.s === 'error' && (
        <ErrorState
          message="No se pudo cargar la lista de lotes. Revisá tu conexión e intentá de nuevo."
          retrying={retrying}
          onRetry={() => { setRetrying(true); void fetchList(); }}
        />
      )}
      {load.s === 'ok' && sorted.length === 0 && (
        <EmptyState
          title="Todavía no hay lotes"
          description="Cargá un CSV de alumnos para emitir los primeros certificados."
          action={newBtn}
        />
      )}
      {load.s === 'ok' && sorted.length > 0 && (
        <div className="op-tbl">
          <Table
            caption="Lotes de certificados"
            rows={sorted}
            rowKey={(b) => b.batch_id}
            columns={columns}
            renderCard={(b) => <BatchCard b={b} />}
          />
        </div>
      )}
    </div>
  );
}
