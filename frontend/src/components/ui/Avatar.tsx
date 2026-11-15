import { useEffect, useState } from 'react';
import { initialsOf } from '../../api/profileUtils';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface Props {
  src?: string;
  /** Texto alternativo de la imagen. Por defecto, el nombre. */
  alt?: string;
  name: string;
  size?: AvatarSize;
  /** Anillo de marca alrededor. */
  ring?: boolean;
  className?: string;
}

/** Foto de perfil; si la imagen falla o no hay, muestra las iniciales. */
export function Avatar({ src, alt, name, size = 'md', ring, className }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const cls = ['av', `av-${size}`, ring && 'av-ring', className].filter(Boolean).join(' ');
  if (!src || failed) {
    return <span role="img" aria-label={alt ?? name} className={`${cls} av-fb`}><span aria-hidden="true">{initialsOf(name)}</span></span>;
  }
  return <img className={cls} src={src} alt={alt ?? name} onError={() => setFailed(true)} />;
}
