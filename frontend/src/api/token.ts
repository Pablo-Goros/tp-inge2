import type { SessionUser } from './types';

export interface StoredSession { token: string; user: SessionUser }

const KEY = 'cv.session';

/** sessionStorage puede fallar (modo privado, bloqueado): siempre con try/catch. */
export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return s?.token && s.user?.role ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin persistencia */ }
}

export function clearSession(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nada */ }
}

export const getToken = (): string | null => loadSession()?.token ?? null;
