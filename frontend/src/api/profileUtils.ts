import type { CoverStyle, Profile, ProfileRole, ProfileSummary, SectionKey } from './types';

export const ROLE_LABEL: Record<ProfileRole, string> = { student: 'Alumno', operator: 'Tutor' };

export const COVER_STYLES: { id: CoverStyle; label: string }[] = [
  { id: 'ondas', label: 'Ondas' }, { id: 'malla', label: 'Malla' }, { id: 'diagonal', label: 'Diagonal' }, { id: 'puntos', label: 'Puntos' },
  { id: 'arcos', label: 'Arcos' }, { id: 'tramas', label: 'Tramas' }, { id: 'aurora', label: 'Aurora' }, { id: 'cuadricula', label: 'Cuadrícula' },
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  about: 'Acerca de', experience: 'Experiencia', education: 'Educación', skills: 'Aptitudes', languages: 'Idiomas',
  projects: 'Proyectos', achievements: 'Logros', publications: 'Publicaciones', volunteering: 'Voluntariado',
  interests: 'Intereses', certificates: 'Certificados destacados', links: 'Enlaces', teaching: 'Docencia',
};
export const SECTION_KEYS = Object.keys(SECTION_LABELS) as SectionKey[];

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isValidSlug = (s: string) => s.length >= 3 && s.length <= 40 && SLUG_RE.test(s);

/** "María José Núñez" → "maria-jose-nunez". */
export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export interface CompletenessItem { key: string; label: string; done: boolean; weight: number }

/** Pesos (suman 100). Para tutores, 5 puntos de "proyectos" pasan a "docencia" completa. */
function checks(p: Profile): CompletenessItem[] {
  const tutor = p.role === 'operator';
  const teaching = !!p.specialties?.length && !!p.subjectsTaught?.length && !!p.teachingApproach?.trim();
  return [
    { key: 'avatar', label: 'Agregá una foto de perfil', done: !!p.avatarUrl, weight: 10 },
    { key: 'headline', label: 'Escribí un titular', done: p.headline.trim().length >= 10, weight: 10 },
    { key: 'about', label: 'Completá el resumen (al menos 80 caracteres)', done: p.about.trim().length >= 80, weight: 10 },
    { key: 'location', label: 'Indicá tu ubicación', done: !!p.location.trim(), weight: 5 },
    { key: 'experience', label: 'Sumá una experiencia', done: p.experience.length >= 1, weight: 15 },
    { key: 'education', label: 'Sumá tu educación', done: p.education.length >= 1, weight: 10 },
    { key: 'skills', label: 'Cargá al menos 5 aptitudes', done: p.skills.length >= 5, weight: 15 },
    { key: 'languages', label: 'Agregá tus idiomas', done: p.languages.length >= 1, weight: 5 },
    { key: 'projects', label: 'Sumá un proyecto', done: p.projects.length >= 1, weight: tutor ? 5 : 10 },
    ...(tutor ? [{ key: 'teaching', label: 'Completá tu docencia (especialidades, materias y enfoque)', done: teaching, weight: 5 }] : []),
    { key: 'links', label: 'Agregá un enlace', done: p.links.length >= 1, weight: 5 },
    { key: 'certificates', label: 'Destacá un certificado', done: p.certificatesFeatured.length >= 1, weight: 5 },
  ];
}

export function profileCompleteness(p: Profile): { percent: number; missing: { key: string; label: string }[] } {
  const items = checks(p);
  const total = items.reduce((s, i) => s + i.weight, 0);
  const got = items.reduce((s, i) => s + (i.done ? i.weight : 0), 0);
  return { percent: Math.round((got / total) * 100), missing: items.filter((i) => !i.done).map(({ key, label }) => ({ key, label })) };
}

export function toSummary(p: Profile): ProfileSummary {
  const topSkills = [...p.skills].sort((a, b) => b.level - a.level).slice(0, 3).map((s) => s.name);
  return { slug: p.slug, displayName: p.displayName, headline: p.headline, avatarUrl: p.avatarUrl, role: p.role, location: p.location, topSkills, institution: p.institution };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "2024-03" → "mar 2024". */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const i = Number(m) - 1;
  return MONTHS[i] ? `${MONTHS[i]} ${y}` : y;
}
/** Rango para timelines: "mar 2023 – actual". */
export const formatRange = (start: string, end: string | null) => `${formatMonth(start)} – ${end ? formatMonth(end) : 'actual'}`;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
