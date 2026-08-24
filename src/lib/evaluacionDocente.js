import { supabase } from './supabase.js';
import { normalizar } from './normalizar.js';

/** Las 4 categorías fijas que ya trae base_de_grupos_evaluacion_docente
 *  (categoria_programa) -- los links se arman por categoría, NO por programa
 *  específico (decisión explícita del usuario, 2026-08-24). */
export const CATEGORIAS_EVALUACION_DOCENTE = ['Administración', 'Contabilidad', 'Marketing', 'Ingeniería'];

const WEBHOOK_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE;
const SYNC_SECRET = import.meta.env.VITE_SYNC_SECRET;
const WEBHOOK_PATH = 'evaluacion-docente-panel';

/** Slug de URL sin tildes/espacios -- para categoría y mes en la ruta
 *  /evaluar/:categoriaSlug/:mesSlug. */
export function slug(texto) {
  return normalizar(texto).replace(/\s+/g, '-');
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
    .from('respuestas_evaluacion_docente')
    .insert({ ...respuestas, estudiante_id: estudianteId });
  if (errRespuestas) throw errRespuestas;
}

function webhookHeaders() {
  if (!WEBHOOK_BASE || !SYNC_SECRET) {
    throw new Error('Falta configurar VITE_N8N_WEBHOOK_BASE / VITE_SYNC_SECRET.');
  }
  return { 'Content-Type': 'application/json', 'X-Sync-Secret': SYNC_SECRET };
}

export async function togglearMesActivo(mes, activo) {
  const respuesta = await fetch(`${WEBHOOK_BASE}/${WEBHOOK_PATH}`, {
    method: 'POST',
    headers: webhookHeaders(),
    body: JSON.stringify({ accion: 'toggle_mes', mes, activo }),
  });
  if (!respuesta.ok) throw new Error(`El workflow respondió HTTP ${respuesta.status}.`);
  return respuesta.json();
}

export async function fetchStatsEvaluacionDocente() {
  const respuesta = await fetch(`${WEBHOOK_BASE}/${WEBHOOK_PATH}`, {
    method: 'POST',
    headers: webhookHeaders(),
    body: JSON.stringify({ accion: 'stats' }),
  });
  if (!respuesta.ok) throw new Error(`El workflow respondió HTTP ${respuesta.status}.`);
  const { stats } = await respuesta.json();
  return stats || [];
}
