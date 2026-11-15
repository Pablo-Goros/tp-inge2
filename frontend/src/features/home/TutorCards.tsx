import { Link } from 'react-router-dom';
import { shortBatchCode, type BatchSummary } from '../../api';
import { BatchStatusBadge, EmptyState, LinkButton, SegmentedProgress } from '../../components/ui';
import { formatDate } from '../verify/RegisteredDataCard';
import { HomeCard } from './HomeCard';
import type { Async } from './useAsync';

export interface BatchesLoad { state: Async<BatchSummary[]>; retrying: boolean; retry: () => void }

const withTotal = (b: BatchSummary) => ({ ...b.counts, total: b.total });
const pct = (b: BatchSummary) => (b.total > 0 ? Math.round((b.counts.issued / b.total) * 100) : 0);

export function BatchesCard({ load, span }: { load: BatchesLoad; span?: string }) {
  return (
    <HomeCard title="Lotes recientes" span={span} state={load.state} retrying={load.retrying} onRetry={load.retry} skeleton={[72, 48, 48]} errorMessage="No pudimos cargar los lotes."
      action={{ to: '/operator/batches', label: 'Ver todos los lotes' }}>
      {(all) => {
        const sorted = [...all].sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (sorted.length === 0) {
          return <EmptyState icon="·" title="Todavía no hay lotes" description="Cargá un CSV de alumnos para emitir los primeros certificados." action={<LinkButton to="/operator/batches/new">+ Nuevo lote</LinkButton>} />;
        }
        const live = sorted.find((b) => b.status === 'IN_PROGRESS');
        const rest = sorted.filter((b) => b !== live).slice(0, live ? 3 : 4);
        return (
          <div className="hm-batches">
            {live && (
              <Link to={`/operator/batches/${live.batch_id}`} className="hm-live card-link" aria-label={`Lote en curso: ${live.course_name}, ${live.counts.issued} de ${live.total} emitidos`}>
                <span className="lbl">Lote en curso</span>
                <b className="hm-live-title">{live.course_name}</b>
                <SegmentedProgress counts={withTotal(live)} compact />
                <span className="help">{live.counts.issued} de {live.total} emitidos ({pct(live)}%)</span>
              </Link>
            )}
            <ul className="hm-batch-list">
              {rest.map((b) => (
                <li key={b.batch_id}>
                  <Link to={`/operator/batches/${b.batch_id}`} className="hm-batch card-link">
                    <span className="hm-batch-main">
                      <b>{b.course_name}</b>
                      <span className="op-code">{shortBatchCode(b.batch_id)} · {formatDate(b.created_at)}</span>
                    </span>
                    <span className="hm-batch-side">
                      <BatchStatusBadge status={b.status} />
                      <span className="hm-mini"><SegmentedProgress counts={withTotal(b)} compact /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </HomeCard>
  );
}

export function StatsCard({ load, span }: { load: BatchesLoad; span?: string }) {
  return (
    <HomeCard title="Resumen de emisión" span={span} state={load.state} retrying={load.retrying} onRetry={load.retry} skeleton={[72]} errorMessage="No pudimos calcular el resumen.">
      {(all) => {
        const issued = all.reduce((s, b) => s + b.counts.issued, 0);
        const done = all.filter((b) => b.status !== 'IN_PROGRESS').length;
        const failed = all.reduce((s, b) => s + b.counts.failed, 0);
        const stats: [string, number, string?][] = [
          ['Certificados emitidos', issued], ['Lotes completados', done], ['Fallidos a revisar', failed, failed > 0 ? 'hm-stat-warn' : undefined],
        ];
        return (
          <dl className="hm-stats">
            {stats.map(([label, n, cls]) => (
              <div key={label} className={['hm-stat', cls].filter(Boolean).join(' ')}>
                <dd className="hm-stat-n">{n}</dd>
                <dt className="hm-stat-l">{label}</dt>
              </div>
            ))}
          </dl>
        );
      }}
    </HomeCard>
  );
}
