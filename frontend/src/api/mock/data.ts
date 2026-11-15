import type { Role } from '../types';

export const DEMO_PASSWORD = 'demo1234';
export const INSTITUTION = 'Instituto Demo';

export interface MockUser { email: string; name: string; role: Role }

const FIRST = ['Camila', 'Agustín', 'Bruno', 'Carolina', 'Emilia', 'Felipe', 'Joaquín', 'Julieta', 'Lucas', 'Martina', 'Nicolás', 'Sofía', 'Valentina'];
const LAST = ['Ferreyra', 'Roldán', 'Paz', 'Díaz', 'Castro', 'Molina', 'Ibarra', 'Ríos', 'Benítez', 'Gómez', 'Vera', 'Acuña', 'Sosa'];

/** n = 1..60. Los primeros 13 son los nombres de los tableros; el resto se combina de forma determinista. */
export function studentName(n: number): string {
  const i = n - 1;
  return i < 13 ? `${FIRST[i]} ${LAST[i]}` : `${FIRST[i % 13]} ${LAST[(i * 5 + 3) % 13]}`;
}
export const studentEmail = (n: number) => `alumno${String(n).padStart(2, '0')}@demo.test`;

/** Cuentas con las que se puede ingresar y que cuentan para el CSV (alumno01..alumno25). */
export const USERS: MockUser[] = [
  { email: 'operador@demo.test', name: 'Marcos Quiroga', role: 'operator' },
  ...Array.from({ length: 25 }, (_, k) => ({ email: studentEmail(k + 1), name: studentName(k + 1), role: 'student' as const })),
];

export const normalizeCourse = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export interface MockBatch {
  id: string;
  course: string;
  date: string; // completion_date
  created: string; // ISO
  /** Números de alumno (1..60) de cada ítem. */
  students: number[];
  /** Índices (dentro de students) con falla permanente. */
  failed: number[];
  /** Cuántos no fallidos ya están emitidos al arrancar; el resto avanza con el tiempo si `live`. */
  baseIssued: number;
  live: boolean;
  startedAt: number;
}

const seq = (from: number, count: number) => Array.from({ length: count }, (_, k) => from + k);

/** Lotes de los tableros (Lotes.dc.html). #7 en curso con 48 alumnos; #5 con 3 fallidos. */
export function seedBatches(now = Date.now()): MockBatch[] {
  const mk = (id: string, course: string, date: string, created: string, first: number, total: number, failed: number[], baseIssued: number, live = false): MockBatch =>
    ({ id, course, date, created: `${created}T13:20:00Z`, students: seq(first, total), failed, baseIssued, live, startedAt: now });
  return [
    mk('7f3a91c2-4d1e-4b6a-9c05-2e8f7a1b3c40', 'Introducción a Criptografía Aplicada', '2026-10-30', '2026-11-14', 1, 48, [5, 17], 31, true),
    mk('c2b84e10-9a37-4f52-8d6b-1a0e5c93f7d2', 'Redes y Seguridad I', '2026-10-16', '2026-11-02', 1, 36, [], 36),
    mk('5e0d17a9-3b62-4c8f-a4d1-7f29b60e8c35', 'Bases de Datos Distribuidas', '2026-09-25', '2026-10-28', 2, 52, [3, 11, 40], 49),
    mk('a91f6c3d-7e48-4025-b3a9-d8c14e5f2b76', 'Taller de Registros Distribuidos', '2026-09-11', '2026-10-15', 2, 40, [], 40),
    mk('e4d25b80-1c9a-4f73-8e06-3b7a9d0c6f18', 'Programación Segura en Python', '2026-08-28', '2026-09-09', 1, 27, [], 27),
  ];
}
