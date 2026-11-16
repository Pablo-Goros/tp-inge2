import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, isMockApi } from '../../api';
import { Alert, Button, Field } from '../../components/ui';
import { homeFor, useAuth } from './AuthProvider';
import { GoogleButton } from './GoogleButton';

const BAD_CREDS = 'Email o contraseña incorrectos. Revisá los datos e intentá de nuevo.';

const GOOGLE_UNAVAILABLE = 'No pudimos cargar el acceso con Google. Podés ingresar con email y contraseña.';

function messageFor(e: unknown): string {
  if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') return BAD_CREDS;
  if (e instanceof ApiError && e.code === 'NETWORK') return 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.';
  return 'Algo falló de nuestro lado. Probá de nuevo en unos minutos.';
}

export function LoginPage() {
  const { user, login, loginWithGoogle } = useAuth();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const navigate = useNavigate();
  const expired = (useLocation().state as { expired?: boolean } | null)?.expired;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user && !loading) return <Navigate to={homeFor(user.role)} replace />;

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const u = await login(email, password);
      navigate(homeFor(u.role), { replace: true });
    } catch (e) {
      setError(messageFor(e));
      setLoading(false);
    }
  }

  async function onGoogle(credential: string) {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const u = await loginWithGoogle(credential);
      navigate(homeFor(u.role), { replace: true });
    } catch (e) {
      setError(messageFor(e));
      setLoading(false);
    }
  }

  const invalid = error === BAD_CREDS;
  return (
    <main className="login">
      <section className="login-hero">
        <div className="stack" style={{ gap: 28 }}>
          <h1 className="disp login-brand">CERTIFICADOS<br />VERIFICABLES</h1>
          <p className="login-lead">Prueba de concepto académica: emití certificados por lote y verificalos contra un registro de certificados.</p>
          <p className="help login-demo">Demo académica · no emite títulos oficiales.</p>
        </div>
        <ul className="login-bullets" aria-label="Cómo funciona">
          <li>la institución emite por lote desde un CSV</li>
          <li>cada PDF lleva un QR y su huella registrada</li>
          <li>cualquiera verifica, sin cuenta</li>
        </ul>
      </section>
      <section className="login-side">
        <form className="card login-card" onSubmit={onSubmit} aria-busy={loading || undefined} noValidate>
          <h2 className="login-h">Ingresar</h2>
          {/* role="alert" es una región aria-live asertiva: el lector anuncia el error al aparecer. */}
          {expired && !error && <Alert tone="info">Tu sesión venció. Ingresá de nuevo.</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email" type="email" name="email" autoComplete="username" placeholder="nombre@instituto.edu.ar"
            value={email} onChange={(e) => setEmail(e.target.value)} readOnly={loading} aria-invalid={invalid || undefined} required />
          <Field label="Contraseña" type="password" name="password" autoComplete="current-password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} readOnly={loading} aria-invalid={invalid || undefined} required />
          <Button type="submit" block loading={loading} loadingLabel="Ingresando…">Ingresar</Button>
          {googleClientId && (
            <>
              <div className="login-sep" aria-hidden="true">o</div>
              <GoogleButton clientId={googleClientId} onCredential={onGoogle} onError={() => setError(GOOGLE_UNAVAILABLE)} />
            </>
          )}
          <div className="login-foot">
            <Link className="lnk" to="/verify">Verificar un certificado →</Link>
            <span className="help">No hace falta cuenta para verificar.</span>
          </div>
        </form>
        {isMockApi && (
          <p className="help login-mock">Modo demo: operador@demo.test o alumno01@demo.test, contraseña demo1234.</p>
        )}
      </section>
    </main>
  );
}
