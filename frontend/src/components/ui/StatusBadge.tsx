import type { BatchStatus, CertStatus, VerifyOutcome } from '../../api/types';

type Tone = 'ok' | 'bad' | 'warn' | 'inf' | 'mut';

interface BadgeProps {
  tone: Tone;
  icon: string;
  children: string;
  className?: string;
  'data-testid'?: string;
}

export function Badge({ tone, icon, children, className, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={['bdg', tone, className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">{icon}</span>
      {children}
    </span>
  );
}

/** Estado de una solicitud de certificado. `attempts` activo y PENDING con intentos previos = reintento. */
export function CertStatusBadge({ status, attempts, maxAttempts = 3 }: { status: CertStatus; attempts?: number; maxAttempts?: number }) {
  if (status === 'PENDING' && attempts && attempts > 0) {
    return <Badge tone="warn" icon="↻">{`Reintento ${attempts}/${maxAttempts}`}</Badge>;
  }
  switch (status) {
    case 'PENDING': return <Badge tone="mut" icon="○">Pendiente</Badge>;
    case 'PROCESSING': return <Badge tone="inf" icon="◐">Procesando</Badge>;
    case 'ISSUED': return <Badge tone="ok" icon="✓">Emitido</Badge>;
    case 'FAILED': return <Badge tone="bad" icon="✕">Fallido</Badge>;
  }
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  switch (status) {
    case 'IN_PROGRESS': return <Badge tone="inf" icon="◐">En curso</Badge>;
    case 'COMPLETED': return <Badge tone="ok" icon="✓">Completado</Badge>;
    case 'COMPLETED_WITH_ERRORS': return <Badge tone="warn" icon="!">Completado con errores</Badge>;
  }
}

/** Distingue por color, ícono y forma del borde (sólido / doble / punteado / puntos). */
export const verifyMeta: Record<VerifyOutcome, { tone: Tone; icon: string; label: string; shape: string }> = {
  VALID: { tone: 'ok', icon: '✓', label: 'Válido', shape: 'valid' },
  ALTERED: { tone: 'bad', icon: '✕', label: 'Alterado', shape: 'altered' },
  NOT_FOUND: { tone: 'mut', icon: '?', label: 'No registrado', shape: 'notfound' },
  UNAVAILABLE: { tone: 'warn', icon: '!', label: 'No se pudo verificar', shape: 'unavailable' },
};

export function VerifyResultBadge({ outcome }: { outcome: VerifyOutcome }) {
  const m = verifyMeta[outcome];
  return (
    <Badge tone={m.tone} icon={m.icon} className={`bdg-v-${m.shape}`} data-testid={`verify-badge-${outcome}`}>
      {m.label}
    </Badge>
  );
}
