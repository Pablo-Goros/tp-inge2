/**
 * Generador mínimo de códigos QR (ISO/IEC 18004): modo byte, corrección de errores nivel M, versiones 1 a 10
 * (hasta 213 bytes), máscara elegida por penalización. Sin dependencias. `modules[y][x] === true` es un módulo oscuro.
 */
export interface QrMatrix { version: number; size: number; mask: number; modules: boolean[][] }

/** Nivel M: [codewords de corrección por bloque, nº de bloques cortos, datos por bloque corto, nº de bloques largos, datos por bloque largo]. */
export const EC_M: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
];
export const MAX_VERSION = EC_M.length;
const ALIGN: ReadonlyArray<readonly number[]> = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

export const dataCapacity = (version: number) => { const e = EC_M[version - 1]; return e[1] * e[2] + e[3] * e[4]; };

// ─── Campo de Galois GF(256), polinomio 0x11D ───
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Codewords de corrección Reed-Solomon para `data`. */
export function reedSolomon(data: readonly number[], ecLen: number): number[] {
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    gen = next;
  }
  const rem = new Array<number>(ecLen).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < ecLen; i++) rem[i] ^= mul(gen[i + 1], f);
  }
  return rem;
}

/** Bits de formato (15) para nivel M y la máscara dada, ya enmascarados con 0x5412. */
export function formatBits(mask: number): number {
  const data = (0 << 3) | mask; // nivel M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

const bit = (v: number, i: number) => ((v >>> i) & 1) !== 0;

/** Datos + corrección, entrelazados por bloques, listos para colocar. */
export function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const [ecLen, n1, d1, n2, d2] = EC_M[version - 1];
  const bits: number[] = [];
  const push = (v: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const cap = dataCapacity(version) * 8;
  push(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCapacity(version); pad ^= 0xec ^ 0x11) data.push(pad);

  const blocks: { data: number[]; ec: number[] }[] = [];
  let at = 0;
  for (let b = 0; b < n1 + n2; b++) {
    const len = b < n1 ? d1 : d2;
    const slice = data.slice(at, at + len);
    at += len;
    blocks.push({ data: slice, ec: reedSolomon(slice, ecLen) });
  }
  const out: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach((b) => { if (i < b.data.length) out.push(b.data[i]); });
  for (let i = 0; i < ecLen; i++) blocks.forEach((b) => out.push(b.ec[i]));
  return out;
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(version: number, codewords: number[], mask: number): QrMatrix {
  const size = 17 + 4 * version;
  const m = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { m[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx; const y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) !== 2 && Math.max(Math.abs(dx), Math.abs(dy)) !== 4);
    }
  }
  const pos = ALIGN[version - 1];
  pos.forEach((cx, i) => pos.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // Formato (dos copias) y módulo oscuro fijo
  const fb = formatBits(mask);
  for (let i = 0; i <= 5; i++) set(8, i, bit(fb, i));
  set(8, 7, bit(fb, 6)); set(8, 8, bit(fb, 7)); set(7, 8, bit(fb, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fb, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fb, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fb, i));
  set(8, size - 8, true);
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3); const b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // Datos en zigzag
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (!fn[y][x] && k < codewords.length * 8) { m[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
  return { version, size, mask, modules: m };
}

function penalty(mx: boolean[][]): number {
  const n = mx.length;
  let score = 0;
  const lines = [...mx, ...Array.from({ length: n }, (_, x) => mx.map((row) => row[x]))];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    for (let i = 0; i + 11 <= n; i++) {
      const w = line.slice(i, i + 11).map(Number).join('');
      if (w === '10111010000' || w === '00001011101') score += 40;
    }
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    if (mx[y][x] === mx[y][x + 1] && mx[y][x] === mx[y + 1][x] && mx[y][x] === mx[y + 1][x + 1]) score += 3;
  }
  const dark = mx.reduce((s, r) => s + r.filter(Boolean).length, 0);
  return score + 10 * (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1);
}

/** Codifica `text` (UTF-8, modo byte, nivel M). Lanza si no entra en la versión 10 (213 bytes). */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  const need = (v: number) => Math.ceil((4 + (v <= 9 ? 8 : 16) + 8 * bytes.length) / 8);
  while (version <= MAX_VERSION && need(version) > dataCapacity(version)) version++;
  if (version > MAX_VERSION) throw new RangeError('El texto es demasiado largo para el generador de QR (máx. 213 bytes).');
  const codewords = buildCodewords(bytes, version);
  let best: QrMatrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand = build(version, codewords, mask);
    const s = penalty(cand.modules);
    if (s < bestScore) { best = cand; bestScore = s; }
  }
  return best!;
}
