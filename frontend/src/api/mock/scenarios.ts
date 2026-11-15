/**
 * Escenarios del mock. Se eligen con `?mock=a,b` (se guarda en localStorage) o `localStorage.mock = 'a,b'`.
 * `?mock=` vacío o `?mock=default` los limpia. Se leen en cada llamada, así que cambian sin recargar.
 */
export const SCENARIOS = {
  slow: 'Latencia de 1,5 s en cada llamada.',
  offline: 'Todas las llamadas fallan con NETWORK.',
  down: 'Todas las llamadas (menos login) fallan con 503 UNAVAILABLE.',
  expired: 'Toda llamada autenticada responde 401 (sesión vencida).',
  empty: 'Sin lotes y sin certificados.',
  frozen: 'El lote en curso no avanza.',
  'csv-reject': 'createBatch rechaza el CSV con filas de los 4 motivos.',
  'pdf-fail': 'La descarga del PDF falla (503).',
  'verify-valid': 'verifyFile responde VALID.',
  'verify-altered': 'verifyFile responde ALTERED.',
  'verify-notfound': 'verifyFile responde NOT_FOUND y getPublicCertificate 404.',
  'verify-unavailable': 'verifyFile responde UNAVAILABLE y getPublicCertificate 503.',
  'strict-contract': 'Omite los campos que el contrato no trae (institution, issued_at, created_at).',
} as const;

export type Scenario = keyof typeof SCENARIOS;
export type ScenarioSource = () => ReadonlySet<string>;

const KEY = 'mock';

function parse(v: string | null | undefined): Set<string> {
  return new Set((v ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== 'default'));
}

/** Persiste `?mock=` de la URL (si viene) y devuelve los escenarios activos. */
export const readScenarios: ScenarioSource = () => {
  try {
    const q = new URLSearchParams(window.location.search).get('mock');
    if (q !== null) {
      if (parse(q).size) localStorage.setItem(KEY, q); else localStorage.removeItem(KEY);
    }
    return parse(localStorage.getItem(KEY));
  } catch {
    return parse(null);
  }
};

/** Helper para la consola: `mockApi.set('offline')`, `mockApi.set()` para limpiar, `mockApi.list`. */
export function installMockHelper(): void {
  const helper = {
    set(...names: Scenario[]) {
      try { if (names.length) localStorage.setItem(KEY, names.join(',')); else localStorage.removeItem(KEY); } catch { /* nada */ }
      return [...readScenarios()];
    },
    get: () => [...readScenarios()],
    list: SCENARIOS,
  };
  (window as unknown as { mockApi: typeof helper }).mockApi = helper;
}
