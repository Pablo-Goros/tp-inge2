import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiError, type ApiClient } from '../../api';
import { createMockClient } from '../../api/mock/MockApiClient';
import { listProfiles, resetProfiles } from '../../api/mock/profileStore';
import { clearSession, saveSession, type StoredSession } from '../../api/token';
import { buildRoutes } from '../../app/routes';
import { validateProfile } from './edit/editModel';
import { readDraft } from './edit/useDraft';

const student: StoredSession = { token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' } };
const tutor: StoredSession = { token: 'mock:operador@demo.test', user: { name: 'Marcos Quiroga', role: 'operator' } };
const mk = (sc: Iterable<string> = []) => createMockClient({ latencyMs: 0, scenarios: () => new Set(sc) });

function renderAt(path: string, c: ApiClient = mk()) {
  const router = createMemoryRouter(buildRoutes(c), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
const spy = (c: ApiClient) => {
  const calls = { update: vi.fn(), upload: vi.fn() };
  const w: ApiClient = {
    ...c,
    updateMyProfile: (p) => { calls.update(p); return c.updateMyProfile(p); },
    uploadAvatar: (f) => { calls.upload(f); return c.uploadAvatar(f); },
  } as ApiClient;
  return { w, calls };
};
const openEditor = async (c: ApiClient = mk(), who = student) => {
  saveSession(who);
  const router = renderAt('/profile/edit', c);
  await screen.findByLabelText('Nombre a mostrar');
  return router;
};
const typeInto = async (label: string, text: string) => {
  const el = screen.getByLabelText(label);
  await userEvent.clear(el);
  if (text) await userEvent.type(el, text);
  return el;
};
const saveBtn = () => screen.getByRole('button', { name: 'Guardar cambios' });
const file = (name: string, type: string, bytes = 1000) => new File([new Uint8Array(bytes)], name, { type });

beforeEach(() => { clearSession(); resetProfiles(); localStorage.clear(); document.title = ''; });

describe('perfiles de ejemplo', () => {
  it('todos pasan la validación del editor', () => {
    for (const { profile } of listProfiles()) expect(validateProfile(profile), profile.slug).toEqual({});
  });
});

describe('editor: guardar y validar', () => {
  it('editar el titular y guardar persiste y se ve en la vista', async () => {
    const c = mk();
    await openEditor(c);
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
    await typeInto('Titular', 'Estudiante de datos y redes');
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    await userEvent.click(saveBtn());
    expect(await screen.findByText('Guardado hace un momento')).toBeInTheDocument();
    expect((await c.getMyProfile()).headline).toBe('Estudiante de datos y redes');
    cleanup();
    renderAt('/profile', c);
    expect(await screen.findByText('Estudiante de datos y redes')).toBeInTheDocument();
  });

  it('el contador de caracteres del titular se actualiza', async () => {
    await openEditor();
    await typeInto('Titular', 'Hola');
    expect(screen.getByText(/^4 de 120 caracteres/)).toBeInTheDocument();
  });

  it('un error de validación bloquea el guardado y se lista arriba con enlace al campo', async () => {
    const { w, calls } = spy(mk());
    await openEditor(w);
    await typeInto('Nombre a mostrar', '');
    await userEvent.click(saveBtn());
    const alert = await screen.findByRole('alert', { name: '' });
    expect(alert).toHaveTextContent('Revisá 1 campo antes de guardar');
    expect(alert).toHaveTextContent('Completá tu nombre.');
    expect(calls.update).not.toHaveBeenCalled();
    await userEvent.click(within(alert).getByRole('link', { name: 'Básicos' }));
    expect(screen.getByLabelText('Nombre a mostrar')).toHaveFocus();
    expect(screen.getByLabelText('Nombre a mostrar')).toHaveAttribute('aria-invalid', 'true');
  });

  it('enlaces: exige https', async () => {
    const { w, calls } = spy(mk());
    await openEditor(w);
    const block = document.getElementById('links')!;
    await userEvent.click(within(block).getByRole('button', { name: '+ Agregar enlace' }));
    await userEvent.type(within(block).getByLabelText('Nombre del enlace'), 'Mi sitio');
    await userEvent.type(within(block).getByLabelText('Dirección'), 'http://sitio.test');
    await userEvent.click(saveBtn());
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá una dirección que empiece con https://');
    expect(calls.update).not.toHaveBeenCalled();
  });

  it('Ctrl+S guarda', async () => {
    const c = mk();
    await openEditor(c);
    await typeInto('Ubicación', 'Rosario, Argentina');
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(await screen.findByText('Guardado hace un momento')).toBeInTheDocument();
    expect((await c.getMyProfile()).location).toBe('Rosario, Argentina');
  });

  it('un contactEmail vacío no se publica', async () => {
    const c = mk();
    expect((await c.getPublicProfile('camila-ferreyra')).contactEmail).toBeTruthy();
    await openEditor(c);
    await typeInto('Email de contacto público (opcional)', '');
    await userEvent.click(saveBtn());
    await screen.findByText('Guardado hace un momento');
    expect('contactEmail' in (await c.getPublicProfile('camila-ferreyra'))).toBe(false);
  });

  it('error de guardado conserva lo escrito y permite Reintentar', async () => {
    const sc = new Set<string>();
    const c = createMockClient({ latencyMs: 0, scenarios: () => sc });
    await openEditor(c);
    await typeInto('Titular', 'Texto que no se pierde');
    sc.add('profile-fail');
    await userEvent.click(saveBtn());
    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument();
    expect(screen.getByLabelText('Titular')).toHaveValue('Texto que no se pierde');
    sc.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Guardado hace un momento')).toBeInTheDocument();
  });

  it('error de carga con Reintentar', async () => {
    const sc = new Set(['profile-fail']);
    saveSession(student);
    renderAt('/profile/edit', createMockClient({ latencyMs: 0, scenarios: () => sc }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el perfil');
    sc.clear();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findByLabelText('Nombre a mostrar');
  });
});

describe('editor: dirección del perfil', () => {
  it('"En uso" se muestra con texto y bloquea el guardado', async () => {
    const { w, calls } = spy(mk());
    await openEditor(w);
    await typeInto('Dirección de tu perfil', 'marcos-quiroga');
    expect(await screen.findByText('En uso')).toBeInTheDocument();
    await userEvent.click(saveBtn());
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa dirección ya está en uso');
    expect(calls.update).not.toHaveBeenCalled();
  });

  it('una dirección libre figura como Disponible', async () => {
    await openEditor();
    await typeInto('Dirección de tu perfil', 'camila-nueva');
    expect(await screen.findByText('Revisando…')).toBeInTheDocument();
    expect(await screen.findByText('Disponible')).toBeInTheDocument();
  });

  it('si el servidor responde 409 SLUG_TAKEN lo muestra en el campo', async () => {
    const base = mk();
    const c = { ...base, checkSlugAvailable: async () => true, updateMyProfile: async () => { throw new ApiError(409, 'VALIDATION_ERROR', 'Ese enlace ya está en uso.', [{ field: 'slug', reason: 'SLUG_TAKEN' }]); } } as ApiClient;
    await openEditor(c);
    await typeInto('Dirección de tu perfil', 'otra-direccion');
    await screen.findByText('Disponible');
    await userEvent.click(saveBtn());
    await waitFor(() => expect(screen.getAllByText(/Esa dirección ya está en uso/).length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Dirección de tu perfil')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('editor: foto de perfil', () => {
  it('rechaza tipo y tamaño inválidos sin llamar a la API y conserva la foto', async () => {
    const { w, calls } = spy(mk());
    await openEditor(w);
    const before = screen.getByRole('img', { name: 'Foto de perfil actual' }).getAttribute('src');
    const input = screen.getByLabelText('Elegir foto de perfil');
    fireEvent.change(input, { target: { files: [file('animado.gif', 'image/gif')] } });
    expect(await screen.findByText(/no es una imagen JPG, PNG o WebP/)).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [file('enorme.png', 'image/png', 3 * 1024 * 1024)] } });
    expect(await screen.findByText(/máximo es 2 MB/)).toBeInTheDocument();
    expect(calls.upload).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Foto de perfil actual' }).getAttribute('src')).toBe(before);
  });

  it('un error al subir ofrece Reintentar y no deja el perfil sin foto', async () => {
    const sc = new Set(['avatar-fail']);
    const c = createMockClient({ latencyMs: 0, scenarios: () => sc });
    await openEditor(c);
    const before = (await c.getMyProfile()).avatarUrl;
    fireEvent.change(screen.getByLabelText('Elegir foto de perfil'), { target: { files: [file('yo.png', 'image/png')] } });
    expect(await screen.findByText(/No pudimos subir la foto/)).toBeInTheDocument();
    expect((await c.getMyProfile()).avatarUrl).toBe(before);
    sc.clear();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Foto actualizada/)).toBeInTheDocument();
    expect((await c.getMyProfile()).avatarUrl).not.toBe(before);
  });

  it('subir una foto la guarda; "Quitar foto" vuelve al avatar generado', async () => {
    const c = mk();
    await openEditor(c);
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).toBeNull(); // ya usa el generado
    fireEvent.change(screen.getByLabelText('Elegir foto de perfil'), { target: { files: [file('yo.png', 'image/png')] } });
    await screen.findByText(/Foto actualizada/);
    expect((await c.getMyProfile()).avatarUrl).toMatch(/^data:image\/png/);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));
    await screen.findByText(/Volviste al avatar generado/);
    const url = (await c.getMyProfile()).avatarUrl;
    expect(url).toMatch(/^data:image\/svg\+xml/);
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).toBeNull();
  });
});

