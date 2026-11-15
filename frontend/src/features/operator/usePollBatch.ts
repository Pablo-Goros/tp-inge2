import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type BatchDetail } from '../../api';
import { useApi } from '../session/AuthProvider';

export const POLL_MS = 2000;

export type PollState =
  | { kind: 'loading' }
  | { kind: 'notfound' }
  | { kind: 'error' } // la carga inicial falló
  | { kind: 'ok'; batch: BatchDetail; updatedAt: number; stale: boolean };

/**
 * Trae el lote y, mientras esté IN_PROGRESS, lo vuelve a pedir cada 2 s con setTimeout recursivo
 * (nunca solapa peticiones). Se detiene al completarse y al desmontar. Si un refresco falla,
 * conserva los datos mostrados (`stale`) y sigue reintentando.
 */
export function usePollBatch(id: string): PollState & { reload: () => void } {
  const api = useApi();
  const [state, setState] = useState<PollState>({ kind: 'loading' });
  const [run, setRun] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    hasData.current = false;
    setState({ kind: 'loading' });

    const tick = async () => {
      try {
        const batch = await api.getBatch(id);
        if (cancelled) return;
        hasData.current = true;
        setState({ kind: 'ok', batch, updatedAt: Date.now(), stale: false });
        if (batch.status !== 'IN_PROGRESS') return;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) { setState({ kind: 'notfound' }); return; }
        if (!hasData.current) { setState({ kind: 'error' }); return; }
        setState((s) => (s.kind === 'ok' ? { ...s, stale: true } : s));
      }
      timer = setTimeout(() => { void tick(); }, POLL_MS);
    };
    void tick();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [api, id, run]);

  const reload = useCallback(() => setRun((n) => n + 1), []);
  return { ...state, reload };
}
