import { useEffect, useState } from 'react';

/** matchMedia reactivo. Sin matchMedia (tests) devuelve `fallback`. */
export function useMedia(query: string, fallback = false): boolean {
  const get = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
