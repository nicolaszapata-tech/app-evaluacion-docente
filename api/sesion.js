/**
 * /api/sesion — login del panel staff (ver api/_lib/sesion.js).
 *   GET    -> { email, nombre, foto } si la cookie es válida; 401 si no.
 *   POST   { idToken } -> verifica con Google + lista de correos y deja la
 *          cookie de sesión; 403 si el correo no tiene acceso.
 *   DELETE -> borra la cookie (cerrar sesión).
 */

import { verificarTokenGoogle, correoPermitido, cookieDeSesion, cookieBorrada, leerSesion, faltaConfig } from './_lib/sesion.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (faltaConfig()) {
    res.status(500).json({ error: 'Falta configurar SESSION_SECRET en Vercel.' });
    return;
  }

  if (req.method === 'GET') {
    const s = leerSesion(req);
    if (!s) {
      res.status(401).json({ error: 'sin_sesion' });
      return;
    }
    res.status(200).json(s);
    return;
  }

  if (req.method === 'POST') {
    const datos = await verificarTokenGoogle(req.body?.idToken);
    if (!datos) {
      res.status(401).json({ error: 'No se pudo verificar el inicio de sesión con Google. Intenta de nuevo.' });
      return;
    }
    if (!correoPermitido(datos.email)) {
      res.status(403).json({ error: `El correo ${datos.email} no tiene acceso al panel de Evaluación Docente.` });
      return;
    }
    res.setHeader('Set-Cookie', cookieDeSesion(datos));
    res.status(200).json(datos);
    return;
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieBorrada());
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
