// Google Identity Services: se carga en runtime, una sola vez (sin dependencia npm).
export interface GoogleAccounts {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, o: { theme: string; size: string; text: string; locale: string }): void;
    };
  };
}

declare global { interface Window { google?: GoogleAccounts } }

const SRC = 'https://accounts.google.com/gsi/client';
let pending: Promise<GoogleAccounts> | null = null;

export function loadGis(): Promise<GoogleAccounts> {
  if (window.google?.accounts) return Promise.resolve(window.google);
  pending ??= new Promise<GoogleAccounts>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => (window.google?.accounts ? resolve(window.google) : (pending = null, s.remove(), reject(new Error('GIS sin accounts'))));
    s.onerror = () => { pending = null; s.remove(); reject(new Error('No se pudo cargar GIS')); };
    document.head.appendChild(s);
  });
  return pending;
}
