import { useEffect, useRef, useState } from 'react';
import { ApiError, isMockApi, type ApiClient, type Profile, type SectionKey } from '../../api';
import { resetProfiles } from '../../api/mock/profileStore';
import { ROLE_LABEL, SECTION_KEYS, SECTION_LABELS } from '../../api/profileUtils';
import { getToken } from '../../api/token';
import { Alert, Button, Card, ErrorState, Field, SkeletonList, Switch } from '../../components/ui';
import { SlugField } from './edit/SlugField';
import { useSlugCheck } from './edit/useSlugCheck';
import { profileUrl } from './profileHelpers';
import { useApi, useAuth } from '../session/AuthProvider';
import { useLoadProfile } from './useLoadProfile';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Cada carga del perfil es un objeto nuevo: sirve de clave para reiniciar los formularios (p. ej. tras restablecer la demo). */
const ids = new WeakMap<object, number>();
let nextId = 1;
const loadId = (o: object) => { if (!ids.has(o)) ids.set(o, nextId++); return ids.get(o)!; };
const accountEmail = () => { const t = getToken(); return t?.startsWith('mock:') ? t.slice(5) : null; };

/** Mensaje de estado de una acción (aria-live). */
function Feedback({ msg, bad }: { msg: string; bad?: boolean }) {
  return <p className={bad ? 'err' : 'help au-ok'} role="status" aria-live="polite">{msg}</p>;
}

export function ProfileSettingsPage() {
  const api = useApi();
  const { user } = useAuth();
  const { state, retrying, retry } = useLoadProfile(() => api.getMyProfile(), user?.name ?? '');
  const [resetDone, setResetDone] = useState(false);
  useEffect(() => { const prev = document.title; document.title = 'Configuración del perfil'; return () => { document.title = prev; }; }, []);
  return (
    <main className="st">
      <div>
        <h1 className="disp page-title">Configuración del perfil</h1>
        <p className="help">Los cambios de esta página se guardan al instante.</p>
      </div>
      {state.s === 'loading' && <SkeletonList label="Cargando tu perfil…" rows={4} height={72} />}
      {state.s === 'notfound' && <ErrorState message="Todavía no tenés perfil." retrying={retrying} onRetry={retry} />}
      {state.s === 'error' && <ErrorState message={state.message} retrying={retrying} onRetry={retry} />}
      {state.s === 'ok' && <Settings key={loadId(state.profile)} initial={state.profile} api={api} resetDone={resetDone} onReset={() => { setResetDone(true); retry(); }} />}
    </main>
  );
}

function Settings({ initial, api, onReset, resetDone }: { initial: Profile; api: ApiClient; onReset: () => void; resetDone: boolean }) {
  const [profile, setProfile] = useState(initial);
  const tutor = profile.role === 'operator';
  return (
    <>
      <PublicCard api={api} profile={profile} onSaved={setProfile} />
      <SectionsCard api={api} profile={profile} onSaved={setProfile} sections={SECTION_KEYS.filter((k) => tutor || k !== 'teaching')} />
      <ContactCard api={api} profile={profile} onSaved={setProfile} />
      <AccountCard profile={profile} />
      {isMockApi && <DemoCard onReset={onReset} done={resetDone} />}
    </>
  );
}

interface CardProps { api: ApiClient; profile: Profile; onSaved: (p: Profile) => void }

