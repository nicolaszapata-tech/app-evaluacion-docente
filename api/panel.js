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
 *  Verificación mínima de sesión: se exige que el request traiga el correo
 *  de la sesión de Google del staff (guardado client-side por lib/auth.js)
 *  y que su dominio sea uno de los permitidos (dominioPermitido). No es
 *  verificación criptográfica del JWT de Google (eso sería un paso más,
 *  pendiente si hace falta más adelante) -- pero ya no depende de un
 *  secreto estático público, que era el problema real.
 * ============================================================================
 */

import { dominioPermitido } from '../src/lib/auth.js';

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

  const { correoSesion, ...body } = req.body || {};
  if (!dominioPermitido(correoSesion)) {
    res.status(403).json({ error: 'Sesión no autorizada.' });
    return;
  }

  try {
    const respuesta = await fetch(`${WEBHOOK_BASE}/${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Secret': SYNC_SECRET },
      body: JSON.stringify(body),
    });
    const texto = await respuesta.text();
    res.status(respuesta.status).setHeader('Content-Type', 'application/json').send(texto);
  } catch (e) {
    res.status(502).json({ error: 'No se pudo contactar el workflow de n8n.', detalle: String(e) });
  }
}
