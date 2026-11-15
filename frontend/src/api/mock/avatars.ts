import { initialsOf } from '../profileUtils';

/** Avatares ilustrados y deterministas (SVG como data URI): figura geométrica + iniciales, colores de marca. Sin fotos ni red. */
const PALETTE: [bg: string, fg: string, accent: string][] = [
  ['#0369a1', '#e0f2fe', '#075985'], ['#0c2d48', '#dbeafe', '#0369a1'], ['#0e7490', '#cffafe', '#155e75'],
  ['#075985', '#e0f2fe', '#0c4a6e'], ['#334155', '#e2e8f0', '#0369a1'], ['#166534', '#dcfce7', '#14532d'],
  ['#a16207', '#fef3c7', '#854d0e'], ['#1e40af', '#dbeafe', '#1e3a8a'],
];

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function avatarDataUri(name: string): string {
  const h = hash(name);
  const [bg, fg, ac] = PALETTE[h % PALETTE.length];
  const shape = h % 3;
  const deco =
    shape === 0 ? `<circle cx="150" cy="30" r="46" fill="${ac}"/><circle cx="14" cy="176" r="30" fill="${ac}" opacity=".7"/>`
    : shape === 1 ? `<path d="M0 140 L110 200 L0 200Z" fill="${ac}"/><rect x="132" y="14" width="40" height="40" rx="8" fill="${ac}" transform="rotate(18 152 34)"/>`
    : `<path d="M0 0 L90 0 L0 90Z" fill="${ac}"/><circle cx="160" cy="160" r="40" fill="${ac}" opacity=".7"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" fill="${bg}"/>${deco}` +
    `<text x="100" y="100" dy=".35em" text-anchor="middle" font-family="IBM Plex Sans, Arial, sans-serif" font-weight="600" font-size="76" fill="${fg}">${initialsOf(name)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
