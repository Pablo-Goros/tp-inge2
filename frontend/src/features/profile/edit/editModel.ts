import type { Profile, SkillItem } from '../../../api';
import { isValidSlug } from '../../../api/profileUtils';

/** Bloques del editor, en orden. `tutor`/`student` limitan el bloque a un rol. */
export interface EditSection { id: string; label: string; only?: 'student' | 'operator' }
export const EDIT_SECTIONS: EditSection[] = [
  { id: 'basics', label: 'Básicos' },
  { id: 'about', label: 'Acerca de' },
  { id: 'goals', label: 'Objetivos y búsqueda', only: 'student' },
  { id: 'teaching', label: 'Docencia', only: 'operator' },
  { id: 'experience', label: 'Experiencia' },
  { id: 'education', label: 'Educación' },
  { id: 'skills', label: 'Aptitudes' },
  { id: 'languages', label: 'Idiomas' },
  { id: 'projects', label: 'Proyectos' },
  { id: 'achievements', label: 'Logros' },
  { id: 'publications', label: 'Publicaciones' },
  { id: 'volunteering', label: 'Voluntariado' },
  { id: 'certificates', label: 'Certificados destacados' },
  { id: 'links', label: 'Enlaces' },
  { id: 'interests', label: 'Intereses' },
];
export const sectionsFor = (role: Profile['role']) => EDIT_SECTIONS.filter((s) => !s.only || s.only === role);

