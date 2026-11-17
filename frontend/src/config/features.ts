/**
 * Perfiles (Mi perfil, Directorio, /p/:slug, tarjetas de perfil en Inicio) y detalle de certificado.
 * Apagado por defecto: el backend real todavía no tiene esos endpoints (GET /me/profile, /profiles,
 * /certificates/{id}). Para verlos con el mock: VITE_PROFILES=on en frontend/.env.local.
 * TODO(equipo): prender por defecto cuando el backend los implemente.
 */
export const PROFILES_ENABLED = import.meta.env.VITE_PROFILES === 'on';
