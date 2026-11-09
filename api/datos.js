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
  // 2026-11-04: antes salía del flujo n8n (acción conteos_respuestas); cuando
  // n8n se caía, la vista Grupos mostraba 0 respuestas en todos los grupos.
  // Se agrupa abajo, aquí mismo, y solo sale el conteo (sin datos personales).
  conteos_respuestas: ['doc_respuestas_consolidada', 'select=categoria_programa,mes_calificacion,materia,docente&order=id.asc'],
  // 2026-11-04: comentarios del análisis cualitativo con algún tema del
  // profesor (ficha del docente > Comentarios). Solo texto + docente/mes;
  // sin correo ni cédula del estudiante.
  comentarios_docente: ['doc_analisis_cualitativo', 'select=id,campo_origen,temas,sentimiento,texto,doc_respuestas_consolidada(mes_calificacion,categoria_programa,docente)&temas=ov.{DOCENTE_CLARIDAD,DOCENTE_DOMINIO,DOCENTE_TRATO,DOCENTE_DINAMISMO}&sentimiento=in.(positivo,mixto,negativo)&order=id.asc'],
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

/** Mismo cálculo que el nodo "Calcular Conteos Respuestas" de n8n: cuántas
 *  respuestas hay por carrera + mes + materia + docente (recortados). */
function contarRespuestas(filas) {
  const conteo = new Map();
  for (const r of filas) {
    if (!r || !r.categoria_programa || !r.mes_calificacion) continue;
    const materia = (r.materia || '').trim() || null;
    const docente = (r.docente || '').trim() || null;
    const clave = JSON.stringify([r.categoria_programa, r.mes_calificacion, materia, docente]);
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  }
  return [...conteo].map(([clave, respuestas]) => {
    const [categoria_programa, mes_calificacion, materia, docente] = JSON.parse(clave);
    return { categoria_programa, mes_calificacion, materia, docente, respuestas };
  });
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
    const filas = await leerTodo(tabla, query);
    let salida = filas;
    if (consulta === 'conteos_respuestas') salida = contarRespuestas(filas);
    if (consulta === 'comentarios_docente') {
      // 2026-11-09: además van TODOS los comentarios de la pregunta del
      // docente (también genéricos tipo "excelente"/"N/A" y los de otro
      // tema), sin texto, solo para explicar en la ficha por qué el número de
      // comentarios escritos no es el mismo que el de comentarios mostrados.
      const vistos = new Set(filas.map((f) => f.id));
      const campoDocente = await leerTodo('doc_analisis_cualitativo', 'select=id,campo_origen,temas,sentimiento,doc_respuestas_consolidada(mes_calificacion,categoria_programa,docente)&campo_origen=eq.docente&order=id.asc');
      const todas = filas.concat(campoDocente.filter((f) => !vistos.has(f.id)));
      salida = todas.map((f) => {
        const r = f.doc_respuestas_consolidada || {};
        const temas = f.temas || [];
        const tipo = vistos.has(f.id) ? 'profesor' : temas.includes('SIN_SUSTANCIA') ? 'generico' : 'otro';
        const fila = { tipo, campo_origen: f.campo_origen, mes_calificacion: r.mes_calificacion, categoria_programa: r.categoria_programa, docente: r.docente };
        if (tipo === 'profesor') Object.assign(fila, { temas, sentimiento: f.sentimiento, texto: f.texto });
        return fila;
      });
    }
    res.status(200).json({ filas: salida });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo leer de Supabase.', detalle: String(e.message || e) });
  }
}
