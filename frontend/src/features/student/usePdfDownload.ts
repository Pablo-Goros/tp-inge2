import { useEffect, useRef, useState } from 'react';
import { useApi } from '../session/AuthProvider';
import { pdfFileName, saveBlob } from './downloadPdf';

export type PdfState = 'idle' | 'busy' | 'error';

/** Descarga del PDF de un certificado con estados cargando/error (una sola petición aunque se haga doble clic). */
export function usePdfDownload(certificateId: string, courseName: string) {
  const api = useApi();
  const [state, setState] = useState<PdfState>('idle');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function download() {
    if (busy.current) return;
    busy.current = true;
    setState('busy');
    try {
      const blob = await api.downloadCertificatePdf(certificateId);
      saveBlob(blob, pdfFileName(courseName));
      if (alive.current) setState('idle');
    } catch {
      if (alive.current) setState('error');
    } finally {
      busy.current = false;
    }
  }
  return { state, download };
}
