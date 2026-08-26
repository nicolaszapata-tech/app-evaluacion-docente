import { supabase } from './supabase.js';
import { normalizar } from './normalizar.js';
import { leerSesion } from './auth.js';

/** Las 4 categorías fijas que ya trae base_de_grupos_evaluacion_docente
 *  (categoria_programa) -- los links se arman por categoría, NO por programa
 *  específico (decisión explícita del usuario, 2026-08-24). */
export const CATEGORIAS_EVALUACION_DOCENTE = ['Administración', 'Contabilidad', 'Marketing', 'Ingeniería'];

/** Slug de URL sin tildes/espacios -- para categoría y mes en la ruta
 *  /evaluar/:categoriaSlug/:mesSlug. */
export function slug(texto) {
  return normalizar(texto).replace(/\s+/g, '-');
}

/** Color fijo por mes (para separar visualmente Agosto/Septiembre/... en toda
 *  la app -- chips, filas de tabla, botones de Estadísticas, links). Los 5
 *  meses reales de este ciclo (agosto-diciembre) tienen color fijo; si algún
 *  día aparece un mes fuera de esa lista (2027...), cae a un color
 *  determinístico de una paleta de reserva en vez de romperse. */
const COLOR_MES_FIJO = {
  agosto: '#5b7fff',
  septiembre: '#f59e0b',
  octubre: '#10b981',
  noviembre: '#f43f5e',
  diciembre: '#a78bfa',
};
const PALETA_MESES_RESERVA = ['#22d3ee', '#fb923c', '#84cc16', '#e879f9', '#38bdf8', '#facc15', '#f472b6'];

export function colorDeMes(mes) {
  const clave = normalizar(mes);
  if (COLOR_MES_FIJO[clave]) return COLOR_MES_FIJO[clave];
  let hash = 0;
  for (let i = 0; i < clave.length; i++) hash = (hash * 31 + clave.charCodeAt(i)) >>> 0;
  return PALETA_MESES_RESERVA[hash % PALETA_MESES_RESERVA.length];
}

export function categoriaDeSlug(s) {
  return CATEGORIAS_EVALUACION_DOCENTE.find((c) => slug(c) === s) || null;
}

/** mes_calificacion en la base es el nombre completo en español ("Agosto",
 *  "Septiembre", ver MESES_NOMBRE_ES_EVALUACION_DOCENTE en
 *  09_Base_Evaluacion_Docente.gs) -- el slug es solo minúsculas sin tildes. */
export function mesDeSlug(s, mesesDisponibles) {
  return (mesesDisponibles || []).find((m) => slug(m) === s) || null;
}

/** Solo dígitos -- pedido explícito del usuario ("sin números, puntos,
 *  comas" se refería a limpiar separadores de miles, no a quitar dígitos). */
export function sanitizarCedula(valor) {
  return (valor || '').replace(/\D/g, '');
}

export async function fetchMesesDisponibles() {
  const { data, error } = await supabase
    .from('base_de_grupos_evaluacion_docente')
    .select('mes_calificacion');
  if (error) throw error;
  const meses = new Set((data || []).map((r) => r.mes_calificacion).filter(Boolean));
  return Array.from(meses);
}

/** mes_calificacion -> activo, para el panel (evita una consulta por mes). */
export async function fetchMesesActivosMapa() {
  const { data, error } = await supabase.from('evaluacion_docente_meses_activos').select('mes_calificacion, activo');
  if (error) throw error;
  const mapa = {};
  (data || []).forEach((r) => { mapa[r.mes_calificacion] = !!r.activo; });
  return mapa;
}

export async function fetchMesActivo(mes) {
  const { data, error } = await supabase
    .from('evaluacion_docente_meses_activos')
    .select('activo')
    .eq('mes_calificacion', mes)
    .maybeSingle();
  if (error) throw error;
  return !!data?.activo;
}

/** Materias y docentes deduplicados de esa categoría+mes, para poblar los
 *  Combobox del formulario -- "link vivo": si se agrega un grupo nuevo a
 *  base_de_grupos_evaluacion_docente (sync horario), aparece acá sin tocar
 *  el link. */
