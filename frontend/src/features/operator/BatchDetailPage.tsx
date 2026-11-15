import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { shortBatchCode, type BatchDetail } from '../../api';
import {
  BatchStatusBadge, Card, EmptyState, ErrorState, LinkButton, SegmentedProgress, SkeletonList,
} from '../../components/ui';
import { formatDate } from '../verify/RegisteredDataCard';
import { BatchItemsTable, sortItems, type ItemFilter } from './BatchItemsTable';
import { usePollBatch } from './usePollBatch';
import './operator.css';

const FILTERS: [ItemFilter, string][] = [
  ['all', 'Todos'], ['FAILED', 'Fallidos'], ['PENDING', 'Pendientes'], ['PROCESSING', 'Procesando'], ['ISSUED', 'Emitidos'],
];

function StaleNotice({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const secs = Math.max(0, Math.round((now - since) / 1000));
  return <p className="help op-stale" role="status">! No se pudo actualizar. Mostrando datos de hace {secs} s · reintentando…</p>;
}

function BackLink() {
  return <Link className="lnk op-back" to="/operator/batches">← Lotes</Link>;
}

function Detail({ batch, stale, updatedAt }: { batch: BatchDetail; stale: boolean; updatedAt: number }) {
  const [filter, setFilter] = useState<ItemFilter>('all');
  const c = batch.counts;
  const inProgress = batch.status === 'IN_PROGRESS';
  const n = (f: ItemFilter) => (f === 'all' ? batch.items.length : batch.items.filter((i) => i.status === f).length);
  const active = filter !== 'all' && n(filter) === 0 ? 'all' : filter;
  const rows = sortItems(active === 'all' ? batch.items : batch.items.filter((i) => i.status === active));
  const meta = [`Lote ${shortBatchCode(batch.batch_id)}`, `finalización ${formatDate(batch.completion_date)}`];
  if (batch.created_at) meta.push(`creado ${formatDate(batch.created_at)}`);

  const tiles: [string, number, string | undefined][] = [
    ['Pendientes', c.pending, undefined], ['Procesando', c.processing, 'var(--info)'],
    ['Emitidos', c.issued, 'var(--ok)'], ['Fallidos', c.failed, 'var(--bad)'], ['Total', c.total, undefined],
  ];

  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <BackLink />
        <div className="op-title-row">
          <h1 className="disp page-title">{batch.course_name}</h1>
          <BatchStatusBadge status={batch.status} />
        </div>
        <p className="help">{meta.join(' · ')}</p>
      </div>

      <Card>
        <div className="stack">
          <SegmentedProgress counts={c} legend />
          <div className="op-tiles">
            {tiles.map(([label, value, color]) => (
              <div className="op-tile" key={label}>
                <span className="help" style={{ color }}>{label}</span>
                <b style={{ color }}>{value}</b>
              </div>
            ))}
          </div>
          {inProgress && (
            <p className="help op-live"><span className="spin" style={{ color: 'var(--info)' }} aria-hidden="true" />El progreso se actualiza solo mientras tengas abierta esta página.</p>
          )}
          {stale && <StaleNotice since={updatedAt} />}
        </div>
      </Card>

      {batch.status === 'COMPLETED_WITH_ERRORS' && (
        <div className="al al-warn" role="status">
          <span aria-hidden="true">!</span>
          <span>{c.failed === 1 ? '1 certificado no pudo emitirse' : `${c.failed} certificados no pudieron emitirse`}; el resto se emitió.</span>
        </div>
      )}

      <div className="op-chips" role="group" aria-label="Filtrar por estado">
        {FILTERS.filter(([f]) => f === 'all' || n(f) > 0).map(([f, label]) => (
          <button key={f} type="button" className="chip" aria-pressed={active === f} onClick={() => setFilter(f)}>
            {label} ({n(f)})
          </button>
        ))}
      </div>

      <div className="op-tbl">
        <BatchItemsTable items={rows} showGroup={active === 'all'} failedCount={n('FAILED')} caption="Alumnos del lote" />
      </div>
    </>
  );
}

export function BatchDetailPage() {
  const { id = '' } = useParams();
  const poll = usePollBatch(id);
  return (
    <div className="page">
      {poll.kind !== 'ok' && <h1 className="sr-only">Detalle del lote</h1>}
      {poll.kind === 'loading' && <><BackLink /><SkeletonList label="Cargando lote…" rows={5} height={44} /></>}
      {poll.kind === 'error' && (
        <>
          <BackLink />
          <ErrorState message="No se pudo cargar el lote. Revisá tu conexión e intentá de nuevo." onRetry={poll.reload} />
        </>
      )}
      {poll.kind === 'notfound' && (
        <>
          <BackLink />
          <EmptyState
            icon="?" title="Lote no encontrado" description="El lote no existe o el enlace es incorrecto."
            action={<LinkButton to="/operator/batches" variant="secondary">Volver a lotes</LinkButton>}
          />
        </>
      )}
      {poll.kind === 'ok' && <Detail batch={poll.batch} stale={poll.stale} updatedAt={poll.updatedAt} />}
    </div>
  );
}
