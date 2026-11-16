import { useEffect, useRef, useState } from 'react';
import type { BatchItem } from '../../api';
import { etherscanTxUrl } from '../../api/format';
import { CertStatusBadge, Table } from '../../components/ui';

export const MAX_ATTEMPTS = 3;
export type ItemFilter = 'all' | 'FAILED' | 'PENDING' | 'PROCESSING' | 'ISSUED';

const isRetry = (i: BatchItem) => i.status === 'PENDING' && i.attempts > 0;

/** Fallidos primero; luego reintentos, procesando, emitidos y pendientes. Estable dentro de cada grupo. */
export function sortItems(items: BatchItem[]): BatchItem[] {
  const rank = (i: BatchItem) => (i.status === 'FAILED' ? 0 : isRetry(i) ? 1 : i.status === 'PROCESSING' ? 2 : i.status === 'ISSUED' ? 3 : 4);
  return items.map((it, n) => ({ it, n })).sort((a, b) => rank(a.it) - rank(b.it) || a.n - b.n).map((x) => x.it);
}

/** Nota final con 2 decimales; "—" si falta. */
const gradeText = (i: BatchItem) => (i.final_grade == null ? '—' : i.final_grade.toFixed(2));

const showsAttemptsOfMax = (i: BatchItem) => i.status === 'FAILED' || i.status === 'PROCESSING' || isRetry(i);
const attemptsText = (i: BatchItem) => (showsAttemptsOfMax(i) ? `${i.attempts}/${MAX_ATTEMPTS}` : String(i.attempts));

/** Copia el enlace de la transacción; si el item no trae `tx_hash`, cae al identificador del certificado. */
function CopyId({ id, txHash }: { id: string; txHash?: string | null }) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  const shown = txHash ?? id;
  const text = txHash ? etherscanTxUrl(txHash) : id;
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); t.current = setTimeout(() => setCopied(false), 1500); } catch { /* sin portapapeles */ }
  }
  return (
    <span className="op-id">
      <code title={shown}>{shown.slice(-8)}</code>
      <button type="button" className="op-copy" onClick={() => void copy()}
        aria-label={txHash ? `Copiar enlace de la transacción ${txHash}` : `Copiar identificador ${id}`}>{copied ? 'Copiado' : 'Copiar'}</button>
    </span>
  );
}

function Detail({ item }: { item: BatchItem }) {
  if (item.status === 'ISSUED') return <CopyId id={item.certificate_id} txHash={item.tx_hash} />;
  if (item.last_error && (item.status === 'FAILED' || isRetry(item) || item.status === 'PROCESSING')) {
    return <span className={item.status === 'FAILED' ? 'op-fail' : 'op-warn'}>{item.last_error}</span>;
  }
  return <span className="help">—</span>;
}

interface Props { items: BatchItem[]; showGroup: boolean; failedCount: number; caption: string }

export function BatchItemsTable({ items, showGroup, failedCount, caption }: Props) {
  return (
    <Table
      caption={caption}
      rows={items}
      rowKey={(i) => i.certificate_id}
      rowClass={(i) => (i.status === 'FAILED' ? 'fail' : undefined)}
      groupBefore={(i, idx) => (showGroup && idx === 0 && i.status === 'FAILED' ? `Cola de fallidos · ${failedCount}` : null)}
      columns={[
        { key: 'name', header: 'Alumno', render: (i) => i.student_name },
        { key: 'email', header: 'Email', render: (i) => i.student_email },
        { key: 'st', header: 'Estado', render: (i) => <CertStatusBadge status={i.status} attempts={i.attempts} maxAttempts={MAX_ATTEMPTS} /> },
        { key: 'grade', header: 'Nota', render: (i) => (i.final_grade == null ? <span className="help">—</span> : gradeText(i)) },
        { key: 'att', header: 'Intentos', render: (i) => attemptsText(i) },
        { key: 'det', header: 'Último error / certificado', render: (i) => <Detail item={i} /> },
      ]}
      renderCard={(i) => (
        <div className={i.status === 'FAILED' ? 'mi mi-fail' : 'mi'}>
          <div className="mi-head"><b>{i.student_name}</b><CertStatusBadge status={i.status} attempts={i.attempts} maxAttempts={MAX_ATTEMPTS} /></div>
          <span className="help">{i.student_email}{i.final_grade != null && ` · Nota ${gradeText(i)}`}</span>
          {showsAttemptsOfMax(i) || i.status === 'ISSUED' ? (
            <span style={{ fontSize: 12 }}>
              {showsAttemptsOfMax(i) && attemptsText(i)}
              {showsAttemptsOfMax(i) && (i.last_error || i.status === 'ISSUED') && ' · '}
              {(i.last_error || i.status === 'ISSUED') && <Detail item={i} />}
            </span>
          ) : null}
        </div>
      )}
    />
  );
}
