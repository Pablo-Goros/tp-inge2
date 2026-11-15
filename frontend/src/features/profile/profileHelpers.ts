import type { Profile } from '../../api';

/** "2026-10-16" → "16/10/2026". */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** Dominio legible de una URL ("github.com/camila"). */
export function prettyUrl(url: string): string {
  try { const u = new URL(url); return (u.host + u.pathname).replace(/\/$/, ''); } catch { return url; }
}

/** Ancla de edición (etapa C) para cada ítem de completitud. avatar/headline/location viven en el bloque "basics". */
export function editHash(key: string): string {
  return ['avatar', 'headline', 'location'].includes(key) ? 'basics' : key;
}

export const profileUrl = (p: Pick<Profile, 'slug'>) => `${window.location.origin}/p/${p.slug}`;

export function groupSkills(skills: Profile['skills']): { category: string; items: Profile['skills'] }[] {
  const map = new Map<string, Profile['skills']>();
  for (const s of skills) {
    const c = s.category?.trim() || 'Otras';
    map.set(c, [...(map.get(c) ?? []), s]);
  }
  return [...map].map(([category, items]) => ({ category, items: [...items].sort((a, b) => b.level - a.level) }));
}