describe('editor: listas dinámicas', () => {
  it('agregar abre el ítem con foco en el primer campo; reordenar anuncia el nuevo orden; quitar pide confirmación', async () => {
    const c = mk();
    await openEditor(c);
    const block = document.getElementById('languages')!;
    const names = () => within(block).getAllByRole('button', { expanded: false }).map((b) => b.textContent);
    const before = names().length;
    await userEvent.click(within(block).getByRole('button', { name: '+ Agregar idioma' }));
    const input = within(block).getByLabelText('Idioma');
    expect(input).toHaveFocus();
    await userEvent.type(input, 'Esperanto');
    expect(names().length).toBe(before); // el nuevo está expandido
    await userEvent.click(within(block).getByRole('button', { name: 'Subir Esperanto' }));
    expect(within(block).getByRole('status')).toHaveTextContent('Esperanto pasó al lugar');
    expect(within(block).getAllByRole('listitem')[before - 1]).toHaveTextContent('Esperanto');
    // quitar con confirmación en línea
    await userEvent.click(within(block).getByRole('button', { name: 'Quitar Esperanto' }));
    expect(within(block).getByText('¿Quitar?')).toBeInTheDocument();
    await userEvent.click(within(block).getByRole('button', { name: 'No' }));
    expect(within(block).queryByText('¿Quitar?')).toBeNull();
    await userEvent.click(within(block).getByRole('button', { name: 'Quitar Esperanto' }));
    await userEvent.click(within(block).getByRole('button', { name: /^Sí/ }));
    expect(within(block).queryByText('Esperanto')).toBeNull();
    expect(screen.getByText('Sin cambios')).toBeInTheDocument(); // agregar y quitar deja el perfil igual
    expect((await c.getMyProfile()).languages.some((l) => l.name === 'Esperanto')).toBe(false);
  });

  it('fechas incoherentes se rechazan; "Actualmente" deja el fin vacío', async () => {
    const { w, calls } = spy(mk());
    await openEditor(w);
    const block = document.getElementById('experience')!;
    await userEvent.click(within(block).getByRole('button', { name: '+ Agregar experiencia' }));
    await userEvent.type(within(block).getByLabelText('Puesto'), 'Pasante');
    await userEvent.type(within(block).getByLabelText('Organización'), 'Acme');
    const sel = (l: string) => within(block).getByLabelText(l);
    await userEvent.selectOptions(sel('Desde: mes'), '05');
    await userEvent.selectOptions(sel('Desde: año'), '2024');
    await userEvent.selectOptions(sel('Hasta: mes'), '01');
    await userEvent.selectOptions(sel('Hasta: año'), '2023');
    await userEvent.click(saveBtn());
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha de fin no puede ser anterior a la de inicio.');
    expect(calls.update).not.toHaveBeenCalled();
    await userEvent.click(within(block).getAllByLabelText('Actualmente').slice(-1)[0]);
    expect(sel('Hasta: mes')).toBeDisabled();
    await userEvent.click(saveBtn());
    await screen.findByText('Guardado hace un momento');
    const saved = (await w.getMyProfile()).experience.find((e) => e.title === 'Pasante');
    expect(saved).toMatchObject({ start: '2024-05', end: null });
  });
});

