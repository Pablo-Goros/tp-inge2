import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api as defaultApi, ApiError, type ApiClient, type Role, type SessionUser } from '../../api';
import { clearSession, loadSession, saveSession } from '../../api/token';

export const homeFor = (role: Role) => (role === 'operator' ? '/operator/batches' : '/student/certificates');

interface AuthValue {
  user: SessionUser | null;
  login(email: string, password: string): Promise<SessionUser>;
  loginWithGoogle(credential: string): Promise<SessionUser>;
  logout(): void;
  /** Cliente de API que cierra la sesión y lleva a /login ante cualquier 401. */
  api: ApiClient;
}

const Ctx = createContext<AuthValue | null>(null);

function withUnauthorized(client: ApiClient, onUnauthorized: () => void): ApiClient {
  const guard = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      throw e;
    }
  };
  return {
    login: client.login.bind(client), // un 401 en login es "credenciales inválidas", no sesión vencida
    loginWithGoogle: (c) => client.loginWithGoogle(c), // lazy (fakes sin él); idem login: un 401 no es sesión vencida
    createBatch: guard(client.createBatch.bind(client)),
    listBatches: guard(client.listBatches.bind(client)),
    getBatch: guard(client.getBatch.bind(client)),
    listMyCertificates: guard(client.listMyCertificates.bind(client)),
    downloadCertificatePdf: guard(client.downloadCertificatePdf.bind(client)),
    getPublicCertificate: guard(client.getPublicCertificate.bind(client)),
    verifyFile: guard(client.verifyFile.bind(client)),
    // Perfiles: llamadas perezosas (los fakes de tests pueden no tenerlas). Las públicas no cierran la sesión ante un 401.
    getMyProfile: guard(() => client.getMyProfile()),
    updateMyProfile: guard((p) => client.updateMyProfile(p)),
    uploadAvatar: guard((f) => client.uploadAvatar(f)),
    getPublicProfile: (slug) => client.getPublicProfile(slug),
    searchProfiles: (params) => client.searchProfiles(params),
    checkSlugAvailable: guard((s) => client.checkSlugAvailable(s)),
    getCertificateDetail: guard((id) => client.getCertificateDetail(id)),
  };
}

export function AuthProvider({ client = defaultApi, children }: { client?: ApiClient; children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser | null>(() => loadSession()?.user ?? null); // sobrevive a la recarga

  const expire = useCallback(() => {
    clearSession();
    setUser(null);
    navigate('/login', { replace: true, state: { expired: true } });
  }, [navigate]);
  const expireRef = useRef(expire);
  expireRef.current = expire;

  const guarded = useMemo(() => withUnauthorized(client, () => expireRef.current()), [client]);

  const value = useMemo<AuthValue>(() => ({
    user,
    api: guarded,
    async login(email, password) {
      const res = await client.login(email, password);
      saveSession({ token: res.token, user: res.user });
      setUser(res.user);
      return res.user;
    },
    async loginWithGoogle(credential) {
      const res = await client.loginWithGoogle(credential);
      saveSession({ token: res.token, user: res.user });
      setUser(res.user);
      return res.user;
    },
    logout() {
      clearSession();
      setUser(null);
    },
  }), [user, guarded, client]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return v;
}

/** Cliente de API para las pantallas (maneja el 401). */
export const useApi = (): ApiClient => useAuth().api;
