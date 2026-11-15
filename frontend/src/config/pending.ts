// Textos y formato del CSV pendientes de confirmar con el equipo. Todo lo que cambie va SOLO acá.
// TODO(equipo): contracts §5 dice "una columna email"; el diseño pide nombre+email. El mock acepta ambas.
// TODO(equipo): confirmar formato exacto, ejemplo y texto de ayuda del CSV.
export const CSV_COLUMNS = ['nombre', 'email'] as const;
export const CSV_EXAMPLE = 'nombre,email\nCamila Ferreyra,alumno01@demo.test\nAgustín Roldán,alumno02@demo.test\n';
export const CSV_HELP = 'CSV en UTF-8 con encabezado. Columnas "nombre" y "email", o solo "email". Máximo 100 filas.';
