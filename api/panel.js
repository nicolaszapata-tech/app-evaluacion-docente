/**
 * ============================================================================
 *  /api/panel — proxy server-side al webhook de n8n del panel staff
 * ============================================================================
 *  2026-08-26: corrige el riesgo detectado por el análisis de Opus ("Opus
 *  Fase 2"): el secreto del webhook (X-Sync-Secret) vivía en
 *  VITE_SYNC_SECRET, una variable que Vite empaqueta TAL CUAL en el bundle
 *  JS que se sirve al navegador -- cualquiera con las devtools abiertas
 *  podía extraerlo. Acá el secreto vive en variables de entorno de Vercel
 *  SIN prefijo VITE_ (N8N_WEBHOOK_BASE, SYNC_SECRET_EVALUACION_DOCENTE),
 *  que Vite nunca empaqueta y que solo existen en el runtime server-side de
 *  esta función. El navegador ya no conoce el secreto en absoluto.
 *
 *  Sesión: desde 2026-10-22 se exige la cookie HttpOnly firmada que entrega
 *  /api/sesion tras verificar el login de Google y la lista de correos
 *  permitidos (api/_lib/sesion.js).
 * ============================================================================
 */

import { leerSesion } from './_lib/sesion.js';

const WEBHOOK_BASE = process.env.N8N_WEBHOOK_BASE;
const SYNC_SECRET = process.env.SYNC_SECRET_EVALUACION_DOCENTE;
const WEBHOOK_PATH = 'evaluacion-docente-panel';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!WEBHOOK_BASE || !SYNC_SECRET) {
    res.status(500).json({ error: 'Falta configurar N8N_WEBHOOK_BASE / SYNC_SECRET_EVALUACION_DOCENTE en Vercel.' });
    return;
  }

  // 2026-10-22: TODA acción exige la cookie de sesión verificada en el
  // servidor (api/_lib/sesion.js). El correo ya no lo declara el navegador.
  const sesion = leerSesion(req);
  if (!sesion) {
    res.status(403).json({ error: 'Sesión no autorizada.' });
    return;
  }
  const { correoSesion: _ignorado, idToken: _ignorado2, ...body } = req.body || {};
  const correoSesion = sesion.email;

  try {
    const respuesta = await fetch(`${WEBHOOK_BASE}/${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Secret': SYNC_SECRET },
      // se reenvía correoSesion dentro del body (ya validado arriba) para que
      // el workflow pueda registrar quién disparó la acción -- ej. alerta_cierre
      // guarda enviado_por en doc_alertas_cierre.
      body: JSON.stringify({ ...body, correoSesion }),
    });
    const texto = await respuesta.text();
    res.status(respuesta.status).setHeader('Content-Type', 'application/json').send(texto);
  } catch (e) {
    res.status(502).json({ error: 'No se pudo contactar el workflow de n8n.', detalle: String(e) });
  }
}
