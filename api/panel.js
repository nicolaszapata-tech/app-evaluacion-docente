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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

/** Acciones que devuelven datos personales de estudiantes (correo, cédula):
 *  2026-10-15. Para estas NO basta el correo que manda el navegador (se
 *  puede inventar); se exige el ID token de Google de la sesión y se
 *  verifica acá contra Google (firma, audiencia = nuestro client id,
 *  vencimiento, correo verificado y dominio permitido). */
const ACCIONES_CON_DATOS_PERSONALES = new Set(['respuestas_erradas_detalle', 'corregir_respuesta']);

async function correoVerificadoGoogle(idToken) {
  if (!idToken || !GOOGLE_CLIENT_ID) return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!r.ok) return null;
    const p = await r.json();
    if (p.aud !== GOOGLE_CLIENT_ID) return null;
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(p.iss)) return null;
    if (!(p.email_verified === true || p.email_verified === 'true')) return null;
    if (!p.exp || Number(p.exp) * 1000 < Date.now()) return null;
    if (!dominioPermitido(p.email)) return null;
    return p.email;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!WEBHOOK_BASE || !SYNC_SECRET) {
    res.status(500).json({ error: 'Falta configurar N8N_WEBHOOK_BASE / SYNC_SECRET_EVALUACION_DOCENTE en Vercel.' });
    return;
  }

  const { correoSesion: correoDeclarado, idToken, ...body } = req.body || {};
  let correoSesion = correoDeclarado;
  if (ACCIONES_CON_DATOS_PERSONALES.has(body.accion)) {
    correoSesion = await correoVerificadoGoogle(idToken);
    if (!correoSesion) {
      res.status(401).json({ error: 'sesion_expirada', detalle: 'Inicia sesión de nuevo con Google para ver datos de estudiantes.' });
      return;
    }
  } else if (!dominioPermitido(correoSesion)) {
    res.status(403).json({ error: 'Sesión no autorizada.' });
    return;
  }

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
