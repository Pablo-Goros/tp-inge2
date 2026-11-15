import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ProfileRole, ProfileSummary } from '../../api';
import { ROLE_LABEL } from '../../api/profileUtils';
import { Avatar, Button, Chip, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { useApi } from '../session/AuthProvider';
import { PAGE_SIZE, useDirectoryData } from './directoryData';
import '../operator/operator.css'; // .chip y .op-chips
import './directory.css';

const DEBOUNCE_MS = 300;
const TOP_SKILLS = 8;
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

type RoleFilter = '' | ProfileRole;
const parseRole = (v: string | null): RoleFilter => (v === 'student' || v === 'operator' ? v : '');
const parsePage = (v: string | null) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : 1; };

function ProfileCard({ p }: { p: ProfileSummary }) {
  return (
    <li>
      <Link to={`/p/${p.slug}`} className="card card-link dir-card">
        <Avatar src={p.avatarUrl} name={p.displayName} alt="" size="lg" />
        <h3 className="dir-name">{p.displayName}</h3>
        {p.headline && <p className="dir-headline">{p.headline}</p>}
        {p.location && <p className="help dir-loc">{p.location}</p>}
        <span className="dir-chips">
          <Chip tone="brand">{ROLE_LABEL[p.role]}</Chip>
          {p.institution && <Chip>{p.institution}</Chip>}
        </span>
        {p.topSkills.length > 0 && <span className="dir-skills" aria-label="Habilidades principales">{p.topSkills.slice(0, 3).join(' · ')}</span>}
      </Link>
    </li>
  );
}

