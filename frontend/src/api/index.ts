import type { ApiClient } from './ApiClient';
import { httpClient } from './httpClient';
import { createMockClient } from './mock/MockApiClient';
import { installMockHelper } from './mock/scenarios';

export * from './ApiClient';
export * from './types';
export { shortBatchCode } from './format';

const useHttp = import.meta.env.VITE_API === 'http';
if (!useHttp && typeof window !== 'undefined') installMockHelper();

/** Cliente activo: mock en memoria por defecto; `VITE_API=http` usa /api. En componentes, usar `useApi()` (maneja el 401). */
export const api: ApiClient = useHttp ? httpClient : createMockClient();
export const isMockApi = !useHttp;
