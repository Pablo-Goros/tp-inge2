import { useState, type FormEvent } from 'react';
import { Alert, Button, Field } from '../../components/ui';
import { decodeGoogleProfile } from './googleCredentialProfile';

interface Props {
  credential: string;
  loading: boolean;
  error: string | null;
  onConfirm(name: string): void;
  onCancel(): void;
}

/** Paso de bienvenida: primer ingreso con Google de un email sin cuenta. Crea siempre una cuenta de alumno. */
export function GoogleWelcome({ credential, loading, error, onConfirm, onCancel }: Props) {
  const [profile] = useState(() => decodeGoogleProfile(credential));
  const [name, setName] = useState((profile.name ?? '').slice(0, 100));

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!loading) onConfirm(name.trim());
  }

  return (
    <form className="card login-card" onSubmit={onSubmit} aria-busy={loading || undefined} noValidate>
      <h2 className="login-h">¡Bienvenido/a!</h2>
      <p>
        Es la primera vez que entrás con esta cuenta de Google. Vamos a crearte una cuenta de alumno
        {profile.email ? <> con el email <b>{profile.email}</b></> : null}.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Nombre" name="name" autoComplete="name" value={name} maxLength={100}
        onChange={(e) => setName(e.target.value)} readOnly={loading} autoFocus />
      <Button type="submit" block loading={loading} loadingLabel="Creando tu cuenta…">Crear mi cuenta de alumno</Button>
      <Button variant="ghost" block onClick={onCancel} disabled={loading}>Volver</Button>
    </form>
  );
}
