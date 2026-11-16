import { ApiError } from '../ApiClient';
import { clearSession, saveSession } from '../token';
import { createMockClient } from './MockApiClient';
import { listProfiles, PROFILES_KEY, resetProfiles } from './profileStore';

const mk = (sc: string[] = []) => createMockClient({ latencyMs: 0, scenarios: () => new Set(sc) });
const asStudent = () => saveSession({ token: 'mock:alumno01@demo.test', user: { name: 'Camila Ferreyra', role: 'student' } });
const asOperator = () => saveSession({ token: 'mock:operador@demo.test', user: { name: 'Marcos Quiroga', role: 'operator' } });
const png = (size = 100, type = 'image/png') => {
  const f = new File(['x'], 'foto.png', { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => { clearSession(); resetProfiles(); asStudent(); });

describe('perfiles del mock', () => {
  it('hay ~14 perfiles detallados y todos los alumnos 01..25 tienen uno, con foto y slug único', () => {
    const all = listProfiles();
    expect(all.length).toBeGreaterThanOrEqual(32);
    expect(new Set(all.map((p) => p.profile.slug)).size).toBe(all.length);
    expect(all.every((p) => p.profile.avatarUrl.startsWith('data:image/'))).toBe(true);
    expect(all.filter((p) => p.owner?.startsWith('alumno')).length).toBe(25);
    expect(all.filter((p) => p.profile.role === 'operator').length).toBeGreaterThanOrEqual(5);
  });

  it('getMyProfile devuelve el perfil de la cuenta', async () => {
    expect((await mk().getMyProfile()).displayName).toBe('Camila Ferreyra');
    asOperator();
    const m = await mk().getMyProfile();
    expect(m.displayName).toBe('Marcos Quiroga');
    expect(m.role).toBe('operator');
  });

  it('updateMyProfile persiste (también en un cliente nuevo) y resetProfiles lo deshace', async () => {
    await mk().updateMyProfile({ headline: 'Nuevo titular de prueba', skills: [] });
    const again = await mk().getMyProfile();
    expect(again.headline).toBe('Nuevo titular de prueba');
    expect(again.skills).toEqual([]);
    expect(localStorage.getItem(PROFILES_KEY)).toContain('Nuevo titular de prueba');
    resetProfiles();
    expect((await mk().getMyProfile()).headline).toMatch(/Estudiante de Ingeniería/);
  });

  it('no deja cambiar el rol', async () => {
    expect((await mk().updateMyProfile({ role: 'operator' })).role).toBe('student');
  });

  it('slug duplicado se rechaza con 409; uno libre se acepta y el viejo queda libre', async () => {
    const api = mk();
    await expect(api.updateMyProfile({ slug: 'marcos-quiroga' })).rejects.toMatchObject({ status: 409, code: 'VALIDATION_ERROR' });
    expect(await api.checkSlugAvailable('marcos-quiroga')).toBe(false);
    expect(await api.checkSlugAvailable('camila-ferreyra')).toBe(true); // el propio
    expect(await api.checkSlugAvailable('camila-f')).toBe(true);
    await api.updateMyProfile({ slug: 'camila-f' });
    await expect(api.getPublicProfile('camila-ferreyra')).rejects.toMatchObject({ status: 404 });
    expect((await api.getPublicProfile('camila-f')).displayName).toBe('Camila Ferreyra');
  });

  it('valida slug mal formado, foto obligatoria y contactEmail', async () => {
    const api = mk();
    await expect(api.updateMyProfile({ slug: 'Mal Slug' })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateMyProfile({ avatarUrl: '' })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateMyProfile({ contactEmail: 'no-es-email' })).rejects.toMatchObject({ status: 400 });
  });

  it('avatar inválido (tipo o tamaño) se rechaza; uno válido se guarda como data URL', async () => {
    const api = mk();
    await expect(api.uploadAvatar(png(100, 'image/gif'))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(api.uploadAvatar(png(3 * 1024 * 1024))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const { avatarUrl } = await api.uploadAvatar(png());
    expect(avatarUrl.startsWith('data:')).toBe(true);
    expect((await api.getMyProfile()).avatarUrl).toBe(avatarUrl);
  });

  it('endpoints con sesión rechazan sin token (401) y los públicos no la requieren', async () => {
    clearSession();
    const api = mk();
    await expect(api.getMyProfile()).rejects.toMatchObject({ status: 401 });
    await expect(api.updateMyProfile({})).rejects.toMatchObject({ status: 401 });
    await expect(api.uploadAvatar(png())).rejects.toMatchObject({ status: 401 });
    await expect(api.checkSlugAvailable('abc')).rejects.toMatchObject({ status: 401 });
    expect((await api.getPublicProfile('camila-ferreyra')).slug).toBe('camila-ferreyra');
    expect((await api.searchProfiles()).length).toBeGreaterThan(0);
    await expect(api.getPublicProfile('no-existe')).rejects.toMatchObject({ status: 404 });
  });

  it('Agustín Roldán destaca 3 certificados que tiene emitidos', async () => {
    saveSession({ token: 'mock:alumno02@demo.test', user: { name: 'Agustín Roldán', role: 'student' } });
    const api = mk();
    const featured = (await api.getPublicProfile('agustin-roldan')).certificatesFeatured;
    expect(featured).toHaveLength(3);
    const mine = (await api.listMyCertificates()).map((c) => c.certificate_id);
    expect(mine).toEqual(expect.arrayContaining(featured));
  });

  it('el perfil público no filtra email de cuenta ni contactEmail vacío', async () => {
    clearSession();
    const api = mk();
    const agus = await api.getPublicProfile('agustin-roldan'); // sin contactEmail
    expect('contactEmail' in agus).toBe(false);
    const camila = await api.getPublicProfile('camila-ferreyra'); // con contactEmail a propósito
    expect(camila.contactEmail).toBe('camila.ferreyra.contacto@ejemplo.test');
    for (const s of listProfiles()) {
      const pub = JSON.stringify(await api.getPublicProfile(s.profile.slug));
      expect(pub).not.toMatch(/@demo\.test/);
    }
    // vaciar el contactEmail también lo saca del público
    asStudent();
    await api.updateMyProfile({ contactEmail: '' });
    clearSession();
    expect('contactEmail' in (await api.getPublicProfile('camila-ferreyra'))).toBe(false);
  });

  it('las secciones ocultas no salen en el público pero sí en el propio perfil', async () => {
    const api = mk();
    await api.updateMyProfile({ hiddenSections: ['projects', 'skills'] });
    expect((await api.getMyProfile()).projects.length).toBeGreaterThan(0);
    clearSession();
    const pub = await api.getPublicProfile('camila-ferreyra');
    expect(pub.projects).toEqual([]);
    expect(pub.skills).toEqual([]);
    expect(pub.hiddenSections).toEqual(['projects', 'skills']);
  });

  it('searchProfiles filtra por texto, rol y aptitud, y resume', async () => {
    const api = mk();
    const tutors = await api.searchProfiles({ role: 'operator' });
    expect(tutors.length).toBeGreaterThanOrEqual(5);
    expect(tutors.every((t) => t.role === 'operator')).toBe(true);
    const py = await api.searchProfiles({ skill: 'python' });
    expect(py.length).toBeGreaterThan(3);
    const q = await api.searchProfiles({ q: 'criptografia' });
    expect(q.map((p) => p.slug)).toContain('marcos-quiroga');
    expect(q[0].topSkills.length).toBeLessThanOrEqual(3);
    expect((await api.searchProfiles({ page: 99 })).length).toBe(0);
    expect(JSON.stringify(q)).not.toMatch(/@/);
  });

  it('getCertificateDetail: propio sí, ajeno 404', async () => {
    const api = mk();
    const [mine] = await api.listMyCertificates();
    const d = await api.getCertificateDetail(mine.certificate_id);
    expect(d.verifyUrl).toContain(`/verify/${mine.certificate_id}`);
    expect(d.course_name).toBe(mine.course_name);
    await expect(api.getCertificateDetail('no-existe')).rejects.toMatchObject({ status: 404 });
  });

  it('escenarios profile-fail, slug-taken y avatar-fail', async () => {
    await expect(mk(['profile-fail']).getMyProfile()).rejects.toMatchObject({ status: 503 });
    await expect(mk(['profile-fail']).getPublicProfile('camila-ferreyra')).rejects.toBeInstanceOf(ApiError);
    expect(await mk(['slug-taken']).checkSlugAvailable('libre-seguro')).toBe(false);
    await expect(mk(['slug-taken']).updateMyProfile({ slug: 'libre-seguro' })).rejects.toMatchObject({ status: 409 });
    await expect(mk(['avatar-fail']).uploadAvatar(png())).rejects.toMatchObject({ status: 503 });
  });
});
