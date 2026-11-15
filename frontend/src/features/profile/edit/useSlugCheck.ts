import { useEffect, useState } from 'react';
import type { ApiClient } from '../../../api';
import { isValidSlug } from '../../../api/profileUtils';

export type SlugStatus = 'current' | 'invalid' | 'checking' | 'available' | 'taken' | 'unknown';

/** Verifica la disponibilidad del enlace con debounce. `unknown` = no se pudo consultar (el servidor decide al guardar). */
export function useSlugCheck(api: ApiClient, slug: string, savedSlug: string, delay = 400): SlugStatus {
  const base: SlugStatus = slug === savedSlug ? 'current' : !isValidSlug(slug) ? 'invalid' : 'checking';
  const [result, setResult] = useState<{ slug: string; status: SlugStatus } | null>(null);

  useEffect(() => {
    if (base !== 'checking') return;
    let alive = true;
    const t = window.setTimeout(() => {
      api.checkSlugAvailable(slug)
        .then((ok) => { if (alive) setResult({ slug, status: ok ? 'available' : 'taken' }); })
        .catch(() => { if (alive) setResult({ slug, status: 'unknown' }); });
    }, delay);
    return () => { alive = false; window.clearTimeout(t); };
  }, [api, slug, base, delay]);

  if (base !== 'checking') return base;
  return result && result.slug === slug ? result.status : 'checking';
}
