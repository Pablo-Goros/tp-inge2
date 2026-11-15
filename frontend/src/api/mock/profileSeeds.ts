import { slugify } from '../profileUtils';
import type { CoverStyle } from '../types';
import { avatarDataUri } from './avatars';
import { INSTITUTION, studentEmail, studentName } from './data';
import { STUDENT_SEEDS } from './seedStudents';
import type { MockProfile } from './seedHelpers';
import { TUTOR_SEEDS } from './seedTutors';

export type { MockProfile } from './seedHelpers';

/** Perfil base generado para alumno08..alumno25 (para que el directorio no esté vacío). */
const AREAS = [
  { area: 'Desarrollo web', skills: ['JavaScript', 'HTML y CSS', 'React', 'Git', 'Node.js'], city: 'Salta, Argentina', goal: 'Un primer empleo como desarrollador web.' },
  { area: 'Ciencia de datos', skills: ['Python', 'Pandas', 'SQL', 'Estadística', 'Jupyter'], city: 'Neuquén, Argentina', goal: 'Prácticas en análisis de datos.' },
  { area: 'Ciberseguridad', skills: ['Redes TCP/IP', 'Linux', 'Wireshark', 'Criptografía', 'Bash'], city: 'Bahía Blanca, Argentina', goal: 'Prácticas en seguridad defensiva.' },
  { area: 'Infraestructura', skills: ['Linux', 'Docker', 'Bash', 'Git', 'Redes TCP/IP'], city: 'Santa Fe, Argentina', goal: 'Un rol junior en infraestructura.' },
  { area: 'Desarrollo móvil', skills: ['Kotlin', 'Flutter', 'Git', 'REST', 'Figma'], city: 'San Juan, Argentina', goal: 'Un proyecto de apps móviles.' },
  { area: 'Bases de datos', skills: ['SQL', 'PostgreSQL', 'Modelado de datos', 'Python', 'Git'], city: 'Posadas, Argentina', goal: 'Prácticas como analista de bases de datos.' },
];
const COVERS: CoverStyle[] = ['ondas', 'malla', 'diagonal', 'puntos', 'arcos', 'tramas', 'aurora', 'cuadricula'];

function generated(n: number, used: Set<string>): MockProfile {
  const name = studentName(n);
  const g = AREAS[n % AREAS.length];
  let slug = slugify(name);
  if (used.has(slug)) slug = `${slug}-${n}`;
  used.add(slug);
  return {
    owner: studentEmail(n),
    profile: {
      slug, displayName: name, headline: `Estudiante de ${g.area} en el Instituto Demo`, location: g.city, role: 'student', coverStyle: COVERS[n % COVERS.length],
      avatarUrl: avatarDataUri(name), institution: INSTITUTION,
      about: `Estudiante de ${g.area.toLowerCase()} en el Instituto Demo. Estoy armando mi perfil y sumando proyectos a medida que avanzo en la cursada.`,
      openTo: ['Prácticas'], links: [], experience: [],
      education: [{ id: 'edu-1', institution: INSTITUTION, degree: 'Tecnicatura', field: g.area, start: '2025-03', end: null }],
      skills: g.skills.map((s, i) => ({ id: `sk-${i + 1}`, name: s, level: (2 + ((n + i) % 3)) as 2 | 3 | 4 })),
      languages: [{ id: 'lg-1', name: 'Español', level: 'Nativo' }], projects: [], achievements: [], publications: [], volunteering: [],
      interests: [g.area], certificatesFeatured: [], hiddenSections: [], lookingFor: g.goal,
    },
  };
}

let cache: MockProfile[] | null = null;
/** Semillas (se construyen una vez). Copiar antes de mutar. */
export function profileSeeds(): MockProfile[] {
  if (!cache) {
    const detailed = [...STUDENT_SEEDS, ...TUTOR_SEEDS];
    const used = new Set(detailed.map((d) => d.profile.slug));
    cache = [...detailed, ...Array.from({ length: 18 }, (_, k) => generated(k + 8, used))];
  }
  return cache;
}
