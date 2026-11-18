import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api';
import { Alert, Button, Field } from '../../components/ui';
import { homeFor, useAuth } from './AuthProvider';

const MIN_PASSWORD = 8;

function messageFor(e: unknown): string {
  if (e instanceof ApiError && e.code === 'CONFLICT') return 'Ya existe una cuenta con ese email. Probá ingresar.';
  if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') return 'Revisá los datos: nombre, un email válido y una contraseña de 8 a 72 caracteres.';
  if (e instanceof ApiError && e.code === 'NETWORK') return 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.';
  return 'Algo falló de nuestro lado. Probá de nuevo en unos minutos.';
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user && !loading) return <Navigate to={homeFor(user.role)} replace />;

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (loading) return;
    if (!name.trim() || !email.trim() || password.length < MIN_PASSWORD || confirm !== password) {
      setError('Completá todos los campos; la contraseña debe tener al menos 8 caracteres y coincidir en ambos campos.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const u = await register(name.trim(), email, password);
      navigate(homeFor(u.role), { replace: true });
    } catch (e) {
      setError(messageFor(e));
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <section className="login-hero">
        <div className="stack" style={{ gap: 28 }}>
          <h1 className="disp login-brand">CERTIFICADOS<br />VERIFICABLES</h1>
          <p className="login-lead">Creá tu cuenta de alumno para ver y descargar tus certificados.</p>
          <p className="help login-demo">Demo académica · no emite títulos oficiales.</p>
        </div>
      </section>
      <section className="login-side">
        <form className="card login-card" onSubmit={onSubmit} aria-busy={loading || undefined} noValidate>
          <h2 className="login-h">Crear cuenta</h2>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Nombre" type="text" name="name" autoComplete="name" placeholder="Nombre y apellido"
            value={name} onChange={(e) => setName(e.target.value)} readOnly={loading} maxLength={100} required />
          <Field label="Email" type="email" name="email" autoComplete="username" placeholder="nombre@instituto.edu.ar"
            value={email} onChange={(e) => setEmail(e.target.value)} readOnly={loading} required />
          <Field label="Contraseña" type="password" name="password" autoComplete="new-password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} readOnly={loading} maxLength={72}
            error={tooShort ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined} required />
          <Field label="Repetir contraseña" type="password" name="confirm" autoComplete="new-password" placeholder="••••••••"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} readOnly={loading} maxLength={72}
            error={mismatch ? 'Las contraseñas no coinciden.' : undefined} required />
          <Button type="submit" block loading={loading} loadingLabel="Creando cuenta…">Crear cuenta</Button>
          <div className="login-foot">
            <Link className="lnk" to="/login">← Ya tengo cuenta, ingresar</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
