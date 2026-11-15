import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient, ProfileSummary } from '../../api';

/** Tamaño de página del contrato de searchProfiles (el backend devuelve de a 12). */
export const PAGE_SIZE = 12;
const MAX_PAGES = 25; // tope de seguridad: 300 perfiles

/**
 * searchProfiles no informa el total, así que se piden las páginas hasta que una venga incompleta y se pagina en el
 * cliente. TODO(equipo): cuando el backend devuelva `total`, pedir solo la página visible y los conteos por rol.
 */
export async function fetchAllProfiles(api: ApiClient, params: { q?: string; skill?: string }): Promise<ProfileSummary[]> {
  const out: ProfileSummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const chunk = await api.searchProfiles({ ...params, page });
    out.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return out;
}

export interface DirData { matches: ProfileSummary[]; universe: ProfileSummary[] }
export type DirState = { s: 'loading' } | { s: 'ok'; data: DirData } | { s: 'error' };

/**
 * `matches`: personas que cumplen búsqueda + habilidad. `universe`: las que cumplen solo la búsqueda (para ofrecer las
 * habilidades más frecuentes aunque ya haya una elegida).
 */
export function useDirectoryData(api: ApiClient, q: string, skill: string) {
  const [state, setState] = useState<DirState>({ s: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    let current = true;
    setState({ s: 'loading' });
    (async () => {
      try {
        const [matches, universe] = await Promise.all([
          fetchAllProfiles(api, { q, skill }),
          skill ? fetchAllProfiles(api, { q }) : null,
        ]);
        if (current && alive.current) setState({ s: 'ok', data: { matches, universe: universe ?? matches } });
      } catch {
        if (current && alive.current) setState({ s: 'error' });
      } finally {
        if (current && alive.current) setRetrying(false);
      }
    })();
    return () => { current = false; };
  }, [api, q, skill, nonce]);

  const retry = useCallback(() => { setRetrying(true); setNonce((n) => n + 1); }, []);
  return { state, retrying, retry };
}