/** Directorio público de personas (alumnos y tutores). Búsqueda, filtros y página viven en la URL. */
export function DirectoryPage() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const role = parseRole(params.get('role'));
  const skill = params.get('skill')?.trim() ?? '';
  const sort = params.get('sort') === 'name' ? 'name' : 'relevance';
  const rawPage = parsePage(params.get('page'));

  const [qInput, setQInput] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsHead = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => { document.title = 'Directorio'; }, []);
  useEffect(() => { setQInput(q); }, [q]); // Atrás/Adelante

  /** Cambia parámetros. `replace` para lo que se teclea; el resto suma al historial (Atrás funciona). Un filtro nuevo vuelve a la página 1. */
  function update(next: Record<string, string>, replace = false) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
      if (!('page' in next)) p.delete('page');
      return p;
    }, { replace });
  }

  useEffect(() => {
    if (qInput.trim() === q) return;
    const t = window.setTimeout(() => update({ q: qInput.trim() }, true), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const { state, retrying, retry } = useDirectoryData(api, q, skill);

  const view = useMemo(() => {
    if (state.s !== 'ok') return null;
    const { matches, universe } = state.data;
    const counts = { all: matches.length, student: matches.filter((m) => m.role === 'student').length, operator: matches.filter((m) => m.role === 'operator').length };
    const freq = new Map<string, { name: string; n: number }>();
    for (const m of universe) for (const s of m.topSkills) { const k = norm(s); freq.set(k, { name: s, n: (freq.get(k)?.n ?? 0) + 1 }); }
    let skills = [...freq.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'es')).slice(0, TOP_SKILLS).map((s) => s.name);
    if (skill && !skills.some((s) => norm(s) === norm(skill))) skills = [skill, ...skills.slice(0, TOP_SKILLS - 1)];
    let list = role ? matches.filter((m) => m.role === role) : matches;
    if (sort === 'name') list = [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const page = Math.min(rawPage, pages);
    return { counts, skills, total: list.length, pages, page, slice: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
  }, [state, role, sort, skill, rawPage]);

  // Los filtros no desaparecen mientras se recarga: se muestran con los últimos datos buenos.
  const lastView = useRef(view);
  if (view) lastView.current = view;
  const fv = view ?? lastView.current;

  // Al cambiar de página, el foco va al encabezado de resultados (no al primer render).
  const page = view?.page;
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (page && page > 1) resultsHead.current?.focus({ preventScroll: false });
  }, [page]);

  const hasFilters = !!(q || role || skill);
  const clear = () => { setQInput(''); setParams(new URLSearchParams(sort === 'name' ? { sort: 'name' } : {})); };
  const roleChips: [RoleFilter, string, number | undefined][] = [
    ['', 'Todos', fv?.counts.all], ['student', 'Alumnos', fv?.counts.student], ['operator', 'Tutores', fv?.counts.operator],
  ];
  const activeCount = (role ? 1 : 0) + (skill ? 1 : 0);

  return (
    <main className="page dir">
      <header className="dir-head">
        <h1 className="disp page-title">Directorio</h1>
        <p className="dir-lead">Encontrá alumnos y tutores por nombre, titular o habilidad. Todos los perfiles son públicos.</p>
      </header>

      <div className="dir-search">
        <label htmlFor="dir-q" className="sr-only">Buscar personas</label>
        <input id="dir-q" type="search" className="inp" placeholder="Buscá por nombre, titular o habilidad" value={qInput}
          onChange={(e) => setQInput(e.target.value)} autoComplete="off" />
        <Button variant="secondary" className="dir-toggle" aria-expanded={filtersOpen} aria-controls="dir-filters" onClick={() => setFiltersOpen((o) => !o)}>
          Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
      </div>

      <section id="dir-filters" className={filtersOpen ? 'dir-filters open' : 'dir-filters'} aria-label="Filtros">
        <div className="dir-group">
          <span className="lbl" id="dir-role-l">Rol</span>
          <div className="op-chips" role="group" aria-labelledby="dir-role-l">
            {roleChips.map(([value, label, n]) => (
              <button key={label} type="button" className="chip" aria-pressed={role === value} onClick={() => update({ role: value })}>
                {label}{n !== undefined ? ` (${n})` : ''}
              </button>
            ))}
          </div>
        </div>
        {fv && fv.skills.length > 0 && (
          <div className="dir-group">
            <span className="lbl" id="dir-skill-l">Habilidad</span>
            <div className="op-chips" role="group" aria-labelledby="dir-skill-l">
              {fv.skills.map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={norm(skill) === norm(s)} onClick={() => update({ skill: norm(skill) === norm(s) ? '' : s })}>{s}</button>
              ))}
            </div>
          </div>
        )}
        <div className="dir-group dir-sort">
          <label htmlFor="dir-sort" className="lbl">Orden</label>
          <select id="dir-sort" className="inp inp-sel" value={sort} onChange={(e) => update({ sort: e.target.value === 'name' ? 'name' : '' })}>
            <option value="relevance">Relevancia</option>
            <option value="name">Nombre (A-Z)</option>
          </select>
        </div>
      </section>

      <div className="dir-count" role="status" aria-live="polite">
        {state.s === 'ok' && view && (view.total === 0 ? 'Sin resultados' : `${view.total} ${view.total === 1 ? 'persona' : 'personas'}`)}
      </div>

      {state.s === 'loading' && (
        <div className="dir-grid" aria-busy="true" role="status">
          <span className="sr-only">Cargando personas…</span>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="card dir-sk"><Skeleton height={96} /><Skeleton height={18} /><Skeleton height={14} opacity={0.7} /></div>)}
        </div>
      )}
      {state.s === 'error' && <ErrorState message="No pudimos cargar el directorio. Intentá de nuevo." retrying={retrying} onRetry={retry} />}
      {view && state.s === 'ok' && view.total === 0 && (
        <EmptyState icon="·" title="No encontramos personas con esos filtros" description="Probá con otra búsqueda o quitá algún filtro."
          action={hasFilters ? <Button variant="secondary" onClick={clear}>Limpiar filtros</Button> : undefined} />
      )}
      {view && state.s === 'ok' && view.total > 0 && (
        <>
          <h2 className="dir-results-h" ref={resultsHead} tabIndex={-1}>Resultados{view.pages > 1 ? ` · página ${view.page} de ${view.pages}` : ''}</h2>
          <ul className="dir-grid" aria-label="Personas">
            {view.slice.map((p) => <ProfileCard key={p.slug} p={p} />)}
          </ul>
          {view.pages > 1 && (
            <nav className="dir-pager" aria-label="Paginación">
              <Button variant="secondary" disabled={view.page <= 1} onClick={() => update({ page: view.page - 1 > 1 ? String(view.page - 1) : '' })}>← Anterior</Button>
              <span className="help">Página {view.page} de {view.pages}</span>
              <Button variant="secondary" disabled={view.page >= view.pages} onClick={() => update({ page: String(view.page + 1) })}>Siguiente →</Button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}
