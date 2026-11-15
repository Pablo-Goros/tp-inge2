import { useCallback, useEffect, useRef, useState } from 'react';

export type Async<T> = { s: 'loading' } | { s: 'ok'; data: T } | { s: 'error' };

/** Carga una vez (y al cambiar `key`) con reintento. Cada tarjeta del inicio usa la suya: una que falla no afecta a las otras. */
export function useAsync<T>(load: () => Promise<T>, key: unknown = null) {
  const [state, setState] = useState<Async<T>>({ s: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const alive = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async () => {
    try {
      const data = await loadRef.current();
      if (alive.current) setState({ s: 'ok', data });
    } catch {
      if (alive.current) setState({ s: 'error' });
    } finally {
      if (alive.current) setRetrying(false);
    }
  }, []);

  useEffect(() => { setState({ s: 'loading' }); void run(); }, [key, run]);
  const retry = useCallback(() => { setRetrying(true); void run(); }, [run]);
  return { state, retrying, retry };
}
