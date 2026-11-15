import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { ApiError, type ApiClient } from '../../../api';
import { avatarDataUri } from '../../../api/mock/avatars';
import { formatSize } from '../../../components/ui';
import { Alert, Avatar, Button } from '../../../components/ui';

export const AVATAR_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX = 2 * 1024 * 1024;

/** Mensaje de rechazo, o null si la foto sirve. No toca la API. */
export function avatarProblem(file: File): string | null {
  if (!AVATAR_ACCEPT.includes(file.type)) return 'Ese archivo no es una imagen JPG, PNG o WebP. Elegí otra foto.';
  if (file.size > AVATAR_MAX) return `La foto pesa ${formatSize(file.size)} y el máximo es 2 MB. Elegí una más liviana.`;
  return null;
}

interface Props {
  api: ApiClient;
  name: string;
  avatarUrl: string;
  /** Se llama con la foto ya guardada en el servidor. */
  onChange: (avatarUrl: string) => void;
}

type Phase = { s: 'idle' } | { s: 'uploading'; file: File } | { s: 'error'; file: File; message: string } | { s: 'removing' };

/** Foto de perfil: cambiar, arrastrar y soltar, vista previa y quitar. Nunca deja el perfil sin foto: "Quitar" vuelve al avatar generado. */
export function AvatarUploader({ api, name, avatarUrl, onChange }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ s: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [done, setDone] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL?.(preview); }, [preview]);

  const generated = avatarUrl.startsWith('data:image/svg+xml');
  const busy = phase.s === 'uploading' || phase.s === 'removing';

  async function upload(file: File) {
    setPhase({ s: 'uploading', file });
    setDone('');
    try {
      const res = await api.uploadAvatar(file);
      if (!alive.current) return;
      onChange(res.avatarUrl);
      setPhase({ s: 'idle' });
      setPreview(null);
      setDone('Foto actualizada.');
    } catch (e) {
      if (!alive.current) return;
      const message = e instanceof ApiError && e.code === 'VALIDATION_ERROR' ? e.message : 'No pudimos subir la foto. Revisá tu conexión e intentá de nuevo.';
      setPhase({ s: 'error', file, message });
    }
  }

  function pick(file: File | undefined) {
    if (!file || busy) return;
    const p = avatarProblem(file);
    setProblem(p);
    if (p) return;
    setPreview(typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null);
    void upload(file);
  }

  async function remove() {
    setPhase({ s: 'removing' });
    setDone('');
    try {
      const res = await api.updateMyProfile({ avatarUrl: avatarDataUri(name) });
      if (!alive.current) return;
      onChange(res.avatarUrl);
      setPhase({ s: 'idle' });
      setDone('Volviste al avatar generado con tus iniciales.');
    } catch {
      if (alive.current) setPhase({ s: 'error', file: new File([], ''), message: 'No pudimos quitar la foto. Intentá de nuevo.' });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files[0]);
  }

  return (
    <div
      className={over ? 'au au-over' : 'au'} data-testid="avatar-drop"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
    >
      <Avatar src={preview ?? avatarUrl} name={name || 'Perfil'} alt="Foto de perfil actual" size="lg" ring />
      <div className="au-body">
        <b>Foto de perfil</b>
        <p className="help">{generated ? 'Ahora usás un avatar generado con tus iniciales.' : 'Se muestra en tu perfil y en el directorio.'} Arrastrá una imagen acá o elegila desde tu equipo. JPG, PNG o WebP, hasta 2 MB.</p>
        <div className="row">
          <input ref={inputRef} id={inputId} type="file" className="sr-only" tabIndex={-1} aria-label="Elegir foto de perfil" accept={AVATAR_ACCEPT.join(',')} disabled={busy}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="secondary" small disabled={busy} onClick={() => inputRef.current?.click()}>Cambiar foto</Button>
          {!generated && <Button variant="ghost" small disabled={busy} onClick={() => void remove()}>Quitar foto</Button>}
        </div>
        <div role="status" aria-live="polite" className="au-state">
          {phase.s === 'uploading' && <span className="help"><span className="spin" aria-hidden="true" /> Subiendo foto…</span>}
          {phase.s === 'removing' && <span className="help"><span className="spin" aria-hidden="true" /> Quitando foto…</span>}
          {phase.s === 'idle' && done && <span className="help au-ok">✓ {done}</span>}
        </div>
        {problem && <Alert tone="error">{problem}</Alert>}
        {phase.s === 'error' && (
          <Alert tone="error" action={(
            <span className="row">
              <Button small variant="secondary" onClick={() => (phase.file.size ? void upload(phase.file) : void remove())}>Reintentar</Button>
              {phase.file.size > 0 && <Button small variant="ghost" onClick={() => { setPhase({ s: 'idle' }); setPreview(null); }}>Cancelar</Button>}
            </span>
          )}>{phase.message}</Alert>
        )}
      </div>
    </div>
  );
}
