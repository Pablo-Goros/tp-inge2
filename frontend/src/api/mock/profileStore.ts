import { isValidSlug, SECTION_KEYS } from '../profileUtils';
import type { Profile } from '../types';
import { profileSeeds } from './profileSeeds';

/** Las ediciones del mock persisten en localStorage (clave propia) y se borran con `resetProfiles()`. */
export const PROFILES_KEY = 'mock:profiles';

export interface StoredProfile { key: string; owner?: string; profile: Profile }

let memory: Record<string, Profile> = {}; // respaldo si localStorage no está disponible
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const keyOf = (owner: string | undefined, slug: string) => owner ?? `seed:${slug}`;

function readOverrides(): Record<string, Profile> {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) return JSON.parse(raw) as Record<string, Profile>;
  } catch { /* nada */ }
  return memory;
}

function writeOverrides(next: Record<string, Profile>) {
  memory = next;
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(next)); } catch { /* cuota o sin storage: queda en memoria */ }
}

export function listProfiles(): StoredProfile[] {
  const over = readOverrides();
  return profileSeeds().map((s) => {
    const key = keyOf(s.owner, s.profile.slug);
    return { key, owner: s.owner, profile: clone(over[key] ?? s.profile) };
  });
}

export const findByOwner = (email: string) => listProfiles().find((p) => p.owner === email);
export const findBySlug = (slug: string) => listProfiles().find((p) => p.profile.slug === slug);

export function saveProfile(key: string, profile: Profile) {
  writeOverrides({ ...readOverrides(), [key]: clone(profile) });
}

/** Borra todas las ediciones y vuelve a los perfiles de demostración. */
export function resetProfiles() {
  memory = {};
  try { localStorage.removeItem(PROFILES_KEY); } catch { /* nada */ }
}

export interface FieldIssue { field: string; reason: string }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validación del perfil completo. `slugTaken` se resuelve afuera (necesita el resto de los perfiles). */
export function validateProfile(p: Profile, slugTaken: boolean): FieldIssue[] {
  const out: FieldIssue[] = [];
  if (!isValidSlug(p.slug)) out.push({ field: 'slug', reason: 'INVALID_SLUG' });
  else if (slugTaken) out.push({ field: 'slug', reason: 'SLUG_TAKEN' });
  if (!p.displayName.trim() || p.displayName.length > 80) out.push({ field: 'displayName', reason: 'INVALID' });
  if (p.headline.length > 120) out.push({ field: 'headline', reason: 'TOO_LONG' });
  if (p.about.length > 2000) out.push({ field: 'about', reason: 'TOO_LONG' });
  if (!p.avatarUrl) out.push({ field: 'avatarUrl', reason: 'REQUIRED' });
  if (p.contactEmail && !EMAIL_RE.test(p.contactEmail)) out.push({ field: 'contactEmail', reason: 'INVALID_EMAIL' });
  return out;
}

/** Vista pública: sin secciones ocultas y sin `contactEmail` vacío. Nunca hay email de cuenta en el modelo. */
export function toPublic(p: Profile): Profile {
  const out = clone(p);
  const hidden = new Set(out.hiddenSections);
  const blank: Partial<Record<(typeof SECTION_KEYS)[number], () => void>> = {
    about: () => { out.about = ''; },
    experience: () => { out.experience = []; },
    education: () => { out.education = []; },
    skills: () => { out.skills = []; },
    languages: () => { out.languages = []; },
    projects: () => { out.projects = []; },
    achievements: () => { out.achievements = []; },
    publications: () => { out.publications = []; },
    volunteering: () => { out.volunteering = []; },
    interests: () => { out.interests = []; },
    certificates: () => { out.certificatesFeatured = []; },
    links: () => { out.links = []; },
    teaching: () => { out.specialties = []; out.subjectsTaught = []; out.officeHours = []; out.teachingApproach = ''; },
  };
  for (const k of hidden) blank[k]?.();
  if (!out.contactEmail?.trim()) delete out.contactEmail;
  return out;
}
