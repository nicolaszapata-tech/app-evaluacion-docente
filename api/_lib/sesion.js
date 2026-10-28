/**
 * ============================================================================
 *  Sesión del panel staff, verificada en el SERVIDOR (2026-10-22)
 * ============================================================================
 *  Antes el acceso se decidía en el navegador (lista de correos dentro del
 *  bundle + sessionStorage), y el panel leía las tablas directo de Supabase
 *  con la clave pública: una pestaña vieja o cualquiera con las devtools
 *  podía saltarse el login. Ahora:
 *   1. El navegador manda el ID token de Google a /api/sesion.
 *   2. Acá se verifica con Google (firma, audiencia, vencimiento, correo
 *      verificado) y que el correo esté en CORREOS_PERMITIDOS.
 *   3. Se entrega una cookie HttpOnly firmada con HMAC (SESSION_SECRET), que
 *      JavaScript no puede leer ni inventar.
 *   4. /api/panel y /api/datos exigen esa cookie en CADA llamada y vuelven a
 *      revisar la lista, así que quitar a alguien de la lista lo saca al
 *      instante, sin esperar a que venza la cookie.
 *  Los archivos de api/_lib no son rutas (Vercel ignora los que empiezan
 *  con "_").
 * ============================================================================
 */

import crypto from 'node:crypto';

// Para dar o quitar acceso: editar esta lista y redesplegar. Vive solo en el
// servidor (no se publica en el JavaScript que descarga el navegador).
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
  'brandon.olano@kuepa.com',
  'brandon.olano@kuepa.edu.co',
  'brandon.olano@lanuevaamerica.edu.co',
  'juana.paris@kuepa.com',
  'juana.paris@kuepa.edu.co',
  'juana.paris@lanuevaamerica.edu.co',
  'lorena.guerrero@kuepa.com',
  'lorena.guerrero@kuepa.edu.co',
  'lorena.guerrero@lanuevaamerica.edu.co',
]);

const COOKIE = 'ed_sesion';
const DURACION_S = 12 * 60 * 60; // 12 h, después hay que volver a entrar con Google
const SECRETO = process.env.SESSION_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

export function correoPermitido(email) {
  if (!email) return false;
  return CORREOS_PERMITIDOS.has(String(email).trim().toLowerCase());
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function firmar(texto) {
  return crypto.createHmac('sha256', SECRETO).update(texto).digest('base64url');
}

/** ID token de Google -> { email, nombre, foto } si es válido y el correo
 *  está permitido; null en cualquier otro caso. */
export async function verificarTokenGoogle(idToken) {
  if (!idToken || !GOOGLE_CLIENT_ID) return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!r.ok) return null;
    const p = await r.json();
    if (p.aud !== GOOGLE_CLIENT_ID) return null;
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(p.iss)) return null;
    if (!(p.email_verified === true || p.email_verified === 'true')) return null;
    if (!p.exp || Number(p.exp) * 1000 < Date.now()) return null;
    return { email: String(p.email).toLowerCase(), nombre: p.name || null, foto: p.picture || null };
  } catch {
    return null;
  }
}

export function cookieDeSesion(datos) {
  const payload = b64url(JSON.stringify({ ...datos, exp: Date.now() + DURACION_S * 1000 }));
  const valor = payload + '.' + firmar(payload);
  return `${COOKIE}=${valor}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_S}`;
}

export function cookieBorrada() {
  return `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/** Lee y valida la cookie del request -> { email, nombre, foto } o null. */
export function leerSesion(req) {
  if (!SECRETO) return null;
  const crudo = String(req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!crudo) return null;
  const [payload, firma] = crudo.slice(COOKIE.length + 1).split('.');
  if (!payload || !firma) return null;
  const esperada = Buffer.from(firmar(payload));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!s.exp || s.exp < Date.now()) return null;
    if (!correoPermitido(s.email)) return null;
    return { email: s.email, nombre: s.nombre || null, foto: s.foto || null };
  } catch {
    return null;
  }
}

export const faltaConfig = () => !SECRETO;
