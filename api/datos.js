/**
 * /api/datos — lecturas del panel staff, hechas en el servidor (2026-10-22).
 *
 * Antes el panel leía estas tablas directo de Supabase con la clave pública
 * (la que va dentro del JavaScript del navegador), así que cualquiera podía
 * leerlas sin pasar por el login. Ahora se piden acá, con la cookie de
 * sesión verificada, y se leen con la clave secreta del servidor
 * (SUPABASE_SECRET_KEY, variable de Vercel sin prefijo VITE_).
 *
 * Solo se aceptan las consultas de esta lista (nombre -> tabla + query fija
 * de PostgREST): el navegador no puede pedir otra tabla ni otras columnas.
 */

import { leerSesion } from './_lib/sesion.js';

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPA_SECRET = process.env.SUPABASE_SECRET_KEY;

const CONSULTAS = {
  grupos: ['doc_base_de_grupos', 'select=id_grupo_mapeo,mes_calificacion,group_id,section_id,categoria_programa,materia,cuatrimestre,horario,fecha_calendario_inicio,fecha_calendario_fin,tutor_calendario,cupos_activos&order=mes_calificacion.asc,categoria_programa.asc,id_grupo_mapeo.asc'],
  meses_disponibles: ['doc_base_de_grupos', 'select=mes_calificacion'],
  meses_activos: ['doc_meses_activos', 'select=mes_calificacion,activo'],
  ultimo_sync_grupos: ['doc_base_de_grupos', 'select=actualizado_en&order=actualizado_en.desc&limit=1'],
  combinados: ['grupos_combinados', 'select=id,mes_calificacion,member_group_ids,member_mapeos,etiqueta,carreras,subject_name,tutor_calendario,horario,creado_en&activo=eq.true&aplica_evaluacion_docente=eq.true&order=creado_en.asc'],
  directorio: ['directutor_tutores_base_de_directorio', 'select=id_docente,nombres_completos,docente,celular,correo_institucional,docente_activo&order=nombres_completos.asc'],
  listas: ['asap_seguimiento_grupo', 'select=group_id,cantidad_estudiantes_listas,asistentes_min_1_sesion,listado_url'],
  alertas: ['doc_alertas_cierre', 'select=id,group_id,id_grupo_mapeo,categoria_programa,mes_calificacion,materia,tutor_calendario,canal,tipo,destinatario,enviado_por,estado,detalle,respuestas_antes,creado_en&order=creado_en.desc'],
  estudiantes_activos: ['doc_estudiantes_activos', 'select=mes_calificacion,estudiantes_activos'],
  historico: ['doc_historico_enero_julio_2026', null], // columnas las manda el cliente, validadas abajo
};

const COLUMNAS_HISTORICO = new Set([
  'categoria_programa', 'nps_recomendaria',
  'plataforma_acceso_recursos', 'plataforma_disponibilidad',
  'docente_comunicacion', 'docente_creatividad', 'docente_preparacion', 'docente_estrategias_pedagogicas', 'docente_participacion', 'docente_dominio',
  'contenidos_ruta_aprendizaje', 'contenidos_utilidad', 'contenidos_informacion_clara', 'contenidos_material', 'contenidos_estrategias_evaluacion',
]);

const PAGINA = 1000;

/** Trae todas las filas, de a 1000 (límite de PostgREST por respuesta). */
async function leerTodo(tabla, query) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${tabla}?${query}`, {
      headers: {
        apikey: SUPA_SECRET,
        Authorization: `Bearer ${SUPA_SECRET}`,
        Range: `${desde}-${desde + PAGINA - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!r.ok) throw new Error(`Supabase ${tabla}: HTTP ${r.status} ${await r.text().catch(() => '')}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < PAGINA || /limit=/.test(query)) return filas;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!leerSesion(req)) {
    res.status(403).json({ error: 'Sesión no autorizada.' });
    return;
  }
  if (!SUPA_URL || !SUPA_SECRET) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_SECRET_KEY en Vercel.' });
    return;
  }

  const { consulta, columnas } = req.body || {};
  const def = CONSULTAS[consulta];
  if (!def) {
    res.status(400).json({ error: 'Consulta no permitida.' });
    return;
  }
  let [tabla, query] = def;
  if (consulta === 'historico') {
    const cols = (Array.isArray(columnas) ? columnas : []).filter((c) => COLUMNAS_HISTORICO.has(c));
    if (!cols.length) {
      res.status(400).json({ error: 'Columnas no permitidas.' });
      return;
    }
    query = 'select=' + cols.join(',');
  }

  try {
    res.status(200).json({ filas: await leerTodo(tabla, query) });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo leer de Supabase.', detalle: String(e.message || e) });
  }
}
