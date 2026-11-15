import { forwardRef } from 'react';
import type { CsvIssue } from '../../api';
import { Button, Card, Table } from '../../components/ui';
import { describeIssue } from './csvIssues';

interface Props {
  issues: CsvIssue[];
  totalRows: number | null;
  onPickOther: () => void;
}

/** Rechazo completo del CSV (400 VALIDATION_ERROR): todas las filas con su motivo. El foco se mueve acá. */
export const CsvRejection = forwardRef<HTMLDivElement, Props>(function CsvRejection({ issues, totalRows, onPickOther }, ref) {
  const m = totalRows ?? issues.length;
  return (
    <div className="op-notice" ref={ref} tabIndex={-1}>
      <div className="al al-error" role="alert">
        <span aria-hidden="true">✕</span>
        <div className="al-body">
          <b>Se rechazó el archivo completo, no se emitió nada</b>
          <span>{issues.length} de {m} filas tienen problemas. Corregí el archivo, elegí otro archivo y reenviá.</span>
        </div>
      </div>
      <div className="op-tbl">
        <Table
          caption="Filas con problemas"
          rows={issues}
          rowKey={(i) => `${i.row}-${i.email}`}
          columns={[
            { key: 'row', header: 'Fila', render: (i) => i.row },
            { key: 'email', header: 'Email', render: (i) => i.email || '(vacío)' },
            { key: 'reason', header: 'Problema', render: (i) => describeIssue(i.reason) },
          ]}
          renderCard={(i) => (
            <Card className="op-reject-card">
              <span className="help">Fila {i.row} · {i.email || '(vacío)'}</span>
              <span>{describeIssue(i.reason)}</span>
            </Card>
          )}
        />
      </div>
      <div><Button variant="secondary" onClick={onPickOther}>Elegir otro archivo</Button></div>
    </div>
  );
});
