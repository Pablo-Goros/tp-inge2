import { useEffect, useRef } from 'react';
import { loadGis } from './googleIdentity';

interface Props { clientId: string; onCredential: (credential: string) => void; onError: () => void }

export function GoogleButton({ clientId, onCredential, onError }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };

  useEffect(() => {
    let live = true;
    loadGis().then((g) => {
      if (!live || !box.current) return;
      g.accounts.id.initialize({ client_id: clientId, callback: (r) => handlers.current.onCredential(r.credential) });
      g.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'es' });
    }, () => { if (live) handlers.current.onError(); });
    return () => { live = false; };
  }, [clientId]);

  return <div ref={box} data-testid="google-button" className="login-google" />;
}