export async function fetchOpcionesFormulario(categoria, mes) {
  const { data, error } = await supabase
    .from('base_de_grupos_evaluacion_docente')
    .select('subject_name, tutor_calendario, group_id')
    .eq('categoria_programa', categoria)
    .eq('mes_calificacion', mes);
  if (error) throw error;

  const materias = new Set();
  const docentes = new Set();
  (data || []).forEach((r) => {
    if (r.subject_name) materias.add(r.subject_name);
    if (r.tutor_calendario) docentes.add(r.tutor_calendario);
  });
  return {
    materias: Array.from(materias).sort(),
    docentes: Array.from(docentes).sort(),
    grupos: data || [],
  };
}

/** Tabla de grupos con evaluación docente, tal cual sale de la hoja
 *  ENCUESTAS DE SATISFACCION (09_Base_Evaluacion_Docente.gs) -- para la
 *  vista "Tabla" del panel staff. */
/** "2026-08-10" (formato fecha de Postgres) -> "10/08/2026". */
export function formatearFechaDDMMYYYY(iso) {
  if (!iso) return '';
  const [anio, mes, dia] = String(iso).split('-');
  if (!anio || !mes || !dia) return iso;
  return `${dia}/${mes}/${anio}`;
}

export async function fetchGruposEvaluacionDocente() {
  const { data, error } = await supabase
    .from('base_de_grupos_evaluacion_docente')
    .select(
      'id_grupo_mapeo, mes_calificacion, group_id, section_id, categoria_programa, materia, horario, fecha_calendario_inicio, fecha_calendario_fin, tutor_calendario, cupos_activos'
    )
    .order('mes_calificacion', { ascending: true })
    .order('categoria_programa', { ascending: true })
    .order('id_grupo_mapeo', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** El id del estudiante se genera en el navegador (crypto.randomUUID) en vez
 *  de leerlo de vuelta con RETURNING -- las tablas son INSERT-only para
 *  anon (sin policy de SELECT, a propósito, para que nadie con la key
 *  pública pueda leer cédulas/respuestas) y Postgres exige una policy de
 *  SELECT para poder devolver la fila insertada con RETURNING, aunque sea
 *  el mismo rol que insertó. Generándolo acá evitamos necesitar RETURNING. */
export async function enviarEvaluacionDocente({ identidad, respuestas }) {
  const estudianteId = crypto.randomUUID();

  const { error: errEstudiante } = await supabase
    .from('estudiantes_evaluacion_docente')
    .insert({ id: estudianteId, ...identidad });
  if (errEstudiante) throw errEstudiante;

  const { error: errRespuestas } = await supabase
    .from('consolidada_respuestas_evaluacion_docente')
    .insert({ ...respuestas, estudiante_id: estudianteId });
  if (errRespuestas) throw errRespuestas;
}

/** Todas las llamadas privilegiadas del panel (toggle de mes, stats) pasan
 *  por /api/panel (Vercel Function, src ../../api/panel.js) en vez de pegarle
 *  directo al webhook de n8n con un secreto en el bundle del cliente -- el
 *  secreto real ahora vive server-side (variable de entorno de Vercel, sin
 *  prefijo VITE_, nunca se empaqueta al navegador). 2026-08-26, corrigiendo
 *  el riesgo #6 detectado por Opus ("VITE_SYNC_SECRET está en el bundle del
 *  cliente, cualquiera lo extrae de las devtools"). Se manda también el
 *  correo de la sesión (login "suave" de Google, ver auth.js) para que el
 *  server pueda rechazar llamadas sin sesión válida -- no es autenticación
 *  criptográfica real, pero ya no depende de un secreto público estático.
 */
async function llamarPanel_(body) {
  const sesion = leerSesion();
  const respuesta = await fetch('/api/panel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, correoSesion: sesion?.email || null }),
  });
  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => '');
    throw new Error(`El servidor respondió HTTP ${respuesta.status}. ${texto}`.trim());
  }
  return respuesta.json();
}

export async function togglearMesActivo(mes, activo) {
  return llamarPanel_({ accion: 'toggle_mes', mes, activo });
}

/** { stats: [participación por categoria+mes vs cupos_activos], detalle:
 *  [promedio de cada pregunta Likert por categoria+mes, más una entrada
 *  "Todas" por mes con el promedio global combinado] }. */
export async function fetchStatsEvaluacionDocente() {
  const { stats } = await fetchStatsYDetalle();
  return stats;
}

export async function fetchDetalleEvaluacionDocente() {
  return fetchStatsYDetalle();
}

async function fetchStatsYDetalle() {
  const { stats, detalle } = await llamarPanel_({ accion: 'stats' });
  return { stats: stats || [], detalle: detalle || [] };
}
