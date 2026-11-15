import { useEffect, useState } from 'react';
import type { Profile } from '../../api';
import { useApi } from '../session/AuthProvider';

export interface CertView { id: string; course: string; institution?: string; date: string }
export type CertState = { s: 'loading' } | { s: 'ok'; items: CertView[] };

/**
 * Certificados del perfil: los destacados (se leen del registro público, sin datos de cuenta). En la vista propia
 * de un alumno sin destacados se muestran todos los suyos.
 */
export function useProfileCertificates(profile: Profile, own: boolean): CertState {
  const api = useApi();
  const [state, setState] = useState<CertState>({ s: 'loading' });
  const key = profile.certificatesFeatured.join(',');
  const role = profile.role;

  useEffect(() => {
    let alive = true;
    setState({ s: 'loading' });
    (async () => {
      let items: CertView[] = [];
      if (key) {
        const res = await Promise.allSettled(key.split(',').map((id) => api.getPublicCertificate(id)));
        items = res.flatMap((r) => (r.status === 'fulfilled'
          ? [{ id: r.value.certificate_id, course: r.value.course_name, institution: r.value.institution, date: r.value.completion_date }] : []));
      } else if (own && role === 'student') {
        try {
          items = (await api.listMyCertificates()).map((c) => ({ id: c.certificate_id, course: c.course_name, institution: c.institution, date: c.completion_date }));
        } catch { items = []; }
      }
      if (alive) setState({ s: 'ok', items });
    })();
    return () => { alive = false; };
  }, [api, key, own, role]);

  return state;
}
