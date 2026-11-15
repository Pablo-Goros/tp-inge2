import type {
  AchievementItem, EducationItem, ExperienceItem, LanguageItem, LanguageLevel, Profile, ProfileLink, ProjectItem, PublicationItem,
  SkillItem, SubjectTaught, TeachingModality, VolunteeringItem,
} from '../types';
import { avatarDataUri } from './avatars';
import { INSTITUTION } from './data';

/** Perfil de demostración + a qué cuenta pertenece (si tiene). Todo ficticio. */
export interface MockProfile { owner?: string; profile: Profile }

type L = 'B' | 'I' | 'A' | 'N';
const LVL: Record<L, LanguageLevel> = { B: 'Básico', I: 'Intermedio', A: 'Avanzado', N: 'Nativo' };

// Tuplas compactas → objetos con id.
export const exp = (rows: [title: string, org: string, start: string, end: string | null, description: string, highlights: string[], location?: string][]): ExperienceItem[] =>
  rows.map(([title, org, start, end, description, highlights, location], i) => ({ id: `exp-${i + 1}`, title, org, location, start, end, description, highlights }));
export const edu = (rows: [institution: string, degree: string, field: string, start: string, end: string | null, description?: string][]): EducationItem[] =>
  rows.map(([institution, degree, field, start, end, description], i) => ({ id: `edu-${i + 1}`, institution, degree, field, start, end, description }));
export const sk = (rows: [name: string, level: 1 | 2 | 3 | 4 | 5, category: string, endorsements?: number][]): SkillItem[] =>
  rows.map(([name, level, category, endorsements], i) => ({ id: `sk-${i + 1}`, name, level, category, endorsements }));
export const lg = (rows: [string, L][]): LanguageItem[] => rows.map(([name, l], i) => ({ id: `lg-${i + 1}`, name, level: LVL[l] }));
export const pj = (rows: [title: string, description: string, tags: string[], url?: string, start?: string, end?: string | null][]): ProjectItem[] =>
  rows.map(([title, description, tags, url, start, end], i) => ({ id: `pj-${i + 1}`, title, description, tags, url, start, end }));
export const ac = (rows: [title: string, issuer: string, date: string, description?: string][]): AchievementItem[] =>
  rows.map(([title, issuer, date, description], i) => ({ id: `ac-${i + 1}`, title, issuer, date, description }));
export const pub = (rows: [title: string, venue: string, date: string, url?: string][]): PublicationItem[] =>
  rows.map(([title, venue, date, url], i) => ({ id: `pub-${i + 1}`, title, venue, date, url }));
export const vol = (rows: [role: string, org: string, start: string, end: string | null, description: string][]): VolunteeringItem[] =>
  rows.map(([role, org, start, end, description], i) => ({ id: `vol-${i + 1}`, role, org, start, end, description }));
export const subj = (rows: [name: string, level: string, modality: TeachingModality][]): SubjectTaught[] =>
  rows.map(([name, level, modality], i) => ({ id: `sub-${i + 1}`, name, level, modality }));
export const links = (rows: [ProfileLink['kind'], string, string][]): ProfileLink[] => rows.map(([kind, label, url]) => ({ kind, label, url }));

type Base = Omit<Profile, 'avatarUrl' | 'slug' | 'institution' | 'hiddenSections' | 'publications' | 'volunteering' | 'certificatesFeatured'> &
  Partial<Pick<Profile, 'publications' | 'volunteering' | 'certificatesFeatured' | 'hiddenSections'>>;

export const make = (owner: string | undefined, slug: string, p: Base): MockProfile => ({
  owner,
  profile: { publications: [], volunteering: [], certificatesFeatured: [], hiddenSections: [], ...p, slug, avatarUrl: avatarDataUri(p.displayName), institution: INSTITUTION },
});
