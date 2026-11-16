const MOCK = 'mock-google:';

/**
 * Lee `email` y `name` del payload de un ID token de Google SOLO para mostrarlos.
 * No verifica firma ni nada: el backend es quien valida el token. Devuelve `{}` si no se puede leer.
 */
export function decodeGoogleProfile(credential: string): { email?: string; name?: string } {
  if (credential.startsWith(MOCK)) {
    const email = credential.slice(MOCK.length).trim().toLowerCase();
    return email ? { email, name: email.split('@')[0] } : {};
  }
  try {
    const payload = credential.split('.')[1];
    if (!payload) return {};
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) return {};
    const { email, name } = claims as Record<string, unknown>;
    return {
      ...(typeof email === 'string' ? { email } : {}),
      ...(typeof name === 'string' ? { name } : {}),
    };
  } catch {
    return {};
  }
}
