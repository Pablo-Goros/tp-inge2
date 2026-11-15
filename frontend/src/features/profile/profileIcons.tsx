import type { LinkKind } from '../../api';

const P = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

const PATHS: Record<LinkKind, JSX.Element> = {
  web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10.5V16M8 8v.01M12 16v-5.5M12 13c0-1.6 1-2.5 2.3-2.5S16.5 11.4 16.5 13V16" /></>,
  github: <><path d="M9 19c-4 1.2-4-2-6-2.5m12 5v-3.2a2.8 2.8 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.3 2.1 5.3 2.4 5.3 2.4a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 3.9 8.8c0 4.6 2.8 5.7 5.5 6a2.8 2.8 0 0 0-.8 2.2V21" /></>,
  portfolio: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></>,
  otro: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
};

export const LinkIcon = ({ kind }: { kind: LinkKind }) => <svg {...P}>{PATHS[kind] ?? PATHS.otro}</svg>;

export const ExternalIcon = () => <svg {...P} width={14} height={14}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
export const CheckSealIcon = () => <svg {...P} width={16} height={16}><path d="M12 3l2.2 1.7 2.8-.2 1 2.6 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-1 2.6-2.8-.2L12 21l-2.2-1.7-2.8.2-1-2.6L3.7 15.3l.9-2.7-.9-2.7L6 8.3l1-2.6 2.8.2z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>;
export const TrophyIcon = () => <svg {...P} width={18} height={18}><path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" /></svg>;
export const CopyIcon = () => <svg {...P} width={16} height={16}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>;
export const MailIcon = () => <svg {...P} width={16} height={16}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
