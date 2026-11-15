import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type Profile } from '../../api';

export type ProfileLoad = { s: 'loading' } | { s: 'ok'; profile: Profile } | { s: 'notfound' } | { s: 'error'; message: string };

/** Carga un perfil con reintento. `key` cambia → vuelve a cargar. */
export function useLoadProfile(load: () => Promise<Profile>, key: string) {
  const [state, setState] = useState<ProfileLoad>({ s: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async () => {
    try {
      const profile = await loadRef.current();
      if (alive.current) setState({ s: 'ok', profile });
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status === 404) setState({ s: 'notfound' });
      else setState({ s: 'error', message: e instanceof ApiError && e.status === 0 ? 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.' : 'No se pudo cargar el perfil. Intentá de nuevo.' });
    } finally {
      if (alive.current) setRetrying(false);
    }
  }, []);

  useEffect(() => { setState({ s: 'loading' }); void run(); }, [key, run]);
  const retry = () => { setRetrying(true); void run(); };
  return { state, retrying, retry };
}

/** document.title = "<Nombre> · Perfil" */
export function useProfileTitle(name?: string) {
  useEffect(() => {
    if (!name) return;
    const prev = document.title;
    document.title = `${name} · Perfil`;
    return () => { document.title = prev; };
  }, [name]);
}
