/**
 * Sesión del panel staff, lado navegador (2026-10-22).
 *
 * El navegador ya NO decide quién entra: manda el ID token de Google a
 * /api/sesion y el servidor lo verifica contra Google y contra la lista de
 * correos permitidos (api/_lib/sesion.js), y deja una cookie HttpOnly que
 * JavaScript no puede leer ni falsificar. Acá solo se consulta/abre/cierra
 * esa sesión. La lista de correos ya no se publica en el bundle.
 */

/** Sesión actual según el servidor -> { email, nombre, foto } o null. */
export async function obtenerSesion() {
  try {
    const r = await fetch('/api/sesion', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Abre sesión con el ID token de Google. Lanza Error con el mensaje del
 *  servidor si el correo no tiene acceso. */
export async function iniciarSesion(idToken) {
  const r = await fetch('/api/sesion', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || 'No se pudo iniciar sesión.');
  return out;
}

export async function cerrarSesion() {
  try {
    await fetch('/api/sesion', { method: 'DELETE', credentials: 'same-origin' });
  } catch {
    // sin red: la cookie igual vence sola
  }
  try {
    sessionStorage.removeItem('evaluacion_docente_sesion'); // sesión del esquema anterior
  } catch {
    // sin acceso a storage
  }
}
