import { profileCompleteness, formatRange, initialsOf, isValidSlug, slugify } from './profileUtils';
import { listProfiles } from './mock/profileStore';
import type { Profile } from './types';

const get = (slug: string): Profile => listProfiles().find((p) => p.profile.slug === slug)!.profile;

const empty = (over: Partial<Profile> = {}): Profile => ({
  slug: 'x-y', displayName: 'X Y', headline: '', location: '', avatarUrl: 'data:image/svg+xml;utf8,x', coverStyle: 'ondas', role: 'student',
  about: '', links: [], experience: [], education: [], skills: [], languages: [], projects: [], achievements: [], publications: [],
  volunteering: [], interests: [], certificatesFeatured: [], hiddenSections: [], ...over,
});

describe('profileCompleteness', () => {
  it('perfil vacío: solo la foto suma (10%) y lista lo que falta', () => {
    const r = profileCompleteness(empty());
    expect(r.percent).toBe(10);
    expect(r.missing.map((m) => m.key)).toEqual(['headline', 'about', 'location', 'experience', 'education', 'skills', 'languages', 'projects', 'links', 'certificates']);
  });

  it('un perfil completo de la demo llega a 100% o muy cerca, sin faltantes', () => {
    const camila = { ...get('camila-ferreyra'), certificatesFeatured: ['abc'] };
    const r = profileCompleteness(camila);
    expect(r.percent).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it('skills cuenta recién con 5 o más', () => {
    const four = { id: 's', name: 'a', level: 3 as const };
    expect(profileCompleteness(empty({ skills: Array(4).fill(four) })).missing.map((m) => m.key)).toContain('skills');
    expect(profileCompleteness(empty({ skills: Array(5).fill(four) })).missing.map((m) => m.key)).not.toContain('skills');
  });

  it('sin foto resta 10 y la pide', () => {
    const r = profileCompleteness(empty({ avatarUrl: '' }));
    expect(r.percent).toBe(0);
    expect(r.missing[0].key).toBe('avatar');
  });

  it('el resumen corto no cuenta; el de 80+ caracteres sí', () => {
    expect(profileCompleteness(empty({ about: 'corto' })).missing.map((m) => m.key)).toContain('about');
    expect(profileCompleteness(empty({ about: 'a'.repeat(80) })).missing.map((m) => m.key)).not.toContain('about');
  });

  it('tutores: docencia es un ítem más y los pesos siguen sumando 100', () => {
    const tutor = { ...get('marcos-quiroga'), certificatesFeatured: ['abc'] };
    expect(profileCompleteness(tutor).percent).toBe(100);
    const sinDocencia = profileCompleteness({ ...tutor, specialties: [] });
    expect(sinDocencia.percent).toBe(95);
    expect(sinDocencia.missing.map((m) => m.key)).toEqual(['teaching']);
  });

  it('las secciones ocultas no cambian la completitud', () => {
    const p = get('camila-ferreyra');
    expect(profileCompleteness({ ...p, hiddenSections: ['skills'] }).percent).toBe(profileCompleteness(p).percent);
  });
});

describe('helpers', () => {
  it('slug', () => {
    expect(isValidSlug('camila-ferreyra')).toBe(true);
    expect(isValidSlug('Camila')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
    expect(slugify('María José Núñez')).toBe('maria-jose-nunez');
  });
  it('fechas e iniciales', () => {
    expect(formatRange('2023-03', null)).toBe('mar 2023 – actual');
    expect(formatRange('2023-03', '2024-12')).toBe('mar 2023 – dic 2024');
    expect(initialsOf('Camila Ferreyra')).toBe('CF');
  });
});
