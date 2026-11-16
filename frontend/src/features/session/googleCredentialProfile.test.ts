import { decodeGoogleProfile } from './googleCredentialProfile';

const b64url = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload: unknown) => `xxx.${b64url(payload)}.sig`;

describe('decodeGoogleProfile', () => {
  it('lee email y name del payload de un token válido (con tildes)', () => {
    expect(decodeGoogleProfile(jwt({ email: 'a@b.test', name: 'Ángela Pérez' }))).toEqual({ email: 'a@b.test', name: 'Ángela Pérez' });
  });

  it('ignora claims que no son string', () => {
    expect(decodeGoogleProfile(jwt({ email: 5, name: null }))).toEqual({});
  });

  it.each(['', 'basura', 'a.b.c', 'a.%%%.c', `a.${btoa('no json')}.c`, `a.${btoa('[1]')}.c`])('%j -> {}', (c) => {
    expect(decodeGoogleProfile(c)).toEqual({});
  });

  it('mock-google:<email> -> email y nombre = parte local', () => {
    expect(decodeGoogleProfile('mock-google: Ana.Nueva@Demo.test ')).toEqual({ email: 'ana.nueva@demo.test', name: 'ana.nueva' });
  });
});
