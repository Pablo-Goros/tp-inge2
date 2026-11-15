import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, type Profile } from '../../api';
import { Alert, Button, ErrorState, SkeletonList } from '../../components/ui';
import { useApi, useAuth } from '../session/AuthProvider';
import { AboutBlock, GoalsBlock } from './edit/TextBlocks';
import { BasicsBlock } from './edit/BasicsBlock';
import { CertificatesBlock } from './edit/CertificatesBlock';
import { EditNav } from './edit/EditNav';
import { EDIT_SECTIONS, FIELD_ERROR_KEY, same, toPatch, validateProfile, type Errors } from './edit/editModel';
import { focusField, goTo } from './edit/goTo';
import {
  AchievementsBlock, EducationBlock, ExperienceBlock, InterestsBlock, LanguagesBlock, LinksBlock, ProjectsBlock, PublicationsBlock, SkillsBlock, VolunteeringBlock,
} from './edit/ListBlocks';
import { PreviewDock, PreviewOverlay } from './edit/PreviewPanel';
import { SaveBar } from './edit/SaveBar';
import { TeachingBlock } from './edit/TeachingBlock';
import { clearDraft, readDraft, writeDraft } from './edit/useDraft';
import { useMedia } from './edit/useMedia';
import { useSlugCheck } from './edit/useSlugCheck';
import { useLoadProfile } from './useLoadProfile';


const WIDE = '(min-width: 1280px)';
const PREV_KEY = 'pe-preview-open';

function whereOf(key: string, p: Profile): string {
  const [sec, a, b] = key.split('.');
  const label = EDIT_SECTIONS.find((s) => s.id === sec)?.label ?? sec;
  if (sec === 'links') return `${label} · enlace ${Number(a) + 1}`;
  const list = (p as unknown as Record<string, { id?: string; title?: string; name?: string; institution?: string; role?: string }[] | undefined>)[sec];
  if (b !== undefined && Array.isArray(list)) {
    const it = list.find((x) => x.id === a);
    const nm = it && (it.title || it.name || it.institution || it.role);
    return `${label} · ${nm || 'ítem nuevo'}`;
  }
  return label;
}

export function ProfileEditPage() {
  const api = useApi();
  const { user } = useAuth();
  const { state, retrying, retry } = useLoadProfile(() => api.getMyProfile(), user?.name ?? '');
  useEffect(() => { const prev = document.title; document.title = 'Editar perfil'; return () => { document.title = prev; }; }, []);

  if (state.s === 'loading') {
    return <main className="pe"><h1 className="disp page-title">Editar perfil</h1><SkeletonList label="Cargando tu perfil…" rows={6} height={64} /></main>;
  }
  if (state.s !== 'ok') {
    return (
      <main className="pe">
        <h1 className="disp page-title">Editar perfil</h1>
        <ErrorState message={state.s === 'notfound' ? 'Todavía no tenés perfil.' : state.message} retrying={retrying} onRetry={retry} />
      </main>
    );
  }
  return <Editor initial={state.profile} owner={`${user?.role}:${user?.name}`} />;
}

