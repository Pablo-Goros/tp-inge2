import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  /** Clase de fila en escritorio (p. ej. "fail"). */
  rowClass?: (row: T) => string | undefined;
  /** Tarjeta móvil a medida. Por defecto: 1.ª columna como título y el resto como líneas etiquetadas. */
  renderCard?: (row: T) => ReactNode;
  /** Fila de encabezado de grupo antes de la fila indicada (p. ej. "Cola de fallidos"). */
  groupBefore?: (row: T, index: number) => string | null;
}

/** Tabla en escritorio; lista de tarjetas en móvil (≤720 px, ver global.css). */
export function Table<T>({ columns, rows, rowKey, caption, rowClass, renderCard, groupBefore }: Props<T>) {
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const group = groupBefore?.(row, i);
              return (
                <GroupedRow key={rowKey(row)} group={group} span={columns.length}>
                  <tr className={rowClass?.(row)}>
                    {columns.map((c) => (
                      <td key={c.key} className={c.numeric ? 'num' : undefined}>{c.render(row)}</td>
                    ))}
                  </tr>
                </GroupedRow>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="cards" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={caption}>
        {rows.map((row, i) => {
          const group = groupBefore?.(row, i);
          return (
            <li key={rowKey(row)} style={{ display: 'contents' }}>
              {group && <div className="lbl" style={{ color: 'var(--red)' }}>{group}</div>}
              {renderCard ? renderCard(row) : <DefaultCard columns={columns} row={row} fail={rowClass?.(row) === 'fail'} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function GroupedRow({ group, span, children }: { group?: string | null; span: number; children: ReactNode }) {
  return (
    <>
      {group && (
        <tr className="sep"><td colSpan={span}>{group}</td></tr>
      )}
      {children}
    </>
  );
}

function DefaultCard<T>({ columns, row, fail }: { columns: Column<T>[]; row: T; fail?: boolean }) {
  const [first, ...rest] = columns;
  return (
    <div className={fail ? 'mi mi-fail' : 'mi'}>
      <div className="mi-head"><b>{first.render(row)}</b></div>
      {rest.map((c) => (
        <div key={c.key} className="mi-line"><span>{c.header}</span><b>{c.render(row)}</b></div>
      ))}
    </div>
  );
}
