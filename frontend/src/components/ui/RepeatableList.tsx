import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';

interface Props<T extends { id: string }> {
  /** Nombre del tipo de ítem en singular ("experiencia"), para botones y avisos. */
  noun: string;
  addLabel: string;
  emptyText: string;
  items: T[];
  onChange: (next: T[]) => void;
  createItem: () => T;
  summary: (item: T) => { title: string; meta?: string };
  /** Cantidad de errores del ítem (se muestra en su encabezado). */
  errorCount?: (item: T) => number;
  /** Cambia cuando se intenta guardar con errores: abre los ítems con errores. */
  openSignal?: number;
  renderFields: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
}

/** Lista dinámica de tarjetas colapsables: agregar, quitar (con confirmación en línea) y reordenar con botones. */
export function RepeatableList<T extends { id: string }>({ noun, addLabel, emptyText, items, onChange, createItem, summary, errorCount, openSignal, renderFields }: Props<T>) {
  const uid = useId();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const focusId = useRef<string | null>(null);
  const refs = useRef(new Map<string, HTMLLIElement | null>());

  useEffect(() => {
    if (openSignal === undefined) return;
    setOpen((o) => { const n = new Set(o); for (const it of items) if (errorCount?.(it)) n.add(it.id); return n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  useEffect(() => {
    if (!focusId.current) return;
    const el = refs.current.get(focusId.current)?.querySelector<HTMLElement>('.rl-body input, .rl-body select, .rl-body textarea');
    focusId.current = null;
    el?.focus();
  });

  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  function add() {
    const it = createItem();
    focusId.current = it.id;
    setOpen((o) => new Set(o).add(it.id));
    onChange([...items, it]);
    setAnnounce(`Se agregó ${noun} nueva. Ahora hay ${items.length + 1}.`);
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setAnnounce(`${summary(items[i]).title || `Ítem ${i + 1}`} pasó al lugar ${j + 1} de ${items.length}.`);
    // El botón se desmonta y vuelve a montar en otra posición: se devuelve el foco al mismo botón.
    requestAnimationFrame(() => {
      const root = refs.current.get(items[i].id);
      const pick = (a: string) => root?.querySelector<HTMLElement>(`[data-act="${a}"]:not([disabled])`);
      (pick(d === -1 ? 'up' : 'down') ?? pick(d === -1 ? 'down' : 'up'))?.focus();
    });
  }
  function remove(i: number) {
    const it = items[i];
    onChange(items.filter((x) => x.id !== it.id));
    setConfirming(null);
    setAnnounce(`Quitaste ${summary(it).title || noun}. Quedan ${items.length - 1}.`);
  }

  return (
    <div className="rl">
      {items.length === 0 && <p className="rl-empty">{emptyText}</p>}
      <ol className="rl-list">
        {items.map((it, i) => {
          const s = summary(it);
          const title = s.title.trim() || `Nueva ${noun}`;
          const isOpen = open.has(it.id);
          const errs = errorCount?.(it) ?? 0;
          const bodyId = `${uid}-${it.id}`;
          return (
            <li key={it.id} className="rl-item" ref={(el) => { refs.current.set(it.id, el); }}>
              <div className="rl-head">
                <button type="button" className="rl-toggle" aria-expanded={isOpen} aria-controls={isOpen ? bodyId : undefined} onClick={() => toggle(it.id)}>
                  <span className="rl-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  <span className="rl-sum"><b>{title}</b>{s.meta && <span className="help">{s.meta}</span>}</span>
                  {errs > 0 && <span className="uchip uchip-bad">{errs === 1 ? '1 error' : `${errs} errores`}</span>}
                </button>
                <div className="rl-acts">
                  <button type="button" className="rl-btn" data-act="up" disabled={i === 0} aria-label={`Subir ${title}`} onClick={() => move(i, -1)}>↑<span className="rl-lbl"> Subir</span></button>
                  <button type="button" className="rl-btn" data-act="down" disabled={i === items.length - 1} aria-label={`Bajar ${title}`} onClick={() => move(i, 1)}>↓<span className="rl-lbl"> Bajar</span></button>
                  {confirming === it.id ? (
                    <span className="rl-confirm" role="group" aria-label={`Confirmar quitar ${title}`}>
                      <span>¿Quitar?</span>
                      <button type="button" className="rl-btn rl-danger" onClick={() => remove(i)}>Sí<span className="sr-only">, quitar {title}</span></button>
                      <button type="button" className="rl-btn" autoFocus onClick={() => setConfirming(null)}>No</button>
                    </span>
                  ) : (
                    <button type="button" className="rl-btn rl-danger" aria-label={`Quitar ${title}`} onClick={() => setConfirming(it.id)}>Quitar</button>
                  )}
                </div>
              </div>
              {isOpen && (
                <div id={bodyId} className="rl-body">
                  {renderFields(it, (patch) => onChange(items.map((x) => (x.id === it.id ? { ...x, ...patch } : x))))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" onClick={add}>+ {addLabel}</Button>
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>
    </div>
  );
}