describe('editor: salir con cambios, borrador y vista previa', () => {
  it('avisa al salir con cambios sin guardar y permite quedarse o salir', async () => {
    const router = await openEditor();
    await typeInto('Titular', 'Cambio sin guardar');
    await userEvent.click(screen.getByRole('link', { name: 'Directorio' }));
    expect(await screen.findByText('Tenés cambios sin guardar.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/profile/edit');
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Titular')).toHaveValue('Cambio sin guardar');
    await userEvent.click(screen.getByRole('link', { name: 'Directorio' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/directory'));
  });

  it('sin cambios no avisa', async () => {
    const router = await openEditor();
    await userEvent.click(screen.getByRole('link', { name: 'Directorio' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/directory'));
  });

  it('guarda un borrador local y lo ofrece al volver', async () => {
    await openEditor();
    await typeInto('Titular', 'Borrador de titular');
    await waitFor(() => expect(readDraft('student:Camila Ferreyra')?.profile.headline).toBe('Borrador de titular'));
    cleanup();
    await openEditor();
    expect(screen.getByText('Recuperamos un borrador sin guardar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Titular')).not.toHaveValue('Borrador de titular');
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(screen.getByLabelText('Titular')).toHaveValue('Borrador de titular');
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
  });

  it('descartar vuelve a lo guardado y borra el borrador', async () => {
    await openEditor();
    await typeInto('Titular', 'Algo distinto');
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí' }));
    expect(screen.getByLabelText('Titular')).not.toHaveValue('Algo distinto');
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
  });

  it('la vista previa muestra el borrador sin guardar y se cierra con Esc', async () => {
    const c = mk();
    await openEditor(c);
    await typeInto('Titular', 'Titular de prueba en vivo');
    await userEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    const dlg = await screen.findByRole('dialog', { name: 'Vista previa del perfil público' });
    expect(within(dlg).getByText('Titular de prueba en vivo')).toBeInTheDocument();
    expect((await c.getMyProfile()).headline).not.toBe('Titular de prueba en vivo');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('las anclas llevan al bloque y enfocan su encabezado', async () => {
    saveSession(student);
    renderAt('/profile/edit#skills');
    await screen.findByLabelText('Nombre a mostrar');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Aptitudes' })).toHaveFocus());
  });

  it('en la navegación cada sección dice si está completa', async () => {
    await openEditor();
    const nav = screen.getByRole('navigation', { name: 'Secciones del perfil' });
    expect(within(nav).getByRole('link', { name: /Básicos \(completa\)/ })).toBeInTheDocument();
    expect(within(nav).getByRole('progressbar', { name: 'Completitud del perfil' })).toBeInTheDocument();
  });
});

describe('editor: tutor y certificados', () => {
  it('tutor: muestra Docencia y no Objetivos; certificados explica que no tiene', async () => {
    await openEditor(mk(), tutor);
    expect(document.getElementById('teaching')).not.toBeNull();
    expect(document.getElementById('goals')).toBeNull();
    expect(within(document.getElementById('certificates')!).getByText(/no tenés certificados propios/)).toBeInTheDocument();
  });

  it('alumno: destacar y ordenar certificados', async () => {
    const c = mk();
    await openEditor(c);
    const block = document.getElementById('certificates')!;
    const boxes = await within(block).findAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    const featuredBefore = (await c.getMyProfile()).certificatesFeatured.length;
    const off = boxes.find((b) => !(b as HTMLInputElement).checked);
    if (off) await userEvent.click(off);
    else await userEvent.click(boxes[0]);
    await userEvent.click(saveBtn());
    await screen.findByText('Guardado hace un momento');
    expect((await c.getMyProfile()).certificatesFeatured.length).not.toBe(featuredBefore);
  });
});

describe('ajustes', () => {
  const openSettings = async (c: ApiClient = mk(), who = student) => {
    saveSession(who);
    renderAt('/profile/settings', c);
    await screen.findByRole('heading', { level: 2, name: 'Tu perfil público' });
  };

  it('avisa que el perfil es siempre público y no hay control de privado/público', async () => {
    await openSettings();
    expect(screen.getByText(/Tu perfil es público: cualquiera con el enlace puede verlo\. No hay modo privado en esta demo\./)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /privad|público/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /privad/i })).toBeNull();
    expect(screen.getByText(/camila-ferreyra/)).toBeInTheDocument();
  });

  it('cada interruptor oculta su sección del perfil público', async () => {
    const c = mk();
    await openSettings(c);
    const sw = screen.getByRole('switch', { name: 'Proyectos' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(within(sw.closest('li')!).getByText('Visible')).toBeInTheDocument();
    expect((await c.getPublicProfile('camila-ferreyra')).projects.length).toBeGreaterThan(0);
    await userEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    expect(within(sw.closest('li')!).getByText('Oculta')).toBeInTheDocument();
    expect(await screen.findByText(/Proyectos: ahora está oculta/)).toBeInTheDocument();
    expect((await c.getPublicProfile('camila-ferreyra')).projects).toEqual([]);
    expect((await c.getMyProfile()).hiddenSections).toContain('projects');
    await userEvent.click(sw);
    await waitFor(async () => expect((await c.getPublicProfile('camila-ferreyra')).projects.length).toBeGreaterThan(0));
  });

  it('contacto: vaciar el email lo saca del público', async () => {
    const c = mk();
    await openSettings(c);
    await typeInto('Email de contacto público (opcional)', '');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto' }));
    expect(await screen.findByText(/ya no muestra ningún email/)).toBeInTheDocument();
    expect('contactEmail' in (await c.getPublicProfile('camila-ferreyra'))).toBe(false);
  });

  it('cuenta: nombre, rol y email de solo lectura con la nota de privacidad', async () => {
    await openSettings();
    const card = screen.getByRole('heading', { name: 'Cuenta' }).closest('div')!;
    expect(within(card).getByText('Alumno')).toBeInTheDocument();
    expect(within(card).getByText('alumno01@demo.test')).toBeInTheDocument();
    expect(within(card).getByText('El email de la cuenta nunca se muestra en tu perfil público.')).toBeInTheDocument();
    expect(card.querySelector('input')).toBeNull();
  });

  it('cambiar la dirección con verificación de disponibilidad', async () => {
    const c = mk();
    await openSettings(c);
    await typeInto('Cambiar la dirección', 'marcos-quiroga');
    expect(await screen.findByText('En uso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar dirección' })).toBeDisabled();
    await typeInto('Cambiar la dirección', 'camila-ferreyra-2');
    await screen.findByText('Disponible');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));
    expect(await screen.findByText('Dirección actualizada.')).toBeInTheDocument();
    expect((await c.getMyProfile()).slug).toBe('camila-ferreyra-2');
  });

  it('restablecer los perfiles de ejemplo pide confirmación y vuelve al original', async () => {
    const c = mk();
    await c.updateMyProfile({ headline: 'Titular editado' }).catch(() => null); // sin sesión no aplica; se edita con sesión
    saveSession(student);
    await c.updateMyProfile({ headline: 'Titular editado' });
    await openSettings(c);
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer perfiles de ejemplo' }));
    expect(screen.getByText(/¿Restablecer\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    expect((await c.getMyProfile()).headline).toBe('Titular editado');
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer perfiles de ejemplo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí' }));
    expect(await screen.findByText('Perfiles restablecidos.')).toBeInTheDocument();
    expect((await c.getMyProfile()).headline).not.toBe('Titular editado');
  });

  it('tutor: ve el interruptor de Docencia; alumno no', async () => {
    await openSettings(mk(), tutor);
    expect(screen.getByRole('switch', { name: 'Docencia' })).toBeInTheDocument();
    cleanup(); clearSession();
    await openSettings();
    expect(screen.queryByRole('switch', { name: 'Docencia' })).toBeNull();
  });
});
