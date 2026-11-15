/** Recorta al centro y redimensiona a un cuadrado de `size` px; devuelve data URL. Sin canvas (jsdom) devuelve el archivo tal cual. */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export async function toSquareDataUrl(file: File, size = 512): Promise<string> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return await readAsDataUrl(file);
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return await readAsDataUrl(file);
    const side = Math.min(bmp.width, bmp.height);
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
    bmp.close?.();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return readAsDataUrl(file);
  }
}
