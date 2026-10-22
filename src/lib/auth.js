/**
 * Login "suave" del lado del cliente con Google Identity Services -- NO es
 * una barrera de seguridad real (ver comentario equivalente en
 * APP_GRUPOS_ACTIVOS/src/lib/auth.js), solo evita que cualquiera con el link
 * del panel entre sin ser staff de Kuepa/La Nueva América. La seguridad real
 * de los datos (cédulas, respuestas) la da RLS en Supabase (INSERT-only para
 * anon, sin SELECT), no este login.
 */

// 2026-10-22, a pedido del usuario: ya no entra todo el dominio, solo estos
// correos (en minúscula). Para dar o quitar acceso, editar esta lista y
// redesplegar -- la usan el login y /api/panel.
const CORREOS_PERMITIDOS = new Set([
  'laura.bahamon@kuepa.edu.co',
  'laura.bahamon@lanuevaamerica.edu.co',
  'nicolas.zapata@kuepa.edu.co',
  'nicolas.zapata@lanuevaamerica.edu.co',
  'ana.ruiz@kuepa.edu.co',
  'ana.ruiz@lanuevaamerica.edu.co',
  'laura.mora@lanuevaamerica.edu.co',
  'david.cristancho@lanuevaamerica.edu.co',
  'julian.garcia@lanuevaamerica.edu.co',
  'andres.valero@kuepa.edu.co',
  'andres.valero@lanuevaamerica.edu.co',
]);
const SESSION_KEY = 'evaluacion_docente_sesion';

export function correoPermitido(email) {
  if (!email) return false;
  return CORREOS_PERMITIDOS.has(String(email).trim().toLowerCase());
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
    if (!sesion.email || !correoPermitido(sesion.email)) return null;
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
