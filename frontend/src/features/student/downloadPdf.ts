/** "Introducción a Criptografía" → "certificado-introduccion-a-criptografia.pdf" */
export function pdfFileName(course: string): string {
  const slug = course.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `certificado-${slug || 'curso'}.pdf`;
}

/** Dispara el guardado de un Blob con un <a download> temporal y libera la URL. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
