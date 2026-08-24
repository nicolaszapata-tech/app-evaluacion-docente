/**
 * Login "suave" del lado del cliente con Google Identity Services -- NO es
 * una barrera de seguridad real (ver comentario equivalente en
 * APP_GRUPOS_ACTIVOS/src/lib/auth.js), solo evita que cualquiera con el link
 * del panel entre sin ser staff de Kuepa/La Nueva América. La seguridad real
 * de los datos (cédulas, respuestas) la da RLS en Supabase (INSERT-only para
 * anon, sin SELECT), no este login.
 */

const ALLOWED_DOMAINS = ['lanuevaamerica.edu.co', 'kuepa.edu.co'];
const SESSION_KEY = 'evaluacion_docente_sesion';

export function dominioPermitido(email) {
  if (!email) return false;
  const dominio = email.split('@')[1]?.toLowerCase();
  return !!dominio && ALLOWED_DOMAINS.includes(dominio);
}

export function decodificarJwt(token) {
  const payload = token.split('.')[1];
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(json);
}

export function leerSesion() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const sesion = JSON.parse(raw);
    if (!sesion.email || !dominioPermitido(sesion.email)) return null;
    return sesion;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
}

export function cerrarSesion() {
  sessionStorage.removeItem(SESSION_KEY);
}