function PublicCard({ api, profile, onSaved }: CardProps) {
  const [slug, setSlug] = useState(profile.slug);
  const [copied, setCopied] = useState('');
  const [fb, setFb] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [slugErr, setSlugErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const status = useSlugCheck(api, slug, profile.slug);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(profileUrl(profile)); ok = true; } catch { /* sin permiso */ }
    setCopied(ok ? 'Enlace copiado' : 'No se pudo copiar. Copialo desde el recuadro.');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(''), 3000);
  }
  async function saveSlug() {
    setBusy(true); setFb(null); setSlugErr(undefined);
    try {
      onSaved(await api.updateMyProfile({ slug }));
      setFb({ msg: 'Dirección actualizada.' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setSlugErr('Esa dirección ya está en uso. Elegí otra.');
      else setFb({ msg: 'No pudimos cambiar la dirección. Intentá de nuevo.', bad: true });
    } finally { setBusy(false); }
  }
  const canSave = slug !== profile.slug && (status === 'available' || status === 'unknown');
  return (
    <Card className="st-card" aria-labelledby="st-pub">
      <h2 id="st-pub" className="disp st-h">Tu perfil público</h2>
      <div className="st-url">
        <code aria-label="Dirección actual de tu perfil">{profileUrl(profile)}</code>
        <Button variant="secondary" small onClick={() => void copy()}>Copiar enlace</Button>
        <span role="status" aria-live="polite" className="help au-ok">{copied}</span>
      </div>
      <Alert tone="info">Tu perfil es público: cualquiera con el enlace puede verlo. No hay modo privado en esta demo.</Alert>
      <SlugField value={slug} onChange={(v) => { setSlug(v); setSlugErr(undefined); setFb(null); }} status={status} error={slugErr} label="Cambiar la dirección" />
      <div className="row">
        <Button disabled={!canSave} loading={busy} loadingLabel="Guardando…" onClick={() => void saveSlug()}>Guardar dirección</Button>
        {fb && <Feedback {...fb} />}
      </div>
    </Card>
  );
}

function SectionsCard({ api, profile, onSaved, sections }: CardProps & { sections: SectionKey[] }) {
  const [fb, setFb] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [pending, setPending] = useState<SectionKey | null>(null);
  const hidden = profile.hiddenSections;
  async function toggle(k: SectionKey, visible: boolean) {
    const next = visible ? hidden.filter((x) => x !== k) : [...hidden, k];
    setPending(k); setFb(null);
    onSaved({ ...profile, hiddenSections: next }); // optimista; si falla se revierte
    try {
      onSaved(await api.updateMyProfile({ hiddenSections: next }));
      setFb({ msg: `${SECTION_LABELS[k]}: ahora está ${visible ? 'visible' : 'oculta'} en tu perfil público.` });
    } catch {
      onSaved(profile);
      setFb({ msg: `No pudimos guardar el cambio en ${SECTION_LABELS[k]}. Intentá de nuevo.`, bad: true });
    } finally { setPending(null); }
  }
  return (
    <Card className="st-card" aria-labelledby="st-sec">
      <h2 id="st-sec" className="disp st-h">Secciones visibles</h2>
      <p className="help">Ocultá las secciones que no querés mostrar en tu perfil público. Vos las seguís viendo, atenuadas, en Mi perfil.</p>
      <ul className="st-sw">
        {sections.map((k) => {
          const visible = !hidden.includes(k);
          return (
            <li key={k}>
              <span><b>{SECTION_LABELS[k]}</b><span className="help">{visible ? 'Se muestra en tu perfil público' : 'No se muestra en tu perfil público'}</span></span>
              <Switch label={SECTION_LABELS[k]} checked={visible} onText="Visible" offText="Oculta" disabled={pending === k} onChange={(v) => void toggle(k, v)} />
            </li>
          );
        })}
      </ul>
      {fb && <Feedback {...fb} />}
    </Card>
  );
}

function ContactCard({ api, profile, onSaved }: CardProps) {
  const [email, setEmail] = useState(profile.contactEmail ?? '');
  const [err, setErr] = useState<string | undefined>();
  const [fb, setFb] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = email.trim() !== (profile.contactEmail ?? '');
  async function save() {
    const v = email.trim();
    if (v && !EMAIL_RE.test(v)) { setErr('Ingresá un email válido, por ejemplo nombre@dominio.com.'); return; }
    setErr(undefined); setBusy(true); setFb(null);
    try {
      onSaved(await api.updateMyProfile({ contactEmail: v })); // '' = no publicar ningún email
      setFb({ msg: v ? 'Contacto guardado.' : 'Listo: tu perfil ya no muestra ningún email.' });
    } catch { setFb({ msg: 'No pudimos guardar el contacto. Intentá de nuevo.', bad: true }); } finally { setBusy(false); }
  }
  return (
    <Card className="st-card" aria-labelledby="st-con">
      <h2 id="st-con" className="disp st-h">Contacto</h2>
      <Field label="Email de contacto público (opcional)" type="email" inputMode="email" autoComplete="off" value={email} error={err}
        onChange={(e) => { setEmail(e.target.value); setErr(undefined); setFb(null); }} help="Se muestra en tu perfil público. Dejalo vacío para no publicar ningún email." />
      <div className="row">
        <Button disabled={!changed} loading={busy} loadingLabel="Guardando…" onClick={() => void save()}>Guardar contacto</Button>
        {fb && <Feedback {...fb} />}
      </div>
    </Card>
  );
}

function AccountCard({ profile }: { profile: Profile }) {
  const email = accountEmail();
  return (
    <Card className="st-card" aria-labelledby="st-acc">
      <h2 id="st-acc" className="disp st-h">Cuenta</h2>
      <dl className="st-dl">
        <dt>Nombre</dt><dd>{profile.displayName}</dd>
        <dt>Rol</dt><dd>{ROLE_LABEL[profile.role]}</dd>
        <dt>Email de la cuenta</dt><dd>{email ?? 'No disponible en esta pantalla'}</dd>
      </dl>
      <p className="help">El email de la cuenta nunca se muestra en tu perfil público.</p>
    </Card>
  );
}

function DemoCard({ onReset, done }: { onReset: () => void; done: boolean }) {
  const [ask, setAsk] = useState(false);
  return (
    <Card className="st-card" aria-labelledby="st-demo">
      <h2 id="st-demo" className="disp st-h">Datos de demostración</h2>
      <p className="help">Esta demo guarda tus cambios en este navegador. Podés volver a los perfiles de ejemplo originales.</p>
      {ask ? (
        <div className="rl-confirm" role="group" aria-label="Confirmar restablecer">
          <span>¿Restablecer? Se pierden tus cambios y vuelven los perfiles de ejemplo.</span>
          <button type="button" className="rl-btn rl-danger" onClick={() => { resetProfiles(); setAsk(false); onReset(); }}>Sí</button>
          <button type="button" className="rl-btn" autoFocus onClick={() => setAsk(false)}>No</button>
        </div>
      ) : <div className="row"><Button variant="secondary" onClick={() => { setAsk(true); }}>Restablecer perfiles de ejemplo</Button></div>}
      {done && <Feedback msg="Perfiles restablecidos." />}
    </Card>
  );
}