function Editor({ initial, owner }: { initial: Profile; owner: string }) {
  const api = useApi();
  const navigate = useNavigate();
  const { hash } = useLocation();

  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(() => {
    const d = readDraft(owner);
    return d && !same(toPatch(d.profile), toPatch(initial)) ? d : null;
  });
  const [show, setShow] = useState(false);
  const [signal, setSignal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [slugServerErr, setSlugServerErr] = useState<string | undefined>();
  const wide = useMedia(WIDE);
  const [dockOpen, setDockOpen] = useState(() => {
    try { const v = localStorage.getItem(PREV_KEY); return v === null ? window.innerWidth >= 1440 : v === '1'; } catch { return false; }
  });
  const [overlay, setOverlay] = useState(false);
  const previewBtn = useRef<HTMLButtonElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const dirty = useMemo(() => !same(draft, saved), [draft, saved]);
  const slugStatus = useSlugCheck(api, draft.slug, saved.slug);
  const set = useCallback((patch: Partial<Profile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if ('slug' in patch) setSlugServerErr(undefined);
  }, []);

  const errors = useMemo<Errors>(() => {
    const e = validateProfile(draft);
    if (slugStatus === 'taken' && !e['basics.slug']) e['basics.slug'] = 'Esa dirección ya está en uso. Elegí otra.';
    return { ...e, ...serverErrors };
  }, [draft, slugStatus, serverErrors]);
  const errorKeys = Object.keys(errors);

  // Borrador local (sin la foto, que se guarda aparte) mientras hay cambios.
  const live = useRef({ draft, dirty, pending });
  live.current = { draft, dirty, pending };
  useEffect(() => {
    if (pending) return;
    const t = window.setTimeout(() => (dirty ? writeDraft(owner, { ...draft, avatarUrl: '' }) : clearDraft(owner)), 400);
    return () => window.clearTimeout(t);
  }, [draft, dirty, pending, owner]);
  useEffect(() => () => { const l = live.current; if (l.dirty && !l.pending) writeDraft(owner, { ...l.draft, avatarUrl: '' }); }, [owner]);

  // Aviso al salir: dentro de la app (useBlocker) y al cerrar la pestaña (beforeunload).
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) => dirty && currentLocation.pathname !== nextLocation.pathname, [dirty]));
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Anclas: #experience, etc. llevan al bloque (también al llegar desde "Mi perfil").
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const t = window.setTimeout(() => goTo(id), 60);
    return () => window.clearTimeout(t);
  }, [hash]);

  const save = useCallback(async () => {
    if (saving || !dirty) return;
    if (errorKeys.length) {
      setShow(true);
      setSignal((n) => n + 1);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setServerErrors({});
    const sent = draft;
    try {
      const res = await api.updateMyProfile(toPatch(sent));
      setSaved(res);
      setDraft((cur) => (same(cur, sent) ? res : cur));
      setSavedAt(Date.now());
      setShow(false);
      clearDraft(owner);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        const details = e.details as { field?: string; reason?: string }[];
        if (details.some((d) => d.reason === 'SLUG_TAKEN')) {
          setSlugServerErr('Esa dirección ya está en uso. Elegí otra.');
          setServerErrors({ 'basics.slug': 'Esa dirección ya está en uso. Elegí otra.' });
          setSignal((n) => n + 1);
        } else if (details.length) {
          setServerErrors(Object.fromEntries(details.filter((d) => d.field).map((d) => [FIELD_ERROR_KEY[d.field!] ?? `basics.${d.field}`, 'El servidor no aceptó este dato. Revisalo.'])));
          setSignal((n) => n + 1);
        }
        setShow(true);
        setSaveError(null);
      } else {
        setSaveError(e instanceof ApiError && e.status === 0 ? 'Sin conexión con el servidor.' : 'No pudimos guardar los cambios.');
      }
    } finally {
      setSaving(false);
    }
  }, [api, dirty, draft, errorKeys.length, owner, saving]);

  // Ctrl/Cmd + S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save]);

  // Con errores al guardar, el foco va al resumen.
  useEffect(() => { if (signal > 0) summaryRef.current?.focus(); }, [signal]);

  // Vista previa en pantalla completa: el editor queda inerte detrás.
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    if (overlay && !wide) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [overlay, wide]);

  function discard() {
    setDraft(saved);
    setShow(false);
    setServerErrors({});
    setSlugServerErr(undefined);
    setSaveError(null);
    setSavedAt(null);
    clearDraft(owner);
  }
  function restore() {
    if (!pending) return;
    setDraft({ ...pending.profile, avatarUrl: saved.avatarUrl, hiddenSections: saved.hiddenSections, role: saved.role });
    setPending(null);
  }
  function onAvatar(avatarUrl: string) {
    setSaved((s) => ({ ...s, avatarUrl }));
    setDraft((d) => ({ ...d, avatarUrl }));
  }
  const closeOverlay = useCallback(() => { setOverlay(false); previewBtn.current?.focus(); }, []);
  function togglePreview() {
    if (wide) {
      const next = !dockOpen;
      setDockOpen(next);
      try { localStorage.setItem(PREV_KEY, next ? '1' : '0'); } catch { /* nada */ }
    } else setOverlay(true);
  }
  const dockShown = wide && dockOpen;

  const b = { draft, set, errors, show, signal };
  const tutor = draft.role === 'operator';
  const shownErrors = show ? errorKeys : [];

  return (
    <main className={dockShown ? 'pe pe-docked' : 'pe'}>
      <div ref={shellRef}>
        <div className="pe-title">
          <div>
            <h1 className="disp page-title">Editar perfil</h1>
            <p className="help">Los cambios se publican cuando apretás Guardar. Atajo: Ctrl+S.</p>
          </div>
          <Button ref={previewBtn} variant="secondary" aria-expanded={wide ? dockOpen : undefined} aria-haspopup={wide ? undefined : 'dialog'} onClick={togglePreview}>
            {dockShown ? 'Ocultar vista previa' : 'Vista previa'}
          </Button>
        </div>

        {pending && (
          <Alert tone="info" title="Recuperamos un borrador sin guardar." action={<span className="row"><Button small onClick={restore}>Restaurar</Button><Button small variant="secondary" onClick={() => { clearDraft(owner); setPending(null); }}>Descartar borrador</Button></span>}>
            ¿Restaurar? Es lo último que escribiste en este navegador.
          </Alert>
        )}

        {shownErrors.length > 0 && (
          <div ref={summaryRef} className="pe-summary" role="alert" tabIndex={-1}>
            <b>Revisá {shownErrors.length === 1 ? '1 campo' : `${shownErrors.length} campos`} antes de guardar</b>
            <ul>
              {shownErrors.map((k) => (
                <li key={k}><a href={`#${k.split('.')[0]}`} onClick={(e) => { e.preventDefault(); focusField(k); }}>{whereOf(k, draft)}</a>: {errors[k]}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="pe-cols">
          <EditNav draft={draft} errors={errors} show={show} onGo={(id) => { goTo(id); navigate({ hash: `#${id}` }, { replace: true }); }} />
          <form className="pe-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label="Formulario del perfil">
            <BasicsBlock {...b} api={api} slugStatus={slugStatus} slugServerError={slugServerErr} onAvatar={onAvatar} />
            <AboutBlock {...b} />
            {tutor ? <TeachingBlock {...b} /> : <GoalsBlock {...b} />}
            <ExperienceBlock {...b} />
            <EducationBlock {...b} />
            <SkillsBlock {...b} />
            <LanguagesBlock {...b} />
            <ProjectsBlock {...b} />
            <AchievementsBlock {...b} />
            <PublicationsBlock {...b} />
            <VolunteeringBlock {...b} />
            <CertificatesBlock draft={draft} set={set} />
            <LinksBlock {...b} />
            <InterestsBlock {...b} />
          </form>
        </div>
      </div>

      {dockShown && <PreviewDock draft={draft} onClose={togglePreview} />}
      {overlay && !wide && <PreviewOverlay draft={draft} onClose={closeOverlay} />}

      <SaveBar
        dirty={dirty} saving={saving} savedAt={savedAt} error={saveError} slug={saved.slug} onSave={() => void save()} onDiscard={discard}
        leaving={blocker.state === 'blocked'} onLeave={() => blocker.proceed?.()} onStay={() => blocker.reset?.()}
      />
    </main>
  );
}