export const LIMITS = { headline: 120, about: 2000, goals: 500, approach: 1500, displayName: 80 };
export const LANGUAGE_LEVELS = ['Básico', 'Intermedio', 'Avanzado', 'Nativo'] as const;
export const MODALITIES = ['Presencial', 'Virtual', 'Híbrida'] as const;
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const LINK_KINDS: { value: Profile['links'][number]['kind']; label: string }[] = [
  { value: 'web', label: 'Sitio web' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'github', label: 'GitHub' },
  { value: 'portfolio', label: 'Portfolio' }, { value: 'otro', label: 'Otro' },
];
export const SKILL_LEVELS: Record<SkillItem['level'], string> = { 1: 'Básico', 2: 'Elemental', 3: 'Intermedio', 4: 'Avanzado', 5: 'Experto' };

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isHttps(url: string): boolean {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

/** Errores por campo. La clave empieza con el id del bloque: "experience.<id>.title". */
export type Errors = Record<string, string>;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function req(e: Errors, key: string, v: string | undefined, label: string, max: number) {
  const t = (v ?? '').trim();
  if (!t) e[key] = `Completá ${label}.`;
  else if (t.length > max) e[key] = `Máximo ${max} caracteres.`;
}
function opt(e: Errors, key: string, v: string | undefined, max: number) {
  if ((v ?? '').trim().length > max) e[key] = `Máximo ${max} caracteres.`;
}
function url(e: Errors, key: string, v: string | undefined, required = false) {
  const t = (v ?? '').trim();
  if (!t) { if (required) e[key] = 'Pegá la dirección completa.'; return; }
  if (!isHttps(t)) e[key] = 'Ingresá una dirección que empiece con https://';
}
function range(e: Errors, p: string, start: string | undefined, end: string | null | undefined, required: boolean) {
  if (required && !start) e[`${p}.start`] = 'Elegí el mes y el año de inicio.';
  if (end === '') e[`${p}.end`] = 'Elegí el mes y el año de fin, o marcá "Actualmente".';
  if (!required && end && !start) e[`${p}.start`] = 'Elegí el mes y el año de inicio.';
  if (start && end && start > end) e[`${p}.end`] = 'La fecha de fin no puede ser anterior a la de inicio.';
}

export function validateProfile(p: Profile): Errors {
  const e: Errors = {};
  req(e, 'basics.displayName', p.displayName, 'tu nombre', LIMITS.displayName);
  opt(e, 'basics.headline', p.headline, LIMITS.headline);
  opt(e, 'basics.location', p.location, 80);
  opt(e, 'basics.pronouns', p.pronouns, 30);
  opt(e, 'basics.availability', p.availability, 120);
  if (!isValidSlug(p.slug)) e['basics.slug'] = 'Usá de 3 a 40 letras minúsculas, números y guiones, sin espacios.';
  if (p.contactEmail?.trim() && !EMAIL_RE.test(p.contactEmail.trim())) e['basics.contactEmail'] = 'Ingresá un email válido, por ejemplo nombre@dominio.com.';
  opt(e, 'about.about', p.about, LIMITS.about);
  opt(e, 'goals.studyGoals', p.studyGoals, LIMITS.goals);
  opt(e, 'goals.lookingFor', p.lookingFor, LIMITS.goals);

  p.links.forEach((l, i) => { req(e, `links.${i}.label`, l.label, 'el nombre del enlace', 40); url(e, `links.${i}.url`, l.url, true); });
  p.experience.forEach((x) => {
    const k = `experience.${x.id}`;
    req(e, `${k}.title`, x.title, 'el puesto', 100); req(e, `${k}.org`, x.org, 'la organización', 100); opt(e, `${k}.location`, x.location, 80);
    opt(e, `${k}.description`, x.description, 1000); range(e, k, x.start, x.end, true);
  });
  p.education.forEach((x) => {
    const k = `education.${x.id}`;
    req(e, `${k}.institution`, x.institution, 'la institución', 100); req(e, `${k}.degree`, x.degree, 'el título o nivel', 100); opt(e, `${k}.field`, x.field, 100);
    opt(e, `${k}.description`, x.description, 1000); range(e, k, x.start, x.end, true);
  });
  p.skills.forEach((x) => { req(e, `skills.${x.id}.name`, x.name, 'el nombre de la aptitud', 40); opt(e, `skills.${x.id}.category`, x.category, 40); });
  p.languages.forEach((x) => req(e, `languages.${x.id}.name`, x.name, 'el idioma', 40));
  p.projects.forEach((x) => {
    const k = `projects.${x.id}`;
    req(e, `${k}.title`, x.title, 'el nombre del proyecto', 100); req(e, `${k}.description`, x.description, 'una descripción', 600); url(e, `${k}.url`, x.url);
    if (x.start || x.end) range(e, k, x.start, x.end, false);
  });
  p.achievements.forEach((x) => {
    const k = `achievements.${x.id}`;
    req(e, `${k}.title`, x.title, 'el título', 100); opt(e, `${k}.issuer`, x.issuer, 100); opt(e, `${k}.description`, x.description, 600);
    if (!x.date) e[`${k}.date`] = 'Elegí el mes y el año.';
  });
  p.publications.forEach((x) => {
    const k = `publications.${x.id}`;
    req(e, `${k}.title`, x.title, 'el título', 160); req(e, `${k}.venue`, x.venue, 'dónde se publicó', 100); url(e, `${k}.url`, x.url);
    if (!x.date) e[`${k}.date`] = 'Elegí el mes y el año.';
  });
  p.volunteering.forEach((x) => {
    const k = `volunteering.${x.id}`;
    req(e, `${k}.role`, x.role, 'el rol', 100); req(e, `${k}.org`, x.org, 'la organización', 100); opt(e, `${k}.description`, x.description, 1000); range(e, k, x.start, x.end, true);
  });
  if (p.role === 'operator') {
    const y = p.teachingYears;
    if (y !== undefined && (!Number.isInteger(y) || y < 0 || y > 60)) e['teaching.years'] = 'Ingresá un número entero entre 0 y 60.';
    opt(e, 'teaching.approach', p.teachingApproach, LIMITS.approach);
    (p.subjectsTaught ?? []).forEach((s) => { req(e, `teaching.subj.${s.id}.name`, s.name, 'el nombre de la materia', 100); opt(e, `teaching.subj.${s.id}.level`, s.level, 60); });
    (p.officeHours ?? []).forEach((h, i) => {
      const k = `teaching.hours.${i}`;
      if (!h.day) e[`${k}.day`] = 'Elegí un día.';
      if (!TIME_RE.test(h.from)) e[`${k}.from`] = 'Ingresá la hora de inicio.';
      if (!TIME_RE.test(h.to)) e[`${k}.to`] = 'Ingresá la hora de fin.';
      else if (TIME_RE.test(h.from) && h.from >= h.to) e[`${k}.to`] = 'La hora de fin tiene que ser posterior a la de inicio.';
    });
  }
  return e;
}

/** Cuántos errores tiene un ítem (claves que empiezan con su prefijo). */
export const countErrors = (errors: Errors, prefix: string) => Object.keys(errors).filter((k) => k.startsWith(`${prefix}.`)).length;

export const FIELD_ERROR_KEY: Record<string, string> = {
  displayName: 'basics.displayName', headline: 'basics.headline', slug: 'basics.slug', contactEmail: 'basics.contactEmail', about: 'about.about', avatarUrl: 'basics.avatar',
};

/** Limpia espacios, vacíos y fechas opcionales antes de enviar. Devuelve el parche (sin rol ni secciones ocultas). */
export function toPatch(p: Profile): Partial<Profile> {
  const t = (s?: string) => (s ?? '').trim();
  const out: Partial<Profile> = {
    slug: t(p.slug), displayName: t(p.displayName), headline: t(p.headline), location: t(p.location), pronouns: t(p.pronouns), availability: t(p.availability),
    coverStyle: p.coverStyle, avatarUrl: p.avatarUrl, about: t(p.about), openTo: p.openTo ?? [],
    contactEmail: t(p.contactEmail), // '' = no publicar ningún email
    links: p.links.map((l) => ({ ...l, label: t(l.label), url: t(l.url) })),
    experience: p.experience.map((x) => ({ ...x, title: t(x.title), org: t(x.org), location: t(x.location) || undefined, description: t(x.description), highlights: x.highlights.map(t).filter(Boolean) })),
    education: p.education.map((x) => ({ ...x, institution: t(x.institution), degree: t(x.degree), field: t(x.field), description: t(x.description) || undefined })),
    skills: p.skills.map((x) => ({ ...x, name: t(x.name), category: t(x.category) || undefined })),
    languages: p.languages.map((x) => ({ ...x, name: t(x.name) })),
    projects: p.projects.map((x) => {
      const { start, end, ...rest } = x;
      return { ...rest, title: t(x.title), description: t(x.description), url: t(x.url) || undefined, ...(start ? { start, end: end ?? undefined } : {}) };
    }),
    achievements: p.achievements.map((x) => ({ ...x, title: t(x.title), issuer: t(x.issuer) || undefined, description: t(x.description) || undefined })),
    publications: p.publications.map((x) => ({ ...x, title: t(x.title), venue: t(x.venue), url: t(x.url) || undefined })),
    volunteering: p.volunteering.map((x) => ({ ...x, role: t(x.role), org: t(x.org), description: t(x.description) })),
    interests: p.interests,
    certificatesFeatured: p.certificatesFeatured,
  };
  if (p.role === 'student') { out.studyGoals = t(p.studyGoals); out.lookingFor = t(p.lookingFor); }
  else {
    out.specialties = p.specialties ?? []; out.subjectsTaught = (p.subjectsTaught ?? []).map((s) => ({ ...s, name: t(s.name), level: t(s.level) || undefined }));
    out.teachingYears = p.teachingYears; out.modality = p.modality; out.officeHours = p.officeHours ?? []; out.teachingApproach = t(p.teachingApproach);
  }
  return out;
}

/** ¿La sección está "completa" para la navegación? Reglas parecidas a profileCompleteness. */
export function sectionDone(id: string, p: Profile): boolean {
  switch (id) {
    case 'basics': return !!p.displayName.trim() && p.headline.trim().length >= 10 && !!p.location.trim();
    case 'about': return p.about.trim().length >= 80;
    case 'goals': return !!(p.studyGoals?.trim() || p.lookingFor?.trim());
    case 'teaching': return !!p.specialties?.length && !!p.subjectsTaught?.length && !!p.teachingApproach?.trim();
    case 'skills': return p.skills.length >= 5;
    case 'certificates': return p.certificatesFeatured.length >= 1;
    case 'experience': case 'education': case 'languages': case 'projects': case 'achievements': case 'publications': case 'volunteering': case 'links': case 'interests':
      return (p[id as 'experience'] as unknown[]).length >= 1;
    default: return false;
  }
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
