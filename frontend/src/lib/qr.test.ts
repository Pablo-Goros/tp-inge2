import { buildCodewords, dataCapacity, EC_M, encodeQr, formatBits, reedSolomon, type QrMatrix } from './qr';

// ─── Decodificador de verificación, independiente del codificador (su propio GF y su propio mapa de módulos de función) ───
const EXP: number[] = []; const LOG: number[] = [];
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x > 255) x ^= 0x11d; } }
const gmul = (a: number, b: number) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

function functionMap(version: number): boolean[][] {
  const n = 17 + 4 * version;
  const f = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const rect = (x0: number, y0: number, w: number, h: number) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < n && y < n) f[y][x] = true; };
  rect(0, 0, 9, 9); rect(n - 8, 0, 8, 9); rect(0, n - 8, 9, 8); // buscadores + separadores + formato
  rect(6, 0, 1, n); rect(0, 6, n, 1); // sincronía
  const centers = version === 1 ? [] : version < 7 ? [6, 4 * version + 10] : [[6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]][version - 7];
  centers.forEach((cx, i) => centers.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === centers.length - 1) || (i === centers.length - 1 && j === 0)) return;
    rect(cx - 2, cy - 2, 5, 5);
  }));
  if (version >= 7) { rect(n - 11, 0, 3, 6); rect(0, n - 11, 6, 3); }
  return f;
}

function decode(qr: QrMatrix): { text: string; mask: number; syndromesOk: boolean } {
  const { size: n, modules: m } = qr;
  const version = (n - 17) / 4;
  // Formato, copia 1 (alrededor del buscador superior izquierdo)
  const pos: [number, number][] = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  let fmt = 0;
  pos.forEach(([x, y], i) => { if (m[y][x]) fmt |= 1 << i; });
  fmt ^= 0x5412;
  expect(fmt >> 13).toBe(0); // nivel M = 00
  const mask = (fmt >> 10) & 7;
  const cond = [(x: number, y: number) => (x + y) % 2 === 0, (_: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (((x / 3) | 0) + ((y / 2) | 0)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mask];
  const f = functionMap(version);
  const bits: number[] = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const up = ((right + 1) & 2) === 0;
    for (let v = 0; v < n; v++) for (const x of [right, right - 1]) {
      const y = up ? n - 1 - v : v;
      if (!f[y][x]) bits.push((m[y][x] !== cond(x, y) ? 1 : 0));
    }
  }
  const cw: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const [ec, n1, d1, n2, d2] = EC_M[version - 1];
  const total = n1 * (d1 + ec) + n2 * (d2 + ec);
  const words = cw.slice(0, total);
  // Desentrelazar
  const nb = n1 + n2;
  const blocks: number[][] = Array.from({ length: nb }, () => []);
  let k = 0;
  for (let i = 0; i < Math.max(d1, d2); i++) for (let b = 0; b < nb; b++) if (i < (b < n1 ? d1 : d2)) blocks[b].push(words[k++]);
  for (let i = 0; i < ec; i++) for (let b = 0; b < nb; b++) blocks[b].push(words[k++]);
  // Síndromes: el bloque completo evaluado en α^0..α^(ec-1) debe dar 0
  let syndromesOk = true;
  for (const blk of blocks) for (let s = 0; s < ec; s++) {
    let acc = 0;
    for (const c of blk) acc = gmul(acc, EXP[s]) ^ c;
    if (acc !== 0) syndromesOk = false;
  }
  const data = blocks.flatMap((b) => b.slice(0, b.length - ec));
  const bs = data.map((c) => c.toString(2).padStart(8, '0')).join('');
  expect(bs.slice(0, 4)).toBe('0100'); // modo byte
  const cc = version <= 9 ? 8 : 16;
  const len = parseInt(bs.slice(4, 4 + cc), 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(bs.slice(4 + cc + 8 * i, 12 + cc + 8 * i), 2);
  return { text: new TextDecoder().decode(out), mask, syndromesOk };
}

const verifyUrl = 'https://certificados.ejemplo.test/verify/7f3a9c2e-5b1d-4e8a-9c6f-0123456789ab';

describe('QR', () => {
  it('Reed-Solomon coincide con el ejemplo clásico de la versión 1-M ("HELLO WORLD")', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomon(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('bits de formato de nivel M / máscara 0 = 101010000010010', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010');
  });

  it('tamaño: 17 + 4 × versión, con la versión mínima que entra', () => {
    const qr = encodeQr(verifyUrl);
    const bytes = new TextEncoder().encode(verifyUrl).length; // 79
    expect(bytes).toBe(verifyUrl.length);
    expect(qr.version).toBe(5); // 1-M..4-M admiten 14/26/42/62 bytes; 5-M admite 84
    expect(qr.size).toBe(37);
    expect(qr.modules).toHaveLength(37);
    expect(qr.modules.every((r) => r.length === 37)).toBe(true);
    expect(encodeQr('a').version).toBe(1);
    expect(encodeQr('a'.repeat(14)).version).toBe(1);
    expect(encodeQr('a'.repeat(15)).version).toBe(2);
    expect(encodeQr('a'.repeat(213)).version).toBe(10);
    expect(() => encodeQr('a'.repeat(214))).toThrow(RangeError);
  });

  it('patrones de posición, sincronía y módulo oscuro en su lugar', () => {
    const { modules: m, size: n } = encodeQr(verifyUrl);
    for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        expect(m[cy + dy][cx + dx]).toBe(edge || core);
      }
    }
    for (let i = 8; i < n - 8; i++) { expect(m[6][i]).toBe(i % 2 === 0); expect(m[i][6]).toBe(i % 2 === 0); }
    expect(m[n - 8][8]).toBe(true);
    // Patrón de alineación de la versión 5 en (30, 30)
    expect(m[30][30]).toBe(true); expect(m[29][30]).toBe(false); expect(m[28][30]).toBe(true);
  });

  it.each([
    [verifyUrl], ['x'], ['Certificados verificables · áéíóú ñ ✓'], ['a'.repeat(100)], ['b'.repeat(130)], ['https://x.test/' + 'c'.repeat(150)], ['d'.repeat(213)],
  ])('decodifica con una función propia el mismo contenido (%#)', (text) => {
    const qr = encodeQr(text);
    const r = decode(qr);
    expect(r.syndromesOk).toBe(true);
    expect(r.text).toBe(text);
    expect(r.mask).toBe(qr.mask);
  });

  it('cada versión entrelaza bloques con la longitud total esperada', () => {
    for (let v = 1; v <= EC_M.length; v++) {
      const [ec, n1, d1, n2, d2] = EC_M[v - 1];
      expect(buildCodewords(new Uint8Array([65]), v)).toHaveLength(dataCapacity(v) + ec * (n1 + n2));
      expect(n1 * d1 + n2 * d2).toBe(dataCapacity(v));
    }
  });
});
