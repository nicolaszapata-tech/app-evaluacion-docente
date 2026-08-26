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
  if (mes === MES_HISTORICO_ENERO_JULIO) return '#94a3b8'; // gris neutro -- distingue el bloque histórico de los meses en vivo
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

/** Las 13 preguntas Likert (1-5) de la evaluación -- clave compartida entre
 *  el cálculo de estadísticas (resumenDeFilas, matrizCorrelacion) y las
 *  etiquetas de UI (EvaluacionDocentePanel.jsx). */
export const PREGUNTAS_LIKERT_KEYS = [
  'plataforma_acceso_recursos', 'plataforma_disponibilidad',
  'docente_comunicacion', 'docente_creatividad', 'docente_preparacion',
  'docente_estrategias_pedagogicas', 'docente_participacion', 'docente_dominio',
  'contenidos_ruta_aprendizaje', 'contenidos_utilidad', 'contenidos_informacion_clara',
  'contenidos_material', 'contenidos_estrategias_evaluacion',
];

/** { stats: [participación por categoria+mes vs cupos_activos], crudo:
 *  [{categoria_programa, mes_calificacion, filas: [{...13 likert, nps_recomendaria}]}] }
 *  -- SIN promediar; el frontend calcula promedios/boxplot/correlación (ver
 *  resumenDeFilas, matrizCorrelacion) porque Plotly ya sabe hacer boxplot a
 *  partir de valores crudos, y así no hay que duplicar lógica de
 *  estadística en el Code node de n8n cada vez que se agrega un análisis. */
export async function fetchStatsEvaluacionDocente() {
  const { stats } = await fetchStatsYCrudo();
  return stats;
}

export async function fetchCrudoEvaluacionDocente() {
  const { crudo } = await fetchStatsYCrudo();
  return crudo;
}

/** Trae stats + crudo en una sola llamada al webhook (evita pedirlo dos
 *  veces cuando la vista de Estadísticas necesita ambos, como
 *  EvaluacionDocentePanel.jsx). */
export async function fetchStatsYCrudo() {
  const { stats, crudo } = await llamarPanel_({ accion: 'stats' });
  return { stats: stats || [], crudo: crudo || [] };
}

/** Bloque histórico (Google Forms, sin cédula/correo/group_id -> no se
 *  puede deduplicar por estudiante, ver comentario de la tabla en
 *  Supabase). Se trata como un "mes" más en el selector de Estadísticas,
 *  pero es una sola importación fija -- no tiene toggle de activación ni
 *  cupos_activos, por eso no aparece en fetchMesesDisponibles ni en la
 *  generación de links de encuesta. */
export const MES_HISTORICO_ENERO_JULIO = 'Histórico Enero-Julio 2026';

const TABLA_HISTORICO_ENERO_JULIO = 'historico_enero_julio_2026_respuestas_evaluacion_docente';

/** Igual forma que fetchCrudoEvaluacionDocente/fetchStatsYCrudo (array de
 *  {categoria_programa, mes_calificacion, filas}) para poder reusar
 *  resumenDeFilas/matrizCorrelacion/BoxplotPreguntas sin cambios. Se lee
 *  directo de Supabase (tabla SELECT-pública, sin PII) en vez de por el
 *  webhook de n8n -- no hay nada privado que proteger acá. */
export async function fetchCrudoHistoricoEneroJulio() {
  const columnas = ['categoria_programa', ...PREGUNTAS_LIKERT_KEYS, 'nps_recomendaria'].join(',');
  const { data, error } = await supabase.from(TABLA_HISTORICO_ENERO_JULIO).select(columnas);
  if (error) throw error;
  const porCategoria = {};
  (data || []).forEach((r) => {
    if (!r.categoria_programa) return;
    if (!porCategoria[r.categoria_programa]) {
      porCategoria[r.categoria_programa] = {
        categoria_programa: r.categoria_programa,
        mes_calificacion: MES_HISTORICO_ENERO_JULIO,
        filas: [],
      };
    }
    const fila = {};
    PREGUNTAS_LIKERT_KEYS.forEach((k) => { if (typeof r[k] === 'number') fila[k] = r[k]; });
    if (typeof r.nps_recomendaria === 'number') fila.nps_recomendaria = r.nps_recomendaria;
    porCategoria[r.categoria_programa].filas.push(fila);
  });
  return Object.values(porCategoria);
}

/** Promedio general (de las 13 preguntas), promedio de NPS y conteo, a
 *  partir de un array de filas crudas (ver fetchCrudoEvaluacionDocente).
 *  Ignora valores faltantes en vez de tratarlos como 0. */
export function resumenDeFilas(filas) {
  const n = filas.length;
  if (!n) return { respuestas: 0, promedio_general: null, promedio_nps: null, preguntas: {} };

  const preguntas = {};
  let sumaTotal = 0;
  let cuentaTotal = 0;
  PREGUNTAS_LIKERT_KEYS.forEach((k) => {
    const valores = filas.map((f) => f[k]).filter((v) => typeof v === 'number');
    if (valores.length) {
      const suma = valores.reduce((a, b) => a + b, 0);
      preguntas[k] = Math.round((suma / valores.length) * 100) / 100;
      sumaTotal += suma;
      cuentaTotal += valores.length;
    } else {
      preguntas[k] = null;
    }
  });

  const npsValores = filas.map((f) => f.nps_recomendaria).filter((v) => typeof v === 'number');
  const promedio_nps = npsValores.length
    ? Math.round((npsValores.reduce((a, b) => a + b, 0) / npsValores.length) * 10) / 10
    : null;
  const promedio_general = cuentaTotal ? Math.round((sumaTotal / cuentaTotal) * 100) / 100 : null;

  return { respuestas: n, promedio_general, promedio_nps, preguntas };
}

/** Correlación de Pearson entre dos arrays numéricos de igual longitud
 *  (ya emparejados, sin nulos). null si n < 3 (no tiene sentido con menos). */
export function correlacionPearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? null : Math.round((num / den) * 100) / 100;
}

/** Matriz de correlación de Pearson NxN sobre `claves` (nombres de campos
 *  presentes en cada fila de `filas`) -- cada celda usa solo los pares
 *  donde AMBAS variables tienen valor (por si algún registro viejo tuviera
 *  algo vacío). */
export function matrizCorrelacion(filas, claves) {
  return claves.map((claveA) =>
    claves.map((claveB) => {
      if (claveA === claveB) return 1;
      const pares = filas
        .map((f) => [f[claveA], f[claveB]])
        .filter(([a, b]) => typeof a === 'number' && typeof b === 'number');
      return correlacionPearson(pares.map((p) => p[0]), pares.map((p) => p[1]));
    })
  );
}

/** Intervalo de confianza 95% de Wilson para una proporción (ej. tasa de
 *  participación exitos/n) -- más confiable que el IC normal con n chico o
 *  p cerca de 0/1, que es exactamente el caso de este dataset. Devuelve
 *  fracciones (0-1), no porcentajes. */
export function icWilson(exitos, n) {
  if (!n) return null;
  const z = 1.96;
  const p = exitos / n;
  const denom = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / denom;
  const margen = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { bajo: Math.max(0, centro - margen), alto: Math.min(1, centro + margen) };
}
