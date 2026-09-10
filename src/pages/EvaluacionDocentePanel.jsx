import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PlotlyChart from '../components/PlotlyChart.jsx';
import { normalizar } from '../lib/normalizar.js';
import {
  actualizarEstudiantesActivos,
  calcularMetricasNPS,
  calcularPromedioClaves,
  calcularTasaRespuesta,
  CATEGORIAS_EVALUACION_DOCENTE,
  colorDeMes,
  fetchCrudoHistoricoEneroJulio,
  fetchEstudiantesActivosMapa,
  fetchGruposEvaluacionDocente,
  fetchGruposCombinadosEvalDocente,
  fetchDirectorioTutores,
  indexarDirectorioPorNombre,
  fetchCantEstListasPorGrupo,
  enviarAlertaCierre,
  fetchAlertasCierre,
  formatearFechaDDMMYYYY,
  fetchMesesActivosMapa,
  fetchMesesDisponibles,
  fetchStatsYCrudo,
  fetchUltimoSyncBaseGrupos,
  formatearHaceTiempo,
  icWilson,
  matrizCorrelacion,
  MES_HISTORICO_ENERO_JULIO,
  MESES_ES,
  NPS_2025_FIJO,
  PREGUNTAS_LIKERT_KEYS,
  RESPUESTAS_SATISFACCION_2026_FIJO,
  resumenDeFilas,
  sincronizarBaseGrupos,
  SATISFACCION_CONTENIDOS_2025_PROMEDIO,
  SATISFACCION_CONTENIDOS_2026_FIJO,
  SATISFACCION_DOCENTE_2025_PROMEDIO,
  SATISFACCION_DOCENTE_2026_FIJO,
  SATISFACCION_PLATAFORMA_2025_PROMEDIO,
  SATISFACCION_PLATAFORMA_2026_FIJO,
  slug,
  TABLA_NPS_2026_FIJA,
  togglearMesActivo,
} from '../lib/evaluacionDocente.js';

const VISTAS = { TABLA: 'tabla', ESTADISTICAS: 'estadisticas', RANKING: 'ranking' };

export default function EvaluacionDocentePanel() {
  const [vista, setVista] = useState(VISTAS.TABLA);
  const [meses, setMeses] = useState([]);
  const [activos, setActivos] = useState({});
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  // 2026-09-09, a pedido del usuario: "quiero que evaluacion docente tenga
  // el boton de activar o desactivar los datos de modulo 0 asi como lo
  // tenemos en la app de asistencia aprobacion" -- mismo criterio y mismo
  // default (excluido) que esModulo0 de esa app. Global: afecta Grupos,
  // Estadísticas y Ranking Docente a la vez.
  const [incluirModulo0, setIncluirModulo0] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [mesesData, activosData] = await Promise.all([fetchMesesDisponibles(), fetchMesesActivosMapa()]);
        // Orden CRONOLÓGICO (por índice en MESES_ES), no alfabético -- 2026-09-08,
        // bug reportado por el usuario: con .sort() por defecto "Octubre" queda
        // antes que "Septiembre" (O < S alfabéticamente). Mismo criterio que ya
        // usa mesesDisponiblesRanking_ en Ranking Docente.
        setMeses([...mesesData].sort((a, b) => MESES_ES.indexOf(a) - MESES_ES.indexOf(b)));
        setActivos(activosData);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  async function onToggle(mes) {
    const nuevoValor = !activos[mes];
    setActivos((prev) => ({ ...prev, [mes]: nuevoValor }));
    try {
      await togglearMesActivo(mes, nuevoValor);
    } catch (e) {
      setError(e.message || String(e));
      setActivos((prev) => ({ ...prev, [mes]: !nuevoValor }));
    }
  }

  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>;

  // El rail derecho (Evaluaciones activas + Links) solo se muestra en la
  // vista "Grupos" -- a pedido explícito del usuario 2026-09-01: no debe
  // aparecer en Estadísticas, y NO debe ser una pestaña nueva ("Panel"),
  // solo condicionarse a la vista actual dentro del mismo layout de siempre.
  const mostrarRailDerecho = vista === VISTAS.TABLA;

  return (
    <>
    <BarraSincronizacion />
    <BarraFiltrosGlobales incluirModulo0={incluirModulo0} onCambiarIncluirModulo0={setIncluirModulo0} />
    <div className={
      'grid grid-cols-1 gap-6 items-start ' +
      (mostrarRailDerecho ? 'lg:grid-cols-[48px_1fr_360px]' : 'lg:grid-cols-[48px_1fr]')
    }>
      {/* Orden en pantallas angostas: Nav -> switches/links -> contenido
          principal (que puede ser una tabla larga) -- así los switches
          nunca quedan escondidos abajo de todo al hacer scroll. En pantallas
          grandes (lg+) vuelve al orden Nav | Contenido | Rail derecho. */}
      <div className="order-1">
        <NavLateral vista={vista} onCambiarVista={setVista} />
      </div>

      {mostrarRailDerecho && (
        <div className="order-2 lg:order-3 space-y-6">
          <EvaluacionesActivas meses={meses} activos={activos} onToggle={onToggle} />
          <LinksPorCategoriaYMes meses={meses} />
        </div>
      )}

      <div className="order-3 lg:order-2 min-w-0">
        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>
        )}
        {vista === VISTAS.TABLA && <TablaGrupos meses={meses} activos={activos} incluirModulo0={incluirModulo0} />}
        {vista === VISTAS.ESTADISTICAS && <Estadisticas meses={meses} incluirModulo0={incluirModulo0} />}
        {vista === VISTAS.RANKING && <RankingDocente incluirModulo0={incluirModulo0} />}
      </div>
    </div>
    </>
  );
}

/** "Módulo 0" / "Módulo Cero" -- el módulo de inducción, no es una materia
 *  calificada real (aprobación/participación siempre atípica). Mismo
 *  criterio EXACTO (y mismo default: excluido) que ya usa
 *  APP_ASISTENCIA_APROBACION (esModulo0 en lib/asistenciaAprobacion.js),
 *  a pedido del usuario -- "asi como lo tenemos en la app de asistencia
 *  aprobacion". */
function esModulo0_(materia) {
  const s = (materia || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  return /^modulo\s*(0|cero)\b/.test(s);
}

/** Filtra Módulo 0 de un `crudo` (shape [{categoria_programa,
 *  mes_calificacion, filas}], ver fetchStatsYCrudo) -- quita de cada
 *  .filas las respuestas cuya .materia sea Módulo 0. Si incluirModulo0 es
 *  true, o no hay crudo todavía, lo devuelve tal cual (sin copiar). */
function filtrarCrudoModulo0_(crudo, incluirModulo0) {
  if (incluirModulo0 || !crudo) return crudo;
  return crudo.map((d) => ({ ...d, filas: (d.filas || []).filter((f) => !esModulo0_(f.materia)) }));
}

/** Barra de filtros globales (hoy solo Módulo 0, pero se deja el nombre
 *  genérico por si se suman más) -- visible en TODAS las vistas, mismo
 *  lugar/estilo que BarraSincronizacion. Reusa el componente Switch ya
 *  existente en este archivo (el mismo que usa EvaluacionesActivas). */
function BarraFiltrosGlobales({ incluirModulo0, onCambiarIncluirModulo0 }) {
  return (
    <div className="mb-6 bg-ink-900 border border-ink-700 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate-400 shrink-0">Filtros globales</span>
        <div className="flex items-center gap-2.5">
          <Switch activo={incluirModulo0} onClick={() => onCambiarIncluirModulo0(!incluirModulo0)} />
          <span className="text-sm text-slate-300">Incluir Módulo 0</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5">
        El módulo de inducción no es una materia calificada real -- aplica a Grupos, Estadísticas y Ranking Docente. Mismo criterio que ya usa la app de Asistencia/Aprobación.
      </p>
    </div>
  );
}

/** Botón de sincronización manual (2026-09-08, a pedido del usuario: "no
 *  tiene botones para actualizar o ejecutar los flujos... lo ideal es que
 *  también hayan botones que permitan actualizar la información de
 *  supabase"). Mismo patrón visual que PanelSincronizacion.jsx en
 *  APP_GRUPOS_ACTIVOS -- acá solo hay UNA fuente que vale la pena refrescar
 *  a demanda (doc_base_de_grupos, que normalmente espera hasta 3h por el
 *  trigger automático de n8n); doc_respuestas_consolidada no necesita botón
 *  porque los estudiantes escriben ahí directo, siempre está al día.
 *  Visible en TODAS las vistas (no solo "Grupos"), arriba del layout. */
function BarraSincronizacion() {
  const [ultimoSync, setUltimoSync] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState(null);

  async function recargarUltimoSync() {
    try {
      setUltimoSync(await fetchUltimoSyncBaseGrupos());
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  useEffect(() => {
    recargarUltimoSync();
  }, []);

  async function onClickSync() {
    setError(null);
    setSincronizando(true);
    try {
      await sincronizarBaseGrupos();
      await recargarUltimoSync();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="mb-6 bg-ink-900 border border-ink-700 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate-400 shrink-0">Sincronización manual</span>
        <button
          type="button"
          disabled={sincronizando}
          onClick={onClickSync}
          className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-ink-700 hover:border-ink-500 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {sincronizando ? <IconoSpinner /> : <IconoSync />}
          <span>Actualizar datos de grupos</span>
          <span className="text-slate-500">· {ultimoSync !== null ? formatearHaceTiempo(ultimoSync) : '…'}</span>
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5">
        Trae de nuevo la hoja "ENCUESTAS DE SATISFACCION" (Consolidado + Rutas, se actualiza sola cada 1h) a Supabase, en vez de esperar hasta 3h al trigger automático. Las respuestas de estudiantes ya se guardan al instante, no necesitan este botón.
      </p>
      {error && (
        <div className="mt-2 text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-1.5">
          {error}
        </div>
      )}
    </div>
  );
}

function IconoSync() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 shrink-0">
      <path
        d="M16 4v4h-4M4 16v-4h4M4.5 8a5.5 5.5 0 0 1 9.4-3.5L16 6M15.5 12a5.5 5.5 0 0 1-9.4 3.5L4 14"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoSpinner() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 shrink-0 animate-spin">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.25" />
      <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** 2026-09-09, a pedido del usuario: "el panel izquierdo que sea como un
 *  simbolo de hamburguesa que cuando pasas por el lado muestra el panel
 *  pero si quitas el mouse desaparece, como en opera gx". En pantallas
 *  angostas (sin hover real, dispositivos táctiles) se mantiene la fila
 *  horizontal simple de siempre, sin nada de esto -- el hover-rail es
 *  SOLO para lg+ (desktop). En desktop: un rail angosto (solo íconos)
 *  siempre visible reserva el espacio real en el layout; al pasar el mouse
 *  por encima aparece un panel FLOTANTE (position:absolute, no empuja el
 *  contenido) con íconos + etiquetas, superpuesto sobre lo que haya al
 *  lado -- exactamente el comportamiento del sidebar de Opera GX. */
function NavLateral({ vista, onCambiarVista }) {
  const [expandido, setExpandido] = useState(false);
  const items = [
    { id: VISTAS.TABLA, label: 'Grupos', icono: '☰' },
    { id: VISTAS.ESTADISTICAS, label: 'Estadísticas', icono: '📊' },
    { id: VISTAS.RANKING, label: 'Ranking Docente', icono: '🏅' },
  ];

  function boton(item, compacto) {
    const activo = vista === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onCambiarVista(item.id)}
        title={compacto ? item.label : undefined}
        className={
          'flex items-center gap-2 text-sm rounded-md transition-colors border ' +
          (compacto ? 'justify-center w-10 h-10 shrink-0' : 'px-3 py-2 text-left') +
          ' ' +
          (activo
            ? 'bg-accent-500/15 border-accent-500 text-accent-300'
            : 'bg-ink-900 border-ink-700 text-slate-300 hover:bg-ink-800')
        }
      >
        <span>{item.icono}</span>
        {!compacto && <span>{item.label}</span>}
      </button>
    );
  }

  return (
    <>
      {/* Móvil/tablet: fila horizontal de siempre, sin hover (no aplica en táctil). */}
      <nav className="flex lg:hidden gap-2">{items.map((item) => boton(item, false))}</nav>

      {/* Desktop: rail angosto + panel flotante al hacer hover. */}
      <div
        className="hidden lg:block relative"
        onMouseEnter={() => setExpandido(true)}
        onMouseLeave={() => setExpandido(false)}
      >
        <nav className="flex flex-col gap-2 w-10">{items.map((item) => boton(item, true))}</nav>

        <nav
          className={
            'absolute top-0 left-0 z-30 flex flex-col gap-2 w-52 bg-ink-950 border border-ink-700 rounded-lg p-2 shadow-2xl transition-all duration-150 ease-out ' +
            (expandido ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-1 pointer-events-none')
          }
        >
          {items.map((item) => boton(item, false))}
        </nav>
      </div>
    </>
  );
}

/* ============================================================================
 *  Tabla de Grupos — 2026-09-09, a pedido del usuario: "una tabla un poco
 *  mas similar como la de la app de asistencia separadas y con acordeones
 *  para sintetizar la informacion tanto en las columnas como lo demas".
 *  Mismo patrón que AsistenciaAprobacionPanel.jsx (SeccionesCarrera /
 *  TablaCarrera / GRUPOS_COL de esa app): una tabla POR categoría de
 *  programa, cada una colapsable desde su propio header de color; dentro de
 *  cada tabla, las columnas se agrupan por tema en "acordeones de columnas"
 *  (chip arriba + header clickeable) que se pliegan a una sola columna "···"
 *  cuando no interesan. Colores de columnas reusan la misma paleta que ya
 *  usa esa app (#94a3b8/#a78bfa/#38bdf8/#34d399) a propósito, para que se
 *  sienta como el mismo lenguaje visual entre apps hermanas.
 * ==========================================================================*/

const COLDEF_GRUPOS = {
  id_grupo_mapeo: { t: 'ID Grupo (Mapeo)' },
  materia: { t: 'Materia', wide: true },
  mes_calificacion: { t: 'Mes', center: true },
  horario: { t: 'Horario', center: true },
  fecha_calendario_inicio: { t: 'Inicio', center: true, fmt: formatearFechaDDMMYYYY },
  fecha_calendario_fin: { t: 'Fin', center: true, fmt: formatearFechaDDMMYYYY },
  group_id: { t: 'Group ID', mono: true },
  section_id: { t: 'Section ID', mono: true },
  tutor_calendario: { t: 'Tutor Calendario', wide: true },
  cupos_activos: { t: 'Cupos Activos', center: true },
  cantidad_estudiantes_listas: { t: 'Cant. est. listas', center: true },
  asistentes_min_1_sesion: { t: 'Asist. ≥1', center: true },
  respuestas: { t: 'Respuestas', center: true },
  estado_materia: { t: 'Estado', center: true },
  alerta_cierre: { t: '', center: true },
};

const GRUPOS_COL_DEF = [
  { id: 'ident', label: 'Identificación', color: '#94a3b8', cols: ['id_grupo_mapeo', 'materia', 'mes_calificacion'] },
  { id: 'acad', label: 'Detalle académico', color: '#a78bfa', cols: ['horario', 'fecha_calendario_inicio', 'fecha_calendario_fin', 'group_id', 'section_id'] },
  { id: 'docente', label: 'Docente', color: '#38bdf8', cols: ['tutor_calendario'] },
  { id: 'cupos', label: 'Seguimiento', color: '#34d399', cols: ['cupos_activos', 'cantidad_estudiantes_listas', 'asistentes_min_1_sesion', 'respuestas', 'estado_materia', 'alerta_cierre'] },
];

/** Fecha de HOY en zona horaria Bogotá, como 'YYYY-MM-DD' (America/Bogota,
 *  UTC-5, sin horario de verano). */
function hoyBogota_() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Estado de una materia según sus fechas de calendario (2026-09-10, a
 *  pedido del usuario): EN CURSO mientras hoy (Bogotá) esté DENTRO de
 *  [fecha_calendario_inicio, fecha_calendario_fin] inclusive; si hoy ya
 *  pasó la fecha fin -> CERRÓ; si aún no llega a la de inicio -> POR
 *  INICIAR. Las fechas son `date` de Postgres ('YYYY-MM-DD'), así que
 *  comparar como texto ya es cronológico. null si no hay fecha fin. */
function estadoMateria_(inicio, fin) {
  const i = String(inicio || '').slice(0, 10);
  const f = String(fin || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
  const hoy = hoyBogota_();
  if (/^\d{4}-\d{2}-\d{2}$/.test(i) && hoy < i) return 'por_iniciar';
  if (hoy > f) return 'cerro';
  return 'en_curso';
}

const ESTADO_MATERIA_META = {
  por_iniciar: { txt: 'Por iniciar', color: '#94a3b8' },
  en_curso: { txt: 'En curso', color: '#38bdf8' },
  cerro: { txt: 'Cerró', color: '#f59e0b' },
};

/** Clave para cruzar un grupo de `doc_base_de_grupos` con el conteo de
 *  respuestas de `doc_respuestas_consolidada` -- 2026-09-10, a pedido del
 *  usuario: "al lado derecho de cupos ... cuantas respuestas tenemos de esa
 *  materia segun las bases de datos". Se cruza por (categoria_programa +
 *  mes_calificacion + materia) normalizado (sin tildes, minúsculas, espacios
 *  colapsados) -- así Septiembre matchea 100% (387/387). En meses viejos
 *  (Agosto) el nombre de la materia en las respuestas quedó distinto del que
 *  hoy tiene la base, así que ahí puede quedar corto -- es deriva de datos
 *  histórica, no un bug del cruce. */
function claveRespuestas_(categoria, mes, materia) {
  return normalizar(categoria) + '|' + normalizar(mes) + '|' + normalizar(materia);
}

const GRUPOS_COL_ABIERTOS_INICIAL = new Set(['ident', 'docente', 'cupos']); // "acad" arranca plegado (es la más ancha)

function celdaGrupo_(f, key) {
  const def = COLDEF_GRUPOS[key];
  const v = f[key];
  if (v == null || v === '') return '—';
  return def.fmt ? def.fmt(v) : String(v);
}

/** true si cada palabra de la consulta aparece (como subcadena) en el texto
 *  normalizado -- permite "mate fin" -> "Matemática Financiera". Mismo
 *  criterio que coincideBusqueda() de AsistenciaAprobacionPanel.jsx. */
function coincideBusquedaGrupos_(texto, consulta) {
  const q = normalizar(consulta);
  if (!q) return true;
  const base = normalizar(texto || '');
  return q.split(/\s+/).every((tok) => base.includes(tok));
}

function TablaGrupos({ meses, activos, incluirModulo0 }) {
  const [filasRaw, setFilasRaw] = useState([]);
  const [crudo, setCrudo] = useState([]); // respuestas crudas, para contar por materia
  const [combos, setCombos] = useState([]);
  const [mapaListas, setMapaListas] = useState(() => new Map()); // group_id -> cant. est. en la lista (asap_seguimiento_grupo)
  const [dirIdx, setDirIdx] = useState(null); // índice del directorio de docentes (tooltip de contacto)
  const [alertas, setAlertas] = useState([]); // doc_alertas_cierre (historial)
  const [alertaEnviando, setAlertaEnviando] = useState(null); // group_id en curso
  const [alertaMsg, setAlertaMsg] = useState(null); // { tipo, texto }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mesesElegidos, setMesesElegidos] = useState(() => new Set(meses.filter((m) => activos[m])));
  const [gruposCol, setGruposCol] = useState(GRUPOS_COL_ABIERTOS_INICIAL);
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(() => new Set(CATEGORIAS_EVALUACION_DOCENTE));
  // Filtros globales que aplican a TODAS las tablas de categoría a la vez
  // (2026-09-10, a pedido del usuario — solo en la vista Grupos por ahora).
  // Se suman con AND a los filtros que ya tiene cada tabla por separado.
  const [gMateria, setGMateria] = useState('');
  const [gDocente, setGDocente] = useState('');
  const [gCategorias, setGCategorias] = useState(() => new Set()); // vacío = todas
  const [gCuatris, setGCuatris] = useState(() => new Set());       // vacío = todos

  useEffect(() => {
    (async () => {
      try {
        const [g, c, dir, sc, ml, al] = await Promise.all([
          fetchGruposEvaluacionDocente(),
          fetchGruposCombinadosEvalDocente().catch(() => []),
          fetchDirectorioTutores().catch(() => []),
          fetchStatsYCrudo().then((r) => r.crudo || []).catch(() => []),
          fetchCantEstListasPorGrupo().catch(() => new Map()),
          fetchAlertasCierre().catch(() => []),
        ]);
        setFilasRaw(g);
        setCombos(c);
        setDirIdx(indexarDirectorioPorNombre(dir));
        setCrudo(sc);
        setMapaListas(ml);
        setAlertas(al);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  // group_id -> estado de la última alerta ('enviado' | 'registrada' | 'error').
  const alertasPorGrupo = useMemo(() => {
    const m = new Map();
    // alertas viene ordenado por creado_en desc -> la primera que se ve de
    // cada grupo es la más reciente.
    alertas.forEach((a) => { if (!m.has(a.group_id)) m.set(a.group_id, a.estado); });
    return m;
  }, [alertas]);

  async function onEnviarAlerta(f, correo) {
    setAlertaEnviando(f.group_id);
    setAlertaMsg(null);
    try {
      await enviarAlertaCierre({
        group_id: f.group_id,
        id_grupo_mapeo: f.id_grupo_mapeo,
        categoria_programa: f.categoria_programa,
        mes_calificacion: f.mes_calificacion,
        materia: f.materia,
        tutor_calendario: f.tutor_calendario,
        destinatario: correo || null,
      });
      const frescas = await fetchAlertasCierre().catch(() => alertas);
      setAlertas(frescas);
      setAlertaMsg({ tipo: 'ok', texto: `Alerta registrada para ${f.materia}${correo ? ' — correo a ' + correo : ''}.` });
    } catch (e) {
      setAlertaMsg({ tipo: 'error', texto: 'No se pudo enviar la alerta: ' + (e.message || e) });
    } finally {
      setAlertaEnviando(null);
    }
  }

  // conteo de respuestas por (categoria + mes + materia) normalizado.
  const mapaRespuestas = useMemo(() => {
    const m = {};
    (crudo || []).forEach((grupo) => {
      (grupo.filas || []).forEach((fila) => {
        const k = claveRespuestas_(grupo.categoria_programa, grupo.mes_calificacion, fila.materia);
        m[k] = (m[k] || 0) + 1;
      });
    });
    return m;
  }, [crudo]);

  // cada grupo lleva pegado su `respuestas` (nº de evaluaciones de esa
  // materia en su misma categoría+mes); 0 si todavía no hay ninguna.
  const filas = useMemo(
    () =>
      filasRaw.map((f) => ({
        ...f,
        respuestas: mapaRespuestas[claveRespuestas_(f.categoria_programa, f.mes_calificacion, f.materia)] || 0,
        cantidad_estudiantes_listas: mapaListas.get(f.group_id)?.cant ?? null,
        asistentes_min_1_sesion: mapaListas.get(f.group_id)?.asis ?? null,
        estado_materia: estadoMateria_(f.fecha_calendario_inicio, f.fecha_calendario_fin),
      })),
    [filasRaw, mapaRespuestas, mapaListas]
  );

  function toggleEnSet(set, setSet, valor) {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(valor)) next.delete(valor);
      else next.add(valor);
      return next;
    });
  }
  const toggleGrupoCol = (id) => toggleEnSet(gruposCol, setGruposCol, id);
  const toggleCategoria = (c) => toggleEnSet(categoriasAbiertas, setCategoriasAbiertas, c);

  // group_ids que están dentro de una combinación activa "+ Eval Docente"
  const enCombo = useMemo(
    () => new Set(combos.flatMap((c) => c.member_group_ids || [])),
    [combos]
  );

  const cuatrimestresDisponibles = useMemo(
    () => Array.from(new Set(filasRaw.map((f) => String(f.cuatrimestre || '').trim()).filter(Boolean))).sort(),
    [filasRaw]
  );

  const pasaGlobales = (f) =>
    (!gMateria || coincideBusquedaGrupos_(f.materia, gMateria)) &&
    (!gDocente || coincideBusquedaGrupos_(f.tutor_calendario, gDocente)) &&
    (!gCategorias.size || gCategorias.has(f.categoria_programa)) &&
    (!gCuatris.size || gCuatris.has(String(f.cuatrimestre || '').trim()));

  const hayFiltroGlobal = !!(gMateria || gDocente || gCategorias.size || gCuatris.size);

  const filasFiltradas = useMemo(
    () =>
      filas.filter(
        (f) =>
          (!mesesElegidos.size || mesesElegidos.has(f.mes_calificacion)) &&
          (incluirModulo0 || !esModulo0_(f.materia)) &&
          pasaGlobales(f)
      ),
    [filas, mesesElegidos, incluirModulo0, gMateria, gDocente, gCategorias, gCuatris]
  );

  const porCategoria = useMemo(() => {
    const m = {};
    CATEGORIAS_EVALUACION_DOCENTE.forEach((c) => (m[c] = []));
    filasFiltradas
      .filter((f) => !enCombo.has(f.group_id)) // los combinados van a su sección
      .forEach((f) => (m[f.categoria_programa] || (m[f.categoria_programa] = [])).push(f));
    return m;
  }, [filasFiltradas, enCombo]);

  // combos visibles según el filtro de meses (con sus filas miembro resueltas)
  const combosVisibles = useMemo(() => {
    return combos
      .filter((c) => !mesesElegidos.size || mesesElegidos.has(c.mes_calificacion))
      .map((c) => ({
        ...c,
        miembros: (c.member_group_ids || [])
          .map((gid) => filas.find((f) => f.group_id === gid))
          .filter(Boolean),
      }))
      .filter((c) => c.miembros.length > 0)
      .filter((c) => incluirModulo0 || !c.miembros.some((m) => esModulo0_(m.materia)))
      .filter((c) => !hayFiltroGlobal || c.miembros.some((m) => pasaGlobales(m)));
  }, [combos, filas, mesesElegidos, incluirModulo0, gMateria, gDocente, gCategorias, gCuatris]);

  return (
    <section className="space-y-4">
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Grupos con evaluación docente</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filasFiltradas.length} de {filas.length} grupo(s)</p>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-1.5">Mes de calificación</p>
          <div className="flex flex-wrap gap-1.5">
            {meses.map((mes) => (
              <ChipFiltro
                key={mes}
                activo={mesesElegidos.has(mes)}
                color={colorDeMes(mes)}
                onClick={() => toggleEnSet(mesesElegidos, setMesesElegidos, mes)}
              >
                {mes}{activos[mes] && ' ●'}
              </ChipFiltro>
            ))}
          </div>
        </div>

        {/* Filtros globales — aplican a todas las tablas de categoría a la vez */}
        <div className="pt-1 border-t border-ink-800/70 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Filtros globales</span>
            {hayFiltroGlobal && (
              <button
                type="button"
                onClick={() => { setGMateria(''); setGDocente(''); setGCategorias(new Set()); setGCuatris(new Set()); }}
                className="text-[11px] text-accent-300 hover:text-accent-200"
              >
                limpiar
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
            <label className="block">
              <span className="text-[11px] text-slate-500">Materia</span>
              <input
                type="text"
                value={gMateria}
                onChange={(e) => setGMateria(e.target.value)}
                placeholder="filtrar por materia…"
                className="mt-0.5 w-full bg-ink-800 border border-ink-600 rounded-md px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">Docente</span>
              <input
                type="text"
                value={gDocente}
                onChange={(e) => setGDocente(e.target.value)}
                placeholder="filtrar por docente…"
                className="mt-0.5 w-full bg-ink-800 border border-ink-600 rounded-md px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </label>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">Carrera</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIAS_EVALUACION_DOCENTE.map((c) => (
                <ChipFiltro
                  key={c}
                  activo={gCategorias.has(c)}
                  color={COLOR_CATEGORIA[c]}
                  onClick={() => toggleEnSet(gCategorias, setGCategorias, c)}
                >
                  {c}
                </ChipFiltro>
              ))}
            </div>
          </div>
          {cuatrimestresDisponibles.length > 0 && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1">Cuatrimestre</p>
              <div className="flex flex-wrap gap-1.5">
                {cuatrimestresDisponibles.map((q) => (
                  <ChipFiltro
                    key={q}
                    activo={gCuatris.has(q)}
                    onClick={() => toggleEnSet(gCuatris, setGCuatris, q)}
                  >
                    {q}
                  </ChipFiltro>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 mr-1">Columnas:</span>
          {GRUPOS_COL_DEF.map((g) => {
            const abierto = gruposCol.has(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGrupoCol(g.id)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition-all border"
                style={{
                  color: abierto ? g.color : g.color + 'B3',
                  backgroundColor: abierto ? g.color + '29' : 'transparent',
                  borderColor: g.color + (abierto ? '80' : '4D'),
                }}
                title={abierto ? 'Plegar columnas' : 'Desplegar columnas'}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color, opacity: abierto ? 1 : 0.4 }} />
                {g.label}
                <span className="opacity-60 font-normal">{abierto ? '−' : `+${g.cols.length}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>}
      {alertaMsg && (
        <div
          className={
            'text-sm rounded-md px-3 py-2 border ' +
            (alertaMsg.tipo === 'ok'
              ? 'text-emerald-300 bg-emerald-950/40 border-emerald-900'
              : 'text-red-300 bg-red-950/40 border-red-900')
          }
        >
          {alertaMsg.texto}
        </div>
      )}
      {cargando ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {CATEGORIAS_EVALUACION_DOCENTE.map((categoria) => (
            <TablaCategoriaGrupos
              key={categoria}
              categoria={categoria}
              grupos={porCategoria[categoria] || []}
              abierta={categoriasAbiertas.has(categoria)}
              onToggle={() => toggleCategoria(categoria)}
              gruposCol={gruposCol}
              onToggleGrupoCol={toggleGrupoCol}
              dirIdx={dirIdx}
              alertasPorGrupo={alertasPorGrupo}
              alertaEnviando={alertaEnviando}
              onEnviarAlerta={onEnviarAlerta}
            />
          ))}
          {combosVisibles.length > 0 && (
            <SeccionCombinadosEvalDocente combos={combosVisibles} gruposCol={gruposCol} onToggleGrupoCol={toggleGrupoCol} dirIdx={dirIdx} />
          )}
          <RegistroAlertasCierre alertas={alertas} />
        </div>
      )}
    </section>
  );
}

/* ==========================================================================
 *  "GRUPOS COMBINADOS" — se combinan desde la app de Asistencia y Aprobación
 *  (tabla compartida `grupos_combinados`, opción "+ Evaluación Docente").
 *  Acá es solo lectura: aparecen juntos para que las dos apps concuerden.
 *  La tasa de participación NO se toca: cada carrera mantiene sus cupos
 *  (decisión del usuario 2026-09-10 — los estudiantes siguen matriculados
 *  en su carrera aunque compartan aula).
 * ======================================================================== */
const COMB_COLOR_ED = '#c084fc';

// Columnas cuyo valor es propio de cada grupo miembro (una celda por fila);
// el resto se combina con rowSpan (es igual para toda la combinación).
const COMB_ED_POR_MIEMBRO = new Set(['id_grupo_mapeo', 'group_id', 'section_id', 'cupos_activos', 'cantidad_estudiantes_listas', 'asistentes_min_1_sesion', 'respuestas', 'estado_materia', 'alerta_cierre']);

/** Botón "copiar" con feedback "✓ copiado". */
function BotonCopiar({ valor, label }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(String(valor));
        } catch {
          const ta = document.createElement('textarea');
          ta.value = String(valor);
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch { /* nada */ }
          ta.remove();
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
      className={
        'shrink-0 text-[10px] px-1.5 py-0.5 rounded border transition-colors ' +
        (copiado ? 'border-emerald-700 text-emerald-300' : 'border-ink-600 text-slate-400 hover:text-sky-300 hover:border-sky-700')
      }
      title={`Copiar ${label}`}
    >
      {copiado ? '✓ copiado' : 'copiar'}
    </button>
  );
}

/** Nombre del docente con tarjeta de contacto INTERACTIVA (se puede entrar
 *  con el mouse para seleccionar el texto o usar "copiar"). Cierra con
 *  retardo. Portal a document.body + posición fija. */
function TooltipDocente({ nombre, dir }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const cerrarTimer = useRef(null);
  useEffect(() => () => cerrarTimer.current && clearTimeout(cerrarTimer.current), []);
  if (!nombre) return '—';
  const t = dir?.porNombre?.get(normalizar(nombre)) || null;
  if (!t) return nombre;

  const cancelarCierre = () => {
    if (cerrarTimer.current) {
      clearTimeout(cerrarTimer.current);
      cerrarTimer.current = null;
    }
  };
  const abrir = (e) => {
    cancelarCierre();
    const r = e.currentTarget.getBoundingClientRect();
    const ancho = 280;
    let x = r.left;
    if (x + ancho > window.innerWidth - 8) x = window.innerWidth - ancho - 8;
    setPos({ x: Math.max(8, x), y: r.bottom + 4 });
    setAbierto(true);
  };
  const cerrarPronto = () => {
    cancelarCierre();
    cerrarTimer.current = setTimeout(() => setAbierto(false), 200);
  };

  return (
    <>
      <span
        className="underline decoration-dotted decoration-slate-500 underline-offset-2 cursor-help"
        onMouseEnter={abrir}
        onMouseLeave={cerrarPronto}
      >
        {nombre}
      </span>
      {abierto &&
        createPortal(
          <div
            className="fixed z-[999] rounded-lg border border-ink-500 bg-ink-900 shadow-2xl px-3 py-2.5 text-xs select-text"
            style={{ left: pos.x, top: pos.y, width: 280 }}
            onMouseEnter={cancelarCierre}
            onMouseLeave={cerrarPronto}
          >
            <div className="font-semibold text-slate-100 leading-tight mb-1.5">{t.docente || t.nombres_completos || nombre}</div>
            {t.celular && (
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-200">📱 <span className="select-all">{t.celular}</span></span>
                <BotonCopiar valor={t.celular} label="celular" />
              </div>
            )}
            {t.correo_institucional && (
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-200 break-all">✉ <span className="select-all">{t.correo_institucional}</span></span>
                <BotonCopiar valor={t.correo_institucional} label="correo" />
              </div>
            )}
            {!t.celular && !t.correo_institucional && <div className="text-slate-500">Sin datos de contacto en el directorio.</div>}
            {t.docente_activo === false && <div className="mt-1 text-[10px] text-slate-500">docente inactivo</div>}
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * "GRUPOS COMBINADOS" en Evaluación Docente. Reusa las MISMAS columnas y los
 * MISMOS acordeones que la tabla de Grupos (GRUPOS_COL_DEF / COLDEF_GRUPOS /
 * TheadGruposCategoria, estado `gruposCol` compartido). Una fila por grupo
 * miembro; las celdas iguales para toda la combinación van con rowSpan.
 * Solo lectura: se combina/desagrupa desde la app de Asistencia y Aprobación.
 */
function SeccionCombinadosEvalDocente({ combos, gruposCol, onToggleGrupoCol, dirIdx }) {
  const totalCols = GRUPOS_COL_DEF.reduce((a, g) => a + (gruposCol.has(g.id) ? g.cols.length : 1), 0);
  return (
    <section className="rounded-2xl overflow-hidden border" style={{ borderColor: COMB_COLOR_ED + '66' }}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-l-4" style={{ borderColor: COMB_COLOR_ED, backgroundColor: COMB_COLOR_ED + '24' }}>
        <span className="text-base font-extrabold uppercase tracking-[0.14em]" style={{ color: COMB_COLOR_ED }}>⧉ Grupos combinados</span>
        <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ color: COMB_COLOR_ED, backgroundColor: COMB_COLOR_ED + '2E' }}>
          {combos.length}
        </span>
        <span className="text-[11px] text-slate-500 ml-2">Se combinan desde la app de Asistencia y Aprobación. Se cuentan como una unidad (1 materia).</span>
      </div>
      <div className="overflow-x-auto bg-ink-900">
        <table className="w-full text-xs border-collapse whitespace-nowrap">
          <TheadGruposCategoria gruposCol={gruposCol} onToggleGrupoCol={onToggleGrupoCol} />
          {combos.map((c) => (
            <FilasComboCombinadoED key={c.id} c={c} gruposCol={gruposCol} onToggleGrupoCol={onToggleGrupoCol} totalCols={totalCols} dirIdx={dirIdx} />
          ))}
        </table>
      </div>
    </section>
  );
}

function FilasComboCombinadoED({ c, gruposCol, onToggleGrupoCol, totalCols, dirIdx }) {
  const ms = c.miembros || [];
  const m0 = ms[0] || {};
  const n = ms.length || 1;
  const suma = ms.reduce((a, m) => a + (Number(m.cupos_activos) || 0), 0);
  // valores para las celdas combinadas
  const merged = {
    materia: c.subject_name || m0.materia || '',
    mes_calificacion: c.mes_calificacion || m0.mes_calificacion || '',
    horario: c.horario || m0.horario || '',
    fecha_calendario_inicio: m0.fecha_calendario_inicio || '',
    fecha_calendario_fin: m0.fecha_calendario_fin || '',
    tutor_calendario: c.tutor_calendario || m0.tutor_calendario || '',
    // los grupos combinados comparten una sola lista → cant. est. listas es la misma
    cantidad_estudiantes_listas: m0.cantidad_estudiantes_listas ?? null,
  };

  return (
    <tbody>
      {ms.map((m, i) => (
        <tr key={m.group_id} className="border-t border-ink-800 hover:bg-ink-850/40">
          {GRUPOS_COL_DEF.map((g) => {
            const abierto = gruposCol.has(g.id);
            if (!abierto) {
              if (i !== 0) return null;
              return (
                <td
                  key={g.id}
                  onClick={() => onToggleGrupoCol(g.id)}
                  rowSpan={n}
                  className="px-2 py-2 text-center text-slate-600 cursor-pointer hover:text-slate-300 align-top"
                  style={{ borderLeft: `2px solid ${g.color}66`, backgroundColor: g.color + '0A' }}
                  title={'Desplegar ' + g.label}
                >
                  ···
                </td>
              );
            }
            return g.cols.map((key, j) => {
              const def = COLDEF_GRUPOS[key];
              const perMiembro = COMB_ED_POR_MIEMBRO.has(key);
              if (!perMiembro && i !== 0) return null;
              const style = j === 0 ? { borderLeft: `2px solid ${g.color}4D` } : {};
              if (!perMiembro) style.backgroundColor = 'rgba(148,163,184,0.06)';

              let contenido;
              if (key === 'mes_calificacion') {
                contenido = (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorDeMes(merged.mes_calificacion) }} />
                    {merged.mes_calificacion || '—'}
                  </span>
                );
              } else if (key === 'tutor_calendario') {
                contenido = <TooltipDocente nombre={merged.tutor_calendario} dir={dirIdx} />;
              } else if (key === 'estado_materia') {
                contenido = <PillEstadoMateria estado={m.estado_materia} />;
              } else if (key === 'alerta_cierre') {
                contenido = <span className="text-slate-700">·</span>;
              } else if (perMiembro) {
                contenido = celdaGrupo_(m, key);
              } else {
                contenido = celdaGrupo_(merged, key);
              }

              return (
                <td
                  key={key}
                  rowSpan={perMiembro ? undefined : n}
                  className={'px-3 py-2 align-top ' + (def.center ? 'text-center ' : '') + (def.mono ? 'font-mono text-[11px] text-slate-400 ' : 'text-slate-300 ')}
                  style={style}
                >
                  {contenido}
                </td>
              );
            });
          })}
        </tr>
      ))}
      <tr className="border-t border-ink-800/60">
        <td colSpan={totalCols} className="px-3 py-1.5 text-right text-[11px] text-slate-500">
          {c.etiqueta} · <span style={{ color: COMB_COLOR_ED }} className="font-semibold">cupos combinados: {suma}</span>
        </td>
      </tr>
    </tbody>
  );
}

function TablaCategoriaGrupos({ categoria, grupos, abierta, onToggle, gruposCol, onToggleGrupoCol, dirIdx, alertasPorGrupo, alertaEnviando, onEnviarAlerta }) {
  const color = COLOR_CATEGORIA[categoria] || '#5b7fff';
  const [fMateria, setFMateria] = useState('');
  const [fTutor, setFTutor] = useState('');

  const gruposFiltrados = useMemo(
    () => grupos.filter((g) => coincideBusquedaGrupos_(g.materia, fMateria) && coincideBusquedaGrupos_(g.tutor_calendario, fTutor)),
    [grupos, fMateria, fTutor]
  );
  const filtrando = !!(fMateria || fTutor);
  const cuposTotales = useMemo(
    () => gruposFiltrados.reduce((a, g) => a + (Number(g.cupos_activos) || 0), 0),
    [gruposFiltrados]
  );
  // total de respuestas dedup por materia (varios grupos comparten materia y
  // muestran el MISMO conteo -- no se debe sumar la misma materia dos veces).
  const respuestasTotales = useMemo(() => {
    const vistas = new Set();
    let t = 0;
    gruposFiltrados.forEach((g) => {
      const k = claveRespuestas_(g.categoria_programa, g.mes_calificacion, g.materia);
      if (vistas.has(k)) return;
      vistas.add(k);
      t += Number(g.respuestas) || 0;
    });
    return t;
  }, [gruposFiltrados]);
  const totalCols = GRUPOS_COL_DEF.reduce((acc, g) => acc + (gruposCol.has(g.id) ? g.cols.length : 1), 0);

  return (
    <section className="rounded-2xl overflow-hidden border" style={{ borderColor: color + '59' }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 border-l-4 transition-colors"
        style={{ borderColor: color, backgroundColor: color + '1F' }}
      >
        <span className={'text-lg leading-none transition-transform ' + (abierta ? 'rotate-90' : '')} style={{ color }}>▸</span>
        <span className="text-base font-extrabold uppercase tracking-[0.14em]" style={{ color }}>{categoria}</span>
        <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ color, backgroundColor: color + '2E' }}>
          {filtrando ? `${gruposFiltrados.length} de ${grupos.length}` : `${grupos.length} grupos`}
        </span>
        <span className="ml-auto flex items-center gap-4 text-xs text-slate-400">
          <span>
            <span className="text-slate-500">Cupos activos </span>
            <span className="font-semibold text-slate-200">{cuposTotales}</span>
          </span>
          <span>
            <span className="text-slate-500">Respuestas </span>
            <span className="font-semibold text-slate-200">{respuestasTotales}</span>
          </span>
        </span>
      </button>

      {abierta && (
        <>
          <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-t border-ink-800 bg-ink-900">
            <FiltroTextoGrupos label="Materia" valor={fMateria} onChange={setFMateria} color={color} />
            <FiltroTextoGrupos label="Tutor" valor={fTutor} onChange={setFTutor} color={color} />
            {filtrando && (
              <button
                type="button"
                onClick={() => { setFMateria(''); setFTutor(''); }}
                className="text-[11px] text-slate-400 hover:text-slate-100 border border-ink-600 rounded-md px-2 py-1 hover:bg-ink-800"
              >
                limpiar filtros
              </button>
            )}
          </div>

          <div className="overflow-x-auto bg-ink-900">
            <table className="w-full text-xs border-collapse whitespace-nowrap">
              <TheadGruposCategoria gruposCol={gruposCol} onToggleGrupoCol={onToggleGrupoCol} />
              <tbody>
                {gruposFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} className="px-5 py-6 text-slate-500">
                      {grupos.length === 0 ? 'Sin grupos en esta categoría.' : 'Ningún grupo coincide con el filtro.'}
                    </td>
                  </tr>
                ) : (
                  gruposFiltrados.map((f) => (
                    <FilaGrupoCategoria
                      key={f.group_id}
                      f={f}
                      gruposCol={gruposCol}
                      onToggleGrupoCol={onToggleGrupoCol}
                      dirIdx={dirIdx}
                      alertasPorGrupo={alertasPorGrupo}
                      alertaEnviando={alertaEnviando}
                      onEnviarAlerta={onEnviarAlerta}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** Input de filtro de texto libre (sin desplegable): filtra a medida que se
 *  escribe. Mismo componente que FiltroTabla de AsistenciaAprobacionPanel.jsx,
 *  renombrado acá para no chocar si algún día se comparte un lib de UI. */
function FiltroTextoGrupos({ label, valor, onChange, color }) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="relative">
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="escribe para filtrar…"
          className="w-52 bg-ink-800 border border-ink-600 rounded-md pl-2.5 pr-6 py-1 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1"
          style={{ '--tw-ring-color': color }}
        />
        {valor && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-ink-700"
          >
            ×
          </button>
        )}
      </span>
    </label>
  );
}

function TheadGruposCategoria({ gruposCol, onToggleGrupoCol }) {
  return (
    <thead>
      {/* Fila 1 — headers de los acordeones de columnas, cada uno con su color */}
      <tr>
        {GRUPOS_COL_DEF.map((g) => {
          const abierto = gruposCol.has(g.id);
          return (
            <th
              key={g.id}
              colSpan={abierto ? g.cols.length : 1}
              className="px-3 py-2 text-left align-bottom border-b-2"
              style={{ backgroundColor: g.color + (abierto ? '24' : '12'), borderColor: g.color }}
            >
              <button
                type="button"
                onClick={() => onToggleGrupoCol(g.id)}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-opacity hover:opacity-80"
                style={{ color: g.color }}
                title={abierto ? 'Plegar' : 'Desplegar'}
              >
                <span className={'transition-transform ' + (abierto ? 'rotate-90' : '')}>▸</span>
                {g.label}
                {!abierto && <span className="font-medium normal-case opacity-70">({g.cols.length})</span>}
              </button>
            </th>
          );
        })}
      </tr>
      {/* Fila 2 — nombres de columna (solo grupos abiertos) */}
      <tr className="bg-ink-850">
        {GRUPOS_COL_DEF.map((g) => {
          const abierto = gruposCol.has(g.id);
          if (!abierto) {
            return <th key={g.id} className="border-b border-ink-700" style={{ borderLeft: `2px solid ${g.color}66` }} />;
          }
          return g.cols.map((key, j) => {
            const def = COLDEF_GRUPOS[key];
            return (
              <th
                key={key}
                className={
                  'px-3 py-2 font-semibold text-[11px] uppercase tracking-wider text-slate-400 whitespace-nowrap border-b border-ink-700 ' +
                  (def.center ? 'text-center ' : 'text-left ') +
                  (def.wide ? 'min-w-[190px] ' : '')
                }
                style={j === 0 ? { borderLeft: `2px solid ${g.color}66` } : undefined}
              >
                {def.t}
              </th>
            );
          });
        })}
      </tr>
    </thead>
  );
}

/** Pastilla de estado de la materia (Por iniciar / En curso / Cerró). */
function PillEstadoMateria({ estado }) {
  const meta = ESTADO_MATERIA_META[estado];
  if (!meta) return <span className="text-slate-600">—</span>;
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
      style={{ color: meta.color, backgroundColor: meta.color + '22', border: `1px solid ${meta.color}55` }}
    >
      {meta.txt}
    </span>
  );
}

/** Botón ⇒ para alertar al tutor cuando su materia YA CERRÓ y NO tiene
 *  ninguna respuesta de evaluación. Solo aparece en esas filas. */
function BotonAlertaCierre({ f, dirIdx, estadoAlerta, enviando, onEnviar }) {
  const elegible = f.estado_materia === 'cerro' && (f.respuestas || 0) === 0;
  if (!elegible) return <span className="text-slate-700">·</span>;

  const tutor = dirIdx?.porNombre?.get(normalizar(f.tutor_calendario || '')) || null;
  const correo = tutor?.correo_institucional || '';

  if (estadoAlerta === 'enviado' || estadoAlerta === 'registrada') {
    return (
      <span
        className={'text-xs ' + (estadoAlerta === 'enviado' ? 'text-emerald-400' : 'text-amber-400')}
        title={
          estadoAlerta === 'enviado'
            ? 'Alerta enviada al tutor'
            : 'Alerta registrada — falta conectar el envío de correo en n8n'
        }
      >
        {estadoAlerta === 'enviado' ? '✓ enviada' : '• registrada'}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={enviando}
      onClick={() => onEnviar(f, correo)}
      title={
        correo
          ? `Enviar alerta al tutor (${correo}) — materia cerrada sin evaluaciones`
          : 'No hay correo del tutor en el directorio — se registrará igual la alerta'
      }
      className="inline-flex items-center justify-center rounded-md border border-amber-700/60 bg-amber-950/30 px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-900/40 hover:border-amber-600 disabled:opacity-50 disabled:cursor-wait transition-colors"
    >
      {enviando ? '…' : '⇒ alertar'}
    </button>
  );
}

function FilaGrupoCategoria({ f, gruposCol, onToggleGrupoCol, dirIdx, alertasPorGrupo, alertaEnviando, onEnviarAlerta }) {
  return (
    <tr className="border-t border-ink-800 hover:bg-ink-850/50">
      {GRUPOS_COL_DEF.map((g) => {
        const abierto = gruposCol.has(g.id);
        if (!abierto) {
          return (
            <td
              key={g.id}
              onClick={() => onToggleGrupoCol(g.id)}
              className="px-2 py-2 text-center text-slate-600 cursor-pointer hover:text-slate-300"
              style={{ borderLeft: `2px solid ${g.color}66`, backgroundColor: g.color + '0A' }}
              title={'Desplegar ' + g.label}
            >
              ···
            </td>
          );
        }
        return g.cols.map((key, j) => {
          const def = COLDEF_GRUPOS[key];
          const style = j === 0 ? { borderLeft: `2px solid ${g.color}4D` } : {};
          const esResp = key === 'respuestas';
          return (
            <td
              key={key}
              title={esResp ? 'Evaluaciones registradas para esta materia en su categoría y mes' : undefined}
              className={
                'px-3 py-2 ' +
                (def.center ? 'text-center ' : '') +
                (def.mono ? 'font-mono text-[11px] text-slate-400 ' : 'text-slate-300 ') +
                (esResp ? (f.respuestas > 0 ? 'font-semibold text-emerald-300 ' : 'text-slate-600 ') : '')
              }
              style={style}
            >
              {key === 'mes_calificacion' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorDeMes(f.mes_calificacion) }} />
                  {f.mes_calificacion}
                </span>
              ) : key === 'tutor_calendario' ? (
                <TooltipDocente nombre={f.tutor_calendario} dir={dirIdx} />
              ) : key === 'estado_materia' ? (
                <PillEstadoMateria estado={f.estado_materia} />
              ) : key === 'alerta_cierre' ? (
                <BotonAlertaCierre
                  f={f}
                  dirIdx={dirIdx}
                  estadoAlerta={alertasPorGrupo?.get(f.group_id) || null}
                  enviando={alertaEnviando === f.group_id}
                  onEnviar={onEnviarAlerta}
                />
              ) : (
                celdaGrupo_(f, key)
              )}
            </td>
          );
        });
      })}
    </tr>
  );
}

/** Historial de alertas de cierre enviadas (tabla doc_alertas_cierre).
 *  Colapsable, arranca cerrado. 2026-09-10, a pedido del usuario:
 *  "seria bueno poder tener un registro en la app de eso". */
function RegistroAlertasCierre({ alertas }) {
  const [abierto, setAbierto] = useState(false);
  if (!alertas || alertas.length === 0) return null;
  return (
    <section className="rounded-2xl overflow-hidden border border-ink-700">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 bg-ink-900 hover:bg-ink-850 transition-colors"
      >
        <span className={'text-sm leading-none transition-transform text-slate-400 ' + (abierto ? 'rotate-90' : '')}>▸</span>
        <span className="text-sm font-semibold text-slate-200">Alertas de cierre enviadas</span>
        <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-ink-700 text-slate-300">{alertas.length}</span>
      </button>
      {abierto && (
        <div className="overflow-x-auto bg-ink-900 border-t border-ink-800">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-ink-850 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Materia</th>
                <th className="px-3 py-2 text-left">Categoría · Mes</th>
                <th className="px-3 py-2 text-left">Tutor</th>
                <th className="px-3 py-2 text-left">Canal</th>
                <th className="px-3 py-2 text-left">Destinatario</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Enviada por</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {alertas.map((a) => (
                <tr key={a.id} className="border-t border-ink-800">
                  <td className="px-3 py-1.5 text-slate-400">
                    {a.creado_en ? new Date(a.creado_en).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className="px-3 py-1.5">{a.materia || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-400">{[a.categoria_programa, a.mes_calificacion].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-3 py-1.5">{a.tutor_calendario || '—'}</td>
                  <td className="px-3 py-1.5">{a.canal === 'whatsapp' ? '💬 WhatsApp' : '✉ correo'}</td>
                  <td className="px-3 py-1.5 text-slate-400">{a.destinatario || '—'}</td>
                  <td className={'px-3 py-1.5 font-medium ' + (a.estado === 'enviado' ? 'text-emerald-300' : 'text-red-300')}>
                    {a.estado === 'enviado' ? 'Enviada' : 'Error'}
                    {a.detalle ? <span className="text-slate-500 font-normal"> · {a.detalle}</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500">{a.enviado_por || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChipFiltro({ activo, onClick, color, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs rounded-md px-2.5 py-1 border transition-colors flex items-center gap-1.5"
      style={
        color
          ? activo
            ? { backgroundColor: color + '26', borderColor: color, color }
            : { borderColor: '#2f3a4d', color: '#94a3b8' }
          : activo
            ? { backgroundColor: 'rgba(91,127,255,.15)', borderColor: '#5b7fff', color: '#7d9bff' }
            : { borderColor: '#2f3a4d', color: '#94a3b8' }
      }
    >
      {color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

function Th({ children, right }) {
  return <th className={'font-medium py-1.5 pr-4 ' + (right ? 'text-right' : 'text-left')}>{children}</th>;
}
function Td({ children, right }) {
  return <td className={'py-1.5 pr-4 ' + (right ? 'text-right' : 'text-left')}>{children}</td>;
}

const PREGUNTAS_LIKERT = [
  { key: 'plataforma_acceso_recursos', label: 'Acceso a plataforma' },
  { key: 'plataforma_disponibilidad', label: 'Disponibilidad plataforma' },
  { key: 'docente_comunicacion', label: 'Comunicación docente' },
  { key: 'docente_creatividad', label: 'Creatividad docente' },
  { key: 'docente_preparacion', label: 'Preparación docente' },
  { key: 'docente_estrategias_pedagogicas', label: 'Estrategias pedagógicas' },
  { key: 'docente_participacion', label: 'Participación en clase' },
  { key: 'docente_dominio', label: 'Dominio del docente' },
  { key: 'contenidos_ruta_aprendizaje', label: 'Ruta de aprendizaje' },
  { key: 'contenidos_utilidad', label: 'Utilidad contenidos' },
  { key: 'contenidos_informacion_clara', label: 'Información clara' },
  { key: 'contenidos_material', label: 'Material de clase' },
  { key: 'contenidos_estrategias_evaluacion', label: 'Estrategias de evaluación' },
];

/** Las 13 preguntas se agrupan en 3 secciones -- Plataforma, Docente y
 *  Contenidos -- que son las categorías centrales reales de la evaluación
 *  (confirmado por el usuario 2026-08-26: mismas 3 secciones y mismo orden
 *  del formulario real de Satisfacción Plataforma/Docente/Contenidos).
 *  Se usan para separar visualmente el boxplot y el mapa de calor por
 *  sección en vez de mostrar las 13 preguntas como una lista plana. */
const SECCIONES_EVALUACION = [
  {
    key: 'plataforma', titulo: 'Satisfacción Plataforma', color: '#38bdf8',
    keys: ['plataforma_acceso_recursos', 'plataforma_disponibilidad'],
  },
  {
    key: 'docente', titulo: 'Satisfacción Docente', color: '#f97316',
    keys: ['docente_comunicacion', 'docente_creatividad', 'docente_preparacion', 'docente_estrategias_pedagogicas', 'docente_participacion', 'docente_dominio'],
  },
  {
    key: 'contenidos', titulo: 'Satisfacción Contenidos', color: '#a78bfa',
    keys: ['contenidos_ruta_aprendizaje', 'contenidos_utilidad', 'contenidos_informacion_clara', 'contenidos_material', 'contenidos_estrategias_evaluacion'],
  },
];

/** Atajos para no buscar en el array cada vez que se arma una sección
 *  Docente/Contenidos/Plataforma de "2025 vs 2026" (ver SeccionSatisfaccion). */
const SECCION_PLATAFORMA = SECCIONES_EVALUACION.find((s) => s.key === 'plataforma');
const SECCION_DOCENTE = SECCIONES_EVALUACION.find((s) => s.key === 'docente');
const SECCION_CONTENIDOS = SECCIONES_EVALUACION.find((s) => s.key === 'contenidos');

/** Etiquetas cortas para el eje del mapa de calor de correlación (los
 *  labels completos de PREGUNTAS_LIKERT son muy largos para caber ahí). */
const ETIQUETA_CORTA = {
  plataforma_acceso_recursos: 'Acceso plataforma',
  plataforma_disponibilidad: 'Disp. plataforma',
  docente_comunicacion: 'Comunicación',
  docente_creatividad: 'Creatividad',
  docente_preparacion: 'Preparación',
  docente_estrategias_pedagogicas: 'Estrategias pedag.',
  docente_participacion: 'Participación clase',
  docente_dominio: 'Dominio',
  contenidos_ruta_aprendizaje: 'Ruta aprendizaje',
  contenidos_utilidad: 'Utilidad',
  contenidos_informacion_clara: 'Información clara',
  contenidos_material: 'Material',
  contenidos_estrategias_evaluacion: 'Estrat. evaluación',
  nps_recomendaria: 'NPS',
};

const COLOR_CATEGORIA = {
  Administración: '#5b7fff',
  Contabilidad: '#f59e0b',
  Ingeniería: '#10b981',
  Marketing: '#f43f5e',
};

/** Par validado con scripts/validate_palette.js del skill dataviz (todos los
 *  checks PASS contra la superficie oscura de esta app, #0f131a) -- 2025 en
 *  azul, 2026 en naranja. Se reusa en las 4 secciones "2025 vs 2026"
 *  (NPS + Docente + Contenidos + Plataforma) a propósito -- que "azul =
 *  2025, naranja = 2026" sea una convención de toda la página, no algo
 *  distinto por gráfico. */
const COLOR_2025 = '#3987e5';
const COLOR_2026 = '#d95926';

/** Color propio de la sección NPS (no viene de SECCIONES_EVALUACION porque
 *  el NPS no es una de las 3 secciones de preguntas -- es su propia
 *  pregunta). Azul acento de la app, ya usado como color "principal". */
const COLOR_SECCION_NPS = '#5b7fff';

/** Color propio de Ranking Docente -- verde/aqua (slot 3 del skill dataviz,
 *  ya validado CVD-safe contra la superficie oscura de esta app), elegido
 *  porque no colisiona con ningún color ya usado en Estadísticas (azul NPS,
 *  naranja Docente, violeta Contenidos, celeste Plataforma). */
const COLOR_SECCION_RANKING = '#199e70';

/** Fondo pastel + borde izquierdo del color de la sección -- 2026-09-01, a
 *  pedido del usuario: "cada panel [tenga] un color especial... para que
 *  se vean secciones diferentes". Mismo lenguaje visual que ya usa
 *  BoxplotSeccion (borde izquierdo grueso, borde general tenue), sumando
 *  un fondo muy sutil (~8% de opacidad, alcanza para diferenciar sin
 *  perder contraste del texto claro sobre fondo oscuro). */
function estiloPanelSeccion_(color) {
  return { backgroundColor: color + '14', borderColor: color + '33', borderLeftWidth: 4, borderLeftColor: color };
}

/** Mínimo de respuestas combinadas para que una matriz de correlación
 *  diga algo real -- con menos de esto, cualquier r es ruido de muestra
 *  chica (más estricto que N_MINIMO_CONFIABLE porque acá se cruzan pares
 *  de variables, no una sola). */
const N_MINIMO_CORRELACION = 10;

function Estadisticas({ meses, incluirModulo0 }) {
  const [crudo, setCrudo] = useState(null);
  const [crudoHistorico, setCrudoHistorico] = useState(null);
  const [stats, setStats] = useState(null);
  const [estudiantesActivosMapa, setEstudiantesActivosMapa] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mesElegido, setMesElegido] = useState(null);
  const [categoriasActivas, setCategoriasActivas] = useState(() => new Set());

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [{ stats: s, crudo: c }, estudiantesActivos] = await Promise.all([
        fetchStatsYCrudo(),
        fetchEstudiantesActivosMapa(),
      ]);
      setStats(s);
      setCrudo(c);
      setEstudiantesActivosMapa(estudiantesActivos);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }

  // 2026-09-01: botón explícito "Sincronizar" al lado del input (a pedido
  // del usuario) -- guarda Estudiantes Activos y de una vuelve a pedir
  // crudo+stats (cargar() completo, mismo camino que el botón "Actualizar"
  // de arriba) para que Respuestas/Promotores/Pasivos/etc. de esa columna
  // queden al día en el mismo clic, sin depender de blur ni de un segundo
  // clic aparte en "Actualizar".
  const [mesSincronizando, setMesSincronizando] = useState(null);

  async function sincronizarEstudiantesActivos(mes, valor) {
    setMesSincronizando(mes);
    setError(null);
    try {
      await actualizarEstudiantesActivos(mes, valor);
      await cargar();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setMesSincronizando(null);
    }
  }

  async function cargarHistorico() {
    setCargando(true);
    setError(null);
    try {
      const c = await fetchCrudoHistoricoEneroJulio();
      setCrudoHistorico(c);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  // El bloque histórico (Google Forms, Enero-Julio 2026) es una sola
  // importación fija -- no vive en doc_base_de_grupos ni
  // tiene toggle, así que se agrega como un "mes" extra solo acá, sin
  // tocar la lista de meses que usan la tabla y los links de encuesta.
  const mesesConHistorico = useMemo(() => [...meses, MES_HISTORICO_ENERO_JULIO], [meses]);
  const esHistorico = mesElegido === MES_HISTORICO_ENERO_JULIO;

  function elegirMes(mes) {
    setMesElegido(mes);
    setCategoriasActivas(new Set());
    if (mes === MES_HISTORICO_ENERO_JULIO && !crudoHistorico) cargarHistorico();
  }

  function toggleCategoria(categoria) {
    setCategoriasActivas((prev) => {
      const next = new Set(prev);
      if (next.has(categoria)) next.delete(categoria);
      else next.add(categoria);
      return next;
    });
  }

  // 2026-09-09: filtra Módulo 0 (si el switch global lo excluye) antes de
  // que cualquier cuenta/promedio/gráfico lo vea -- un solo punto, así no
  // hay que tocar cada helper que ya consume `crudo`/`crudoHistorico`.
  const crudoFiltrado = useMemo(() => filtrarCrudoModulo0_(crudo, incluirModulo0), [crudo, incluirModulo0]);
  const crudoHistoricoFiltrado = useMemo(() => filtrarCrudoModulo0_(crudoHistorico, incluirModulo0), [crudoHistorico, incluirModulo0]);

  const porCategoria = esHistorico
    ? (crudoHistoricoFiltrado || [])
    : (crudoFiltrado || []).filter((d) => d.mes_calificacion === mesElegido);
  const filasGlobal = porCategoria.flatMap((d) => d.filas);
  const global = { categoria_programa: 'Todas', resumen: resumenDeFilas(filasGlobal) };
  const seriesActivas = porCategoria.filter((d) => categoriasActivas.has(d.categoria_programa));
  // El histórico no tiene cupos_activos (no viene de doc_base_de_grupos),
  // así que no hay participación/IC de Wilson que mostrar para ese bloque.
  const statsDelMes = esHistorico ? [] : (stats || []).filter((s) => s.mes_calificacion === mesElegido);

  const claveCorrelacion = [...PREGUNTAS_LIKERT_KEYS, 'nps_recomendaria'];
  const matriz = filasGlobal.length >= N_MINIMO_CORRELACION ? matrizCorrelacion(filasGlobal, claveCorrelacion) : null;

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Estadísticas de evaluación docente</h2>
        <button
          type="button"
          onClick={cargar}
          className="text-xs text-slate-300 border border-ink-600 rounded-md px-2.5 py-1.5 hover:bg-ink-700 transition-colors"
        >
          Actualizar
        </button>
      </div>

      {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>}
      {cargando && <p className="text-xs text-slate-400">Cargando…</p>}

      {!cargando && (
        <>
          <NpsComparativo2025vs2026 crudo={crudoFiltrado} />
          <TablaNpsMensual2026
            crudo={crudoFiltrado}
            estudiantesActivosMapa={estudiantesActivosMapa}
            mesSincronizando={mesSincronizando}
            onSincronizarEstudiantesActivos={sincronizarEstudiantesActivos}
          />

          <SeccionSatisfaccion
            titulo="Satisfacción Docente"
            seccion={SECCION_DOCENTE}
            promedios2025={SATISFACCION_DOCENTE_2025_PROMEDIO}
            datosFijo2026={SATISFACCION_DOCENTE_2026_FIJO}
            crudo={crudoFiltrado}
            estudiantesActivosMapa={estudiantesActivosMapa}
          />
          <SeccionSatisfaccion
            titulo="Satisfacción Contenidos"
            seccion={SECCION_CONTENIDOS}
            promedios2025={SATISFACCION_CONTENIDOS_2025_PROMEDIO}
            datosFijo2026={SATISFACCION_CONTENIDOS_2026_FIJO}
            crudo={crudoFiltrado}
            estudiantesActivosMapa={estudiantesActivosMapa}
          />
          <SeccionSatisfaccion
            titulo="Satisfacción Plataforma"
            seccion={SECCION_PLATAFORMA}
            promedios2025={SATISFACCION_PLATAFORMA_2025_PROMEDIO}
            datosFijo2026={SATISFACCION_PLATAFORMA_2026_FIJO}
            crudo={crudoFiltrado}
            estudiantesActivosMapa={estudiantesActivosMapa}
          />

          <div className="border-t border-ink-700 pt-4">
            <h3 className="text-sm font-semibold text-slate-100 mb-1">Detalle por mes y categoría</h3>
            <p className="text-xs text-slate-400 mb-3">Distribución de respuestas, correlación entre preguntas y participación, por mes y categoría de programa.</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-2">Mes</p>
            <div className="flex flex-wrap gap-2">
              {mesesConHistorico.map((mes) => {
                const color = colorDeMes(mes);
                const activo = mesElegido === mes;
                return (
                  <button
                    key={mes}
                    type="button"
                    onClick={() => elegirMes(mes)}
                    className="text-sm rounded-md px-3 py-1.5 border transition-colors flex items-center gap-1.5"
                    style={
                      activo
                        ? { backgroundColor: color + '26', borderColor: color, color }
                        : { borderColor: '#2f3a4d', color: '#cbd5e1' }
                    }
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    {mes}
                  </button>
                );
              })}
            </div>
          </div>

          {!mesElegido && <p className="text-xs text-slate-400">Selecciona un mes para ver el detalle.</p>}

          {mesElegido && (
            <>
              <div>
                <p className="text-xs text-slate-400 mb-2">Categorías a comparar (clic para superponer en el boxplot)</p>
                <div className="flex flex-wrap gap-2">
                  {porCategoria.map((d) => {
                    const respuestas = d.filas.length;
                    const activa = categoriasActivas.has(d.categoria_programa);
                    const color = COLOR_CATEGORIA[d.categoria_programa] || '#5b7fff';
                    return (
                      <button
                        key={d.categoria_programa}
                        type="button"
                        onClick={() => toggleCategoria(d.categoria_programa)}
                        className="text-sm rounded-md px-3 py-1.5 border transition-colors flex items-center gap-1.5"
                        style={
                          activa
                            ? { backgroundColor: color + '26', borderColor: color, color }
                            : { borderColor: '#2f3a4d', color: '#cbd5e1' }
                        }
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        {d.categoria_programa}
                        <span className="text-xs opacity-70">({respuestas})</span>
                        {respuestas > 0 && respuestas < N_MINIMO_CONFIABLE && (
                          <span title={`Menos de ${N_MINIMO_CONFIABLE} respuestas`}>⚠</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {seriesActivas.length === 0 ? (
                <p className="text-xs text-slate-400">Elige al menos una categoría para ver el boxplot.</p>
              ) : (
                <BoxplotPreguntas series={seriesActivas} />
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <TarjetaResumen titulo="Global (todas las categorías)" color="#94a3b8" resumen={global.resumen} />
                {seriesActivas.map((d) => (
                  <TarjetaResumen
                    key={d.categoria_programa}
                    titulo={d.categoria_programa}
                    color={COLOR_CATEGORIA[d.categoria_programa] || '#5b7fff'}
                    resumen={resumenDeFilas(d.filas)}
                  />
                ))}
              </div>

              <Participacion stats={statsDelMes} />

              <CorrelacionHeatmap matriz={matriz} claves={claveCorrelacion} totalRespuestas={filasGlobal.length} />
            </>
          )}
        </>
      )}
    </section>
  );
}

/* ============================================================================
 *  NPS 2025 vs 2026 + tabla de indicadores 2026 — 2026-09-01, a pedido del
 *  usuario: lo primero que se ve en Estadísticas, antes del detalle por mes
 *  y categoría. Ver TABLA_NPS_2026_FIJA/NPS_2025_FIJO/calcularMetricasNPS
 *  en evaluacionDocente.js para qué está fijo (histórico) y qué se calcula
 *  en vivo (Agosto 2026 en adelante).
 * ========================================================================== */

/** Filas crudas de TODAS las categorías combinadas para un mes -- el NPS
 *  institucional no se corta por categoría (igual que TABLA_NPS_2026_FIJA,
 *  que tampoco lo hace). También la usan las secciones de Satisfacción
 *  Docente/Contenidos/Plataforma para su promedio institucional. */
function filasDelMes_(crudo, mes) {
  return (crudo || []).filter((d) => d.mes_calificacion === mes).flatMap((d) => d.filas);
}

/** Filas crudas de UNA categoría puntual en un mes -- para las columnas
 *  Admin/Cont/Ing/Mkt de las secciones de Satisfacción (ver
 *  SeccionSatisfaccion). `crudo` ya viene agrupado por categoria+mes (un
 *  único elemento por combinación), así que alcanza con encontrarlo. */
function filasDeCategoriaYMes_(crudo, categoria, mes) {
  const entrada = (crudo || []).find((d) => d.categoria_programa === categoria && d.mes_calificacion === mes);
  return entrada ? entrada.filas : [];
}

/** Valores nps_recomendaria de TODAS las categorías combinadas para un mes. */
function valoresNpsDelMes_(crudo, mes) {
  return filasDelMes_(crudo, mes)
    .map((f) => f.nps_recomendaria)
    .filter((v) => typeof v === 'number');
}

/** Serie de NPS 2026 mes a mes (12 valores, Enero-Diciembre): Enero-Julio
 *  viene fijo de TABLA_NPS_2026_FIJA, Agosto en adelante se calcula en vivo
 *  desde `crudo`. null en meses sin respuestas todavía -- así Plotly deja
 *  el hueco en vez de dibujar una barra en 0 (que se leería como "NPS
 *  cero" en vez de "sin datos"). */
function serieNps2026_(crudo) {
  return MESES_ES.map((mes, i) => {
    if (i < TABLA_NPS_2026_FIJA.nps.length) return TABLA_NPS_2026_FIJA.nps[i];
    const valores = valoresNpsDelMes_(crudo, mes);
    return valores.length ? calcularMetricasNPS(valores).nps : null;
  });
}

/** Separador decimal "," en vez de "." (convención en español) -- a pedido
 *  del usuario 2026-09-01, aplica a toda la sección NPS/Satisfacción:
 *  etiquetas de gráfico (acá abajo), celdas de tabla (formatearValorTabla_)
 *  y ejes/hover de Plotly (ver `separators: ',.'` en cada layout). */
function comaDecimal_(texto) {
  return texto.replace('.', ',');
}

/** Texto de etiqueta para mostrar encima de cada barra/punto -- '' (no
 *  null/undefined) para los meses sin dato, así Plotly no imprime "null". */
function etiquetasNps_(serie) {
  return serie.map((v) => (typeof v === 'number' ? comaDecimal_(v.toFixed(1)) : ''));
}

/** Igual que etiquetasNps_ pero con 2 decimales -- para los promedios /5 de
 *  Satisfacción Docente/Contenidos/Plataforma (misma precisión que la
 *  tabla, ver formatearValorTabla_ formato "decimal"). */
function etiquetasDecimal_(serie) {
  return serie.map((v) => (typeof v === 'number' ? comaDecimal_(v.toFixed(2)) : ''));
}

/** Líneas superpuestas (evolución mensual) -- 2026-09-01, a pedido del
 *  usuario (reemplaza el gráfico combinado de barras+línea anterior): las
 *  dos series en el mismo lenguaje visual (línea + marcador), una encima
 *  de la otra mes a mes, con el valor impreso sobre cada punto y eje Y
 *  fijo en 0-100 (escala real del NPS, no autoescalado al máximo de los
 *  datos). */
function NpsComparativo2025vs2026({ crudo }) {
  const serie2026 = useMemo(() => serieNps2026_(crudo), [crudo]);

  const data = useMemo(() => [
    {
      type: 'scatter', mode: 'lines+markers+text', name: '2025', x: MESES_ES, y: NPS_2025_FIJO,
      line: { color: COLOR_2025, width: 3 }, marker: { color: COLOR_2025, size: 8 },
      text: etiquetasNps_(NPS_2025_FIJO), textposition: 'top center', textfont: { color: COLOR_2025, size: 10 },
      cliponaxis: false, connectgaps: false,
    },
    {
      type: 'scatter', mode: 'lines+markers+text', name: '2026', x: MESES_ES, y: serie2026,
      line: { color: COLOR_2026, width: 3 }, marker: { color: COLOR_2026, size: 8 },
      text: etiquetasNps_(serie2026), textposition: 'bottom center', textfont: { color: COLOR_2026, size: 10 },
      cliponaxis: false, connectgaps: false,
    },
  ], [serie2026]);

  const layout = useMemo(() => ({
    height: 360,
    margin: { t: 40, r: 16, b: 40, l: 48 },
    separators: ',.',
    yaxis: { title: 'NPS (%)', range: [0, 100] },
    xaxis: { tickangle: -20 },
  }), []);

  return (
    <div className="rounded-md p-3 border" style={estiloPanelSeccion_(COLOR_SECCION_NPS)}>
      <p className="text-sm font-semibold mb-1" style={{ color: COLOR_SECCION_NPS }}>NPS 2025 vs NPS 2026</p>
      <p className="text-xs text-slate-400 mb-2">
        % Promotores (9-10) menos % Detractores (0-6), mes a mes. 2025 y Enero-Julio 2026 son una foto fija del reporte institucional (ese proceso ya no se puede re-auditar); Agosto 2026 en adelante se calcula en vivo con cada respuesta que llega.
      </p>
      <PlotlyChart data={data} layout={layout} style={{ width: '100%', height: 360 }} />
    </div>
  );
}

const FILAS_TABLA_NPS = [
  { key: 'estudiantesActivos', label: 'Estudiantes Activos', formato: 'entero' },
  { key: 'respuestas', label: 'Respuestas Obtenidas', formato: 'entero' },
  { key: 'tasaRespuesta', label: 'Tasa de Respuesta', formato: 'porcentaje' },
  { key: 'promotores', label: 'Promotores (9 y 10)', formato: 'entero' },
  { key: 'pasivos', label: 'Pasivos (7 y 8)', formato: 'entero' },
  { key: 'detractores', label: 'Detractores (0-6)', formato: 'entero' },
  { key: 'pctPromotores', label: '% Promotores', formato: 'porcentaje' },
  { key: 'pctDetractores', label: '% Detractores', formato: 'porcentaje' },
  { key: 'nps', label: 'NPS', formato: 'porcentaje', destacado: true },
];

function formatearValorTabla_(valor, formato) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  if (formato === 'porcentaje') return `${comaDecimal_(String(valor))}%`;
  if (formato === 'decimal') return comaDecimal_(valor.toFixed(2));
  return String(Math.round(valor));
}

/** Datos de una columna (mes) de la tabla: Enero-Julio fijo (TABLA_NPS_2026_FIJA,
 *  no editable), Agosto en adelante calculado en vivo desde `crudo` +
 *  Estudiantes Activos manual (editable, ver TablaNpsMensual2026). */
function columnaDelMes_(mes, indice, crudo, estudiantesActivosMapa) {
  if (indice < TABLA_NPS_2026_FIJA.nps.length) {
    const i = indice;
    return {
      mes,
      editable: false,
      estudiantesActivos: TABLA_NPS_2026_FIJA.estudiantesActivos[i],
      respuestas: TABLA_NPS_2026_FIJA.respuestas[i],
      tasaRespuesta: calcularTasaRespuesta(TABLA_NPS_2026_FIJA.respuestas[i], TABLA_NPS_2026_FIJA.estudiantesActivos[i]),
      promotores: TABLA_NPS_2026_FIJA.promotores[i],
      pasivos: TABLA_NPS_2026_FIJA.pasivos[i],
      detractores: TABLA_NPS_2026_FIJA.detractores[i],
      pctPromotores: TABLA_NPS_2026_FIJA.pctPromotores[i],
      pctDetractores: TABLA_NPS_2026_FIJA.pctDetractores[i],
      nps: TABLA_NPS_2026_FIJA.nps[i],
    };
  }
  const metricas = calcularMetricasNPS(valoresNpsDelMes_(crudo, mes));
  const estudiantesActivos = estudiantesActivosMapa[mes] ?? null;
  return {
    mes,
    editable: true,
    estudiantesActivos,
    respuestas: metricas.respuestas,
    tasaRespuesta: calcularTasaRespuesta(metricas.respuestas, estudiantesActivos),
    promotores: metricas.promotores,
    pasivos: metricas.pasivos,
    detractores: metricas.detractores,
    pctPromotores: metricas.pctPromotores,
    pctDetractores: metricas.pctDetractores,
    nps: metricas.nps,
  };
}

function TablaNpsMensual2026({ crudo, estudiantesActivosMapa, mesSincronizando, onSincronizarEstudiantesActivos }) {
  const columnas = useMemo(
    () => MESES_ES.map((mes, i) => columnaDelMes_(mes, i, crudo, estudiantesActivosMapa)),
    [crudo, estudiantesActivosMapa]
  );

  // 2026-09-01: el botón "↻ Sincronizar" se movió del lado del input a al
  // lado del título del mes en el encabezado (a pedido del usuario) -- por
  // eso el borrador del input vive ACÁ (no adentro de un input propio),
  // para que el botón del encabezado pueda leer/disparar con lo que el
  // usuario esté escribiendo en esa columna. Se siembra una sola vez por
  // mes (la primera vez que llega su valor real desde Supabase) y después
  // el usuario es dueño del campo hasta que sincroniza.
  const [borrador, setBorrador] = useState({});
  useEffect(() => {
    setBorrador((prev) => {
      let cambio = false;
      const next = { ...prev };
      columnas.forEach((c) => {
        if (c.editable && next[c.mes] === undefined) {
          next[c.mes] = c.estudiantesActivos === null || c.estudiantesActivos === undefined ? '' : String(c.estudiantesActivos);
          cambio = true;
        }
      });
      return cambio ? next : prev;
    });
  }, [columnas]);

  function sincronizar(mes) {
    const limpio = (borrador[mes] || '').replace(/\D/g, '');
    const numero = limpio === '' ? null : Number(limpio);
    setBorrador((prev) => ({ ...prev, [mes]: numero === null ? '' : String(numero) }));
    onSincronizarEstudiantesActivos(mes, numero);
  }

  const estiloPanel = estiloPanelSeccion_(COLOR_SECCION_NPS);

  return (
    <div className="rounded-md p-3 border overflow-x-auto" style={estiloPanel}>
      <p className="text-sm font-semibold mb-1" style={{ color: COLOR_SECCION_NPS }}>Indicadores NPS 2026 por mes</p>
      <p className="text-xs text-slate-400 mb-3">
        Enero-Julio: foto fija del reporte institucional. Agosto en adelante: calculado en vivo -- el único dato manual es <b className="text-slate-200">Estudiantes Activos</b>. El botón <b className="text-slate-200">↻</b> del encabezado guarda ese número y recalcula el resto de la columna.
      </p>
      <table className="text-xs whitespace-nowrap border-collapse">
        <thead>
          <tr>
            <th className="text-left text-slate-400 font-medium py-1.5 pr-4 sticky left-0" style={{ backgroundColor: estiloPanel.backgroundColor }}>Indicador</th>
            {columnas.map((c) => (
              <th key={c.mes} className="text-right text-slate-400 font-medium py-1.5 px-3">
                <span className="inline-flex items-center gap-1 justify-end">
                  {c.mes.slice(0, 3)}
                  {c.editable && (
                    <button
                      type="button"
                      onClick={() => sincronizar(c.mes)}
                      disabled={mesSincronizando === c.mes}
                      title={`Guardar Estudiantes Activos de ${c.mes} y recalcular esta columna`}
                      className="shrink-0 leading-none rounded px-1 py-0.5 border border-ink-600 text-[10px] font-normal text-slate-300 hover:bg-ink-700 hover:text-accent-300 hover:border-accent-500 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    >
                      {mesSincronizando === c.mes ? '…' : '↻'}
                    </button>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS_TABLA_NPS.map((fila) => (
            <tr key={fila.key} className={'border-t border-ink-700 ' + (fila.destacado ? 'bg-ink-700/40' : '')}>
              <td
                className={'py-1.5 pr-4 sticky left-0 ' + (fila.destacado ? 'font-semibold text-slate-100' : 'text-slate-300')}
                style={{ backgroundColor: estiloPanel.backgroundColor }}
              >
                {fila.label}
              </td>
              {columnas.map((c) => (
                <td key={c.mes} className={'text-right py-1.5 px-3 ' + (fila.destacado ? 'font-semibold text-slate-100' : 'text-slate-200')}>
                  {fila.key === 'estudiantesActivos' && c.editable ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={borrador[c.mes] ?? ''}
                      onChange={(e) => setBorrador((prev) => ({ ...prev, [c.mes]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') sincronizar(c.mes); }}
                      disabled={mesSincronizando === c.mes}
                      placeholder="—"
                      className="w-16 bg-ink-900 border border-ink-600 rounded px-1.5 py-1 text-right text-slate-100 focus:outline-none focus:border-accent-500 disabled:opacity-50"
                    />
                  ) : (
                    formatearValorTabla_(c[fila.key], fila.formato)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================================
 *  Satisfacción Docente/Contenidos/Plataforma, 2025 vs 2026 — 2026-09-01, a
 *  pedido del usuario: "algo similar a lo que ya logramos con nps" para
 *  estas 3 secciones. Mismo patrón que NPS (línea superpuesta 2025 vs 2026
 *  + tabla mensual, Enero-Julio fijo/Agosto en adelante en vivo), pero acá
 *  la tabla SÍ se corta por categoría (Admin/Cont/Ing, que ya medía el
 *  reporte viejo, + Marketing solo en vivo -- ver comentario de
 *  SATISFACCION_DOCENTE_2026_FIJO en evaluacionDocente.js). Estudiantes
 *  Activos NO se vuelve a pedir acá -- es el mismo dato institucional que
 *  ya se carga en la tabla de NPS (mismo mes, mismo significado), así que
 *  estas 3 secciones solo lo LEEN de estudiantesActivosMapa.
 * ========================================================================== */

const CATEGORIAS_TABLA_SATISFACCION = [
  { key: 'admin', label: 'Admin', categoria: 'Administración' },
  { key: 'cont', label: 'Cont', categoria: 'Contabilidad' },
  { key: 'ing', label: 'Ing', categoria: 'Ingeniería' },
  { key: 'mkt', label: 'Mkt', categoria: 'Marketing' },
];

/** Serie de Promedio 2026 mes a mes (12 valores) para una sección --
 *  Enero-Julio fijo (datosFijo2026.promedio), Agosto en adelante calculado
 *  en vivo con TODAS las categorías combinadas (igual criterio que
 *  serieNps2026_: el promedio institucional no se corta por categoría). */
function seriePromedio2026_(crudo, seccion, datosFijo2026) {
  return MESES_ES.map((mes, i) => {
    if (i < datosFijo2026.promedio.length) return datosFijo2026.promedio[i];
    const filas = filasDelMes_(crudo, mes);
    return filas.length ? calcularPromedioClaves(filas, seccion.keys) : null;
  });
}

/** Datos de una columna (mes) de la tabla de una sección: Enero-Julio fijo,
 *  Agosto en adelante calculado en vivo por categoría (con el mismo piso
 *  N_MINIMO_CONFIABLE que ya usa TarjetaResumen -- un promedio con 1-2
 *  respuestas no es una medición, ver ese comentario más abajo). */
function columnaSeccion_(mes, indice, crudo, seccion, datosFijo2026, estudiantesActivosMapa) {
  if (indice < datosFijo2026.promedio.length) {
    const i = indice;
    return {
      mes,
      respuestas: RESPUESTAS_SATISFACCION_2026_FIJO[i],
      estudiantesActivos: TABLA_NPS_2026_FIJA.estudiantesActivos[i],
      admin: datosFijo2026.admin[i],
      cont: datosFijo2026.cont[i],
      ing: datosFijo2026.ing[i],
      mkt: null,
      promedio: datosFijo2026.promedio[i],
      muestraChica: {},
    };
  }
  const valores = {};
  const muestraChica = {};
  CATEGORIAS_TABLA_SATISFACCION.forEach((cat) => {
    const filas = filasDeCategoriaYMes_(crudo, cat.categoria, mes);
    const chica = filas.length > 0 && filas.length < N_MINIMO_CONFIABLE;
    valores[cat.key] = chica ? null : (filas.length ? calcularPromedioClaves(filas, seccion.keys) : null);
    muestraChica[cat.key] = chica;
  });
  const filasTodas = filasDelMes_(crudo, mes);
  return {
    mes,
    respuestas: filasTodas.length,
    estudiantesActivos: estudiantesActivosMapa[mes] ?? null,
    admin: valores.admin, cont: valores.cont, ing: valores.ing, mkt: valores.mkt,
    promedio: filasTodas.length ? calcularPromedioClaves(filasTodas, seccion.keys) : null,
    muestraChica,
  };
}

/** Una fila de la tabla (<tr>) -- reusada para Respuestas/Tasa/Admin/Cont/
 *  Ing/Mkt/Promedio, cada una con su propia función para sacar el valor de
 *  la columna. `muestraChica` es opcional: si la da, esa celda puntual se
 *  reemplaza por "⚠" cuando esa categoría tuvo menos de N_MINIMO_CONFIABLE
 *  respuestas ese mes (en vez de mostrar un promedio poco confiable). */
function FilaSeccion({ label, columnas, valor, formato, destacado, muestraChica, fondoIndicador }) {
  return (
    <tr className={'border-t border-ink-700 ' + (destacado ? 'bg-ink-700/40' : '')}>
      <td
        className={'py-1.5 pr-4 sticky left-0 ' + (destacado ? 'font-semibold text-slate-100' : 'text-slate-300')}
        style={fondoIndicador ? { backgroundColor: fondoIndicador } : undefined}
      >
        {label}
      </td>
      {columnas.map((c) => {
        const chica = muestraChica ? muestraChica(c) : false;
        return (
          <td key={c.mes} className={'text-right py-1.5 px-3 ' + (destacado ? 'font-semibold text-slate-100' : 'text-slate-200')}>
            {chica
              ? <span className="text-amber-400" title={`Menos de ${N_MINIMO_CONFIABLE} respuestas -- promedio no confiable`}>⚠</span>
              : formatearValorTabla_(valor(c), formato)}
          </td>
        );
      })}
    </tr>
  );
}

const MODOS_GRAFICO_SECCION = { GENERAL: 'general', DESCRIPTIVO: 'descriptivo' };

function SeccionSatisfaccion({ titulo, seccion, promedios2025, datosFijo2026, crudo, estudiantesActivosMapa }) {
  const [modo, setModo] = useState(MODOS_GRAFICO_SECCION.GENERAL);

  const serie2026 = useMemo(() => seriePromedio2026_(crudo, seccion, datosFijo2026), [crudo, seccion, datosFijo2026]);
  const columnas = useMemo(
    () => MESES_ES.map((mes, i) => columnaSeccion_(mes, i, crudo, seccion, datosFijo2026, estudiantesActivosMapa)),
    [crudo, seccion, datosFijo2026, estudiantesActivosMapa]
  );

  const dataGeneral = useMemo(() => [
    {
      type: 'scatter', mode: 'lines+markers+text', name: '2025', x: MESES_ES, y: promedios2025,
      line: { color: COLOR_2025, width: 3 }, marker: { color: COLOR_2025, size: 8 },
      text: etiquetasDecimal_(promedios2025), textposition: 'top center', textfont: { color: COLOR_2025, size: 10 },
      cliponaxis: false, connectgaps: false,
    },
    {
      type: 'scatter', mode: 'lines+markers+text', name: '2026', x: MESES_ES, y: serie2026,
      line: { color: COLOR_2026, width: 3 }, marker: { color: COLOR_2026, size: 8 },
      text: etiquetasDecimal_(serie2026), textposition: 'bottom center', textfont: { color: COLOR_2026, size: 10 },
      cliponaxis: false, connectgaps: false,
    },
  ], [promedios2025, serie2026]);

  // "Descriptivo" -- 2026-09-01, a pedido del usuario: en vez de la
  // comparación 2025 vs 2026 (institucional), desagrega 2026 por programa
  // (Admin/Cont/Ing/Mkt), reusando los mismos valores por categoría que ya
  // calcula `columnas` para la tabla de abajo -- ni un cálculo nuevo, solo
  // otra forma de mirar los mismos datos. Mismos colores por categoría que
  // ya se usan en el resto de Estadísticas (COLOR_CATEGORIA).
  const dataDescriptivo = useMemo(() => CATEGORIAS_TABLA_SATISFACCION.map((cat) => {
    const serie = columnas.map((c) => c[cat.key]);
    const color = COLOR_CATEGORIA[cat.categoria] || '#94a3b8';
    return {
      type: 'scatter', mode: 'lines+markers+text', name: cat.categoria, x: MESES_ES, y: serie,
      line: { color, width: 2 }, marker: { color, size: 6 },
      text: etiquetasDecimal_(serie), textposition: 'top center', textfont: { color, size: 9 },
      cliponaxis: false, connectgaps: false,
    };
  }), [columnas]);

  const layout = useMemo(() => ({
    height: 320,
    margin: { t: 32, r: 16, b: 36, l: 44 },
    separators: ',.',
    yaxis: { title: 'Promedio /5', range: [1, 5] },
    xaxis: { tickangle: -20 },
  }), []);

  const estiloPanel = estiloPanelSeccion_(seccion.color);

  return (
    <div className="space-y-3">
      <div className="rounded-md p-3 border" style={estiloPanel}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-sm font-semibold" style={{ color: seccion.color }}>
            {modo === MODOS_GRAFICO_SECCION.GENERAL ? `${titulo} 2025 vs ${titulo} 2026` : `${titulo} por programa (2026)`}
          </p>
          <div className="flex gap-1.5">
            <BotonModoGrafico activo={modo === MODOS_GRAFICO_SECCION.GENERAL} onClick={() => setModo(MODOS_GRAFICO_SECCION.GENERAL)} color={seccion.color}>
              General
            </BotonModoGrafico>
            <BotonModoGrafico activo={modo === MODOS_GRAFICO_SECCION.DESCRIPTIVO} onClick={() => setModo(MODOS_GRAFICO_SECCION.DESCRIPTIVO)} color={seccion.color}>
              Descriptivo
            </BotonModoGrafico>
          </div>
        </div>
        <PlotlyChart
          data={modo === MODOS_GRAFICO_SECCION.GENERAL ? dataGeneral : dataDescriptivo}
          layout={layout}
          style={{ width: '100%', height: 320 }}
        />
      </div>
      <div className="rounded-md p-3 border overflow-x-auto" style={estiloPanel}>
        <table className="text-xs whitespace-nowrap border-collapse">
          <thead>
            <tr>
              <th className="text-left text-slate-400 font-medium py-1.5 pr-4 sticky left-0" style={{ backgroundColor: estiloPanel.backgroundColor }}>Indicador</th>
              {columnas.map((c) => (
                <th key={c.mes} className="text-right text-slate-400 font-medium py-1.5 px-3">{c.mes.slice(0, 3)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Solo lectura -- se configura una vez en la tabla de NPS de
                arriba y estas 3 secciones lo toman del mismo mes, no se
                vuelve a pedir acá (ver comentario del componente). */}
            <FilaSeccion label="Estudiantes Activos" columnas={columnas} valor={(c) => c.estudiantesActivos} formato="entero" fondoIndicador={estiloPanel.backgroundColor} />
            <FilaSeccion label="Respuestas Obtenidas" columnas={columnas} valor={(c) => c.respuestas} formato="entero" fondoIndicador={estiloPanel.backgroundColor} />
            <FilaSeccion label="Tasa de Respuesta" columnas={columnas} valor={(c) => calcularTasaRespuesta(c.respuestas, c.estudiantesActivos)} formato="porcentaje" fondoIndicador={estiloPanel.backgroundColor} />
            {CATEGORIAS_TABLA_SATISFACCION.map((cat) => (
              <FilaSeccion
                key={cat.key}
                label={cat.label}
                columnas={columnas}
                valor={(c) => c[cat.key]}
                formato="decimal"
                muestraChica={(c) => c.muestraChica[cat.key]}
                fondoIndicador={estiloPanel.backgroundColor}
              />
            ))}
            <FilaSeccion label="Promedio" columnas={columnas} valor={(c) => c.promedio} formato="decimal" destacado fondoIndicador={estiloPanel.backgroundColor} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotonModoGrafico({ activo, onClick, color, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] rounded-md px-2.5 py-1 border transition-colors"
      style={activo ? { backgroundColor: color + '2e', borderColor: color, color } : { borderColor: '#2f3a4d', color: '#94a3b8' }}
    >
      {children}
    </button>
  );
}

/** Boxplot agrupado (Plotly type="box", boxmode="group"), separado en 3
 *  bloques por sección (Plataforma / Docente / Contenidos, ver
 *  SECCIONES_EVALUACION) -- dentro de cada bloque, un grupo de cajas por
 *  pregunta y una caja por categoría activa. Reemplaza el histograma de
 *  barras (que solo mostraba el promedio) por la distribución real
 *  (mediana, cuartiles, outliers), que es lo que de verdad distingue
 *  "todos calificaron 4" de "mitad puso 5, mitad puso 3". */
function BoxplotPreguntas({ series }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Cada caja muestra la distribución (mediana, cuartiles y valores atípicos) de esa pregunta para la categoría de su color, no solo el promedio.
      </p>
      {SECCIONES_EVALUACION.map((seccion) => (
        <BoxplotSeccion key={seccion.key} seccion={seccion} series={series} />
      ))}
    </div>
  );
}

function BoxplotSeccion({ seccion, series }) {
  const preguntas = useMemo(
    () => PREGUNTAS_LIKERT.filter((p) => seccion.keys.includes(p.key)),
    [seccion],
  );

  const data = useMemo(() => series.map((s) => {
    const x = [];
    const y = [];
    s.filas.forEach((fila) => {
      preguntas.forEach((p) => {
        const v = fila[p.key];
        if (typeof v === 'number') { x.push(p.label); y.push(v); }
      });
    });
    return {
      type: 'box',
      name: s.categoria_programa,
      x, y,
      marker: { color: COLOR_CATEGORIA[s.categoria_programa] || '#5b7fff' },
      boxpoints: 'outliers',
    };
  }), [series, preguntas]);

  const layout = useMemo(() => ({
    height: 320,
    boxmode: 'group',
    yaxis: { title: 'Puntaje', range: [0.5, 5.5], dtick: 1 },
    xaxis: {
      tickangle: -20,
      categoryorder: 'array',
      categoryarray: preguntas.map((p) => p.label),
    },
  }), [preguntas]);

  return (
    <div className="bg-ink-800 border rounded-md p-3" style={{ borderColor: seccion.color + '55', borderLeftWidth: 4, borderLeftColor: seccion.color }}>
      <p className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: seccion.color }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seccion.color }} />
        {seccion.titulo}
      </p>
      <PlotlyChart data={data} layout={layout} style={{ width: '100%', height: 320 }} />
    </div>
  );
}

/** Mapa de calor de correlación de Pearson entre las 13 preguntas Likert +
 *  NPS, sobre TODAS las categorías del mes (para tener la mayor muestra
 *  posible). Ayuda a ver, por ejemplo, si "dominio del docente" se mueve
 *  junto con el NPS o son cosas independientes. Se oculta con muestra
 *  chica porque un r calculado con pocos pares es prácticamente aleatorio. */
/** Fronteras (posiciones de eje categórico, 0-indexadas) entre secciones
 *  dentro de `claves` -- asume que `claves` viene en el orden
 *  Plataforma(2) + Docente(6) + Contenidos(5) + NPS(1), que es el orden en
 *  que se arma en Estadisticas() a partir de PREGUNTAS_LIKERT_KEYS. Se usan
 *  para dibujar líneas divisorias en el mapa de calor entre cada sección. */
function fronterasDeSecciones(claves) {
  const fronteras = [];
  let acumulado = 0;
  SECCIONES_EVALUACION.forEach((s) => {
    acumulado += s.keys.filter((k) => claves.includes(k)).length;
    fronteras.push(acumulado - 0.5);
  });
  return fronteras.slice(0, -1); // no hace falta línea al final del todo
}

function CorrelacionHeatmap({ matriz, claves, totalRespuestas }) {
  const etiquetas = claves.map((k) => ETIQUETA_CORTA[k] || k);
  const n = claves.length;

  const data = useMemo(() => (matriz ? [{
    type: 'heatmap',
    z: matriz,
    x: etiquetas,
    y: etiquetas,
    zmin: -1,
    zmax: 1,
    colorscale: 'RdBu',
    reversescale: true,
    hovertemplate: '%{y} × %{x}: r = %{z}<extra></extra>',
  }] : []), [matriz, etiquetas]);

  const layout = useMemo(() => {
    const fronteras = fronterasDeSecciones(claves);
    const shapes = fronteras.flatMap((f) => ([
      { type: 'line', xref: 'x', yref: 'paper', x0: f, x1: f, y0: 0, y1: 1, line: { color: 'rgba(226,232,240,0.55)', width: 2 } },
      { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: f, y1: f, line: { color: 'rgba(226,232,240,0.55)', width: 2 } },
    ]));
    return {
      height: 480,
      margin: { t: 24, r: 16, b: 90, l: 140 },
      xaxis: { tickangle: -45, range: [-0.5, n - 0.5] },
      yaxis: { autorange: 'reversed', range: [n - 0.5, -0.5] },
      shapes,
    };
  }, [claves, n]);

  return (
    <div className="bg-ink-800 border border-ink-600 rounded-md p-3">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <p className="text-xs text-slate-300">Correlación entre preguntas (todas las categorías del mes)</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {SECCIONES_EVALUACION.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              {s.titulo.replace('Satisfacción ', '')}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
            NPS
          </span>
        </div>
      </div>
      {matriz ? (
        <PlotlyChart data={data} layout={layout} style={{ width: '100%', height: 480 }} />
      ) : (
        <p className="text-xs text-slate-400">
          Se necesitan al menos {N_MINIMO_CORRELACION} respuestas en el mes para calcular correlaciones de forma confiable (hoy hay {totalRespuestas}).
        </p>
      )}
      <p className="text-[11px] text-slate-500 mt-2">
        Las líneas separan las secciones Plataforma / Docente / Contenidos / NPS. 1 = se mueven siempre juntas, -1 = siempre al contrario, 0 = sin relación. Correlación no implica causalidad.
      </p>
    </div>
  );
}

/** Tasa de participación (respuestas vs. cupos_activos) por categoría, con
 *  intervalo de confianza 95% de Wilson en vez del clásico normal -- con
 *  cupos chicos (10-30 estudiantes por grupo) el IC normal puede salir
 *  fuera de [0,100%], el de Wilson no. */
function Participacion({ stats }) {
  if (!stats || stats.length === 0) return null;
  return (
    <div className="bg-ink-800 border border-ink-600 rounded-md p-3">
      <p className="text-xs text-slate-300 mb-2">Participación (respuestas vs. cupos activos)</p>
      <div className="space-y-2">
        {stats.map((s) => {
          const ic = icWilson(s.respuestas_count, s.cupos_activos);
          const color = COLOR_CATEGORIA[s.categoria_programa] || '#5b7fff';
          const pct = s.participacion_pct ?? 0;
          return (
            <div key={s.categoria_programa} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {s.categoria_programa}
              </span>
              <div className="flex-1 h-3.5 rounded bg-ink-700 overflow-hidden relative">
                <div className="h-full rounded" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                {ic && (
                  <div
                    className="absolute top-0 h-full border-l border-r border-slate-100/50"
                    style={{ left: `${Math.min(ic.bajo * 100, 100)}%`, width: `${Math.max((ic.alto - ic.bajo) * 100, 0)}%` }}
                    title={`IC 95%: ${Math.round(ic.bajo * 1000) / 10}% – ${Math.round(ic.alto * 1000) / 10}%`}
                  />
                )}
              </div>
              <span className="w-40 shrink-0 text-right text-[11px] text-slate-400">
                {s.respuestas_count}/{s.cupos_activos || '—'} ({pct}%
                {ic ? ` · IC ${Math.round(ic.bajo * 1000) / 10}–${Math.round(ic.alto * 1000) / 10}` : ''})
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        La franja clara sobre la barra es el intervalo de confianza 95% (Wilson) -- con pocos cupos, la participación real puede variar bastante dentro de ese rango.
      </p>
    </div>
  );
}

/** Piso mínimo de respuestas para mostrar un promedio como si fuera
 *  confiable -- por debajo de esto (ej. Marketing con 1 grupo/1 docente) el
 *  número es ruido, no una medición, y publicarlo "crudo" es engañoso
 *  (riesgo detectado por Opus 2026-08-26: con 4-12 respuestas por celda,
 *  cualquier promedio puntual es poco confiable). Se puede subir cuando
 *  crezca el volumen real de respuestas. */
const N_MINIMO_CONFIABLE = 5;

function TarjetaResumen({ titulo, color, resumen }) {
  const muestraChica = resumen.respuestas > 0 && resumen.respuestas < N_MINIMO_CONFIABLE;
  return (
    <div className="bg-ink-800 border border-ink-600 rounded-md p-3">
      <div className="flex items-center gap-1.5 text-sm text-slate-200 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {titulo}
        {muestraChica && (
          <span
            className="text-[10px] font-medium text-amber-300 bg-amber-950/40 border border-amber-800 rounded px-1.5 py-0.5"
            title={`Menos de ${N_MINIMO_CONFIABLE} respuestas -- el promedio puede no ser representativo.`}
          >
            ⚠ muestra chica
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-slate-100">{muestraChica ? '—' : (resumen.promedio_general ?? '—')}</div>
          <div className="text-[11px] text-slate-400">Promedio /5</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100">{muestraChica ? '—' : (resumen.promedio_nps ?? '—')}</div>
          <div className="text-[11px] text-slate-400">NPS /10</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100">{resumen.respuestas}</div>
          <div className="text-[11px] text-slate-400">Respuestas</div>
        </div>
      </div>
      {muestraChica && (
        <p className="text-[10px] text-amber-400/80 mt-2">
          Con menos de {N_MINIMO_CONFIABLE} respuestas no mostramos el promedio -- muy pocas evaluaciones para que sea representativo.
        </p>
      )}
    </div>
  );
}

function EvaluacionesActivas({ meses, activos, onToggle }) {
  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-100">Evaluaciones activas</h2>
      {meses.length === 0 && <p className="text-xs text-slate-400">No hay meses con grupos todavía.</p>}
      <div className="space-y-2">
        {meses.map((mes) => (
          <div key={mes} className="flex items-center justify-between bg-ink-800 border border-ink-600 rounded-md px-3 py-2">
            <span className="text-sm text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorDeMes(mes) }} />
              {mes}
            </span>
            <div className="flex items-center gap-2">
              <span className={'text-xs font-medium ' + (activos[mes] ? 'text-accent-300' : 'text-slate-500')}>
                {activos[mes] ? 'Activado' : 'Desactivado'}
              </span>
              <Switch activo={!!activos[mes]} onClick={() => onToggle(mes)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinksPorCategoriaYMes({ meses }) {
  const [copiado, setCopiado] = useState(null);

  function copiarLink(url, id) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1500);
    });
  }

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-100">Links por categoría + mes</h2>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {meses.map((mes) => {
          const color = colorDeMes(mes);
          return (
            <details key={mes} className="group rounded-md border border-ink-600 overflow-hidden" open={meses.length === 1}>
              <summary
                className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none bg-ink-800 hover:bg-ink-700 transition-colors list-none"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <span className="text-sm text-slate-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {mes}
                </span>
                <span className="text-slate-500 text-xs transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-2 p-2 bg-ink-900">
                {CATEGORIAS_EVALUACION_DOCENTE.map((categoria) => {
                  const url = `${window.location.origin}/evaluar/${slug(categoria)}/${slug(mes)}`;
                  const id = `${categoria}-${mes}`;
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 bg-ink-800 border border-ink-600 rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200">{categoria}</div>
                        <div className="text-xs text-slate-500 truncate">{url}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copiarLink(url, id)}
                        className="shrink-0 text-xs text-slate-300 border border-ink-600 rounded-md px-2.5 py-1.5 hover:bg-ink-700 transition-colors"
                      >
                        {copiado === id ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function Switch({ activo, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={onClick}
      className={
        'relative inline-flex shrink-0 w-11 h-6 rounded-full border transition-colors cursor-pointer ' +
        (activo ? 'bg-accent-500 border-accent-500' : 'bg-ink-700 border-ink-500')
      }
    >
      <span
        className={
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ' +
          (activo ? 'translate-x-5' : 'translate-x-0.5')
        }
      />
    </button>
  );
}

/* ============================================================================
 *  Ranking Docente — 2026-09-01, a pedido del usuario: sección nueva para
 *  "entender a los docentes", inspirada en una hoja institucional de
 *  ranking de desempeño (6 criterios ponderados) de la que hoy solo
 *  podemos calcular 1: "Evaluación Docente (Estudiantes)" -- exactamente
 *  el promedio de las 6 preguntas del bloque Docente que ya recolectamos.
 *  Los otros 5 criterios (Asistencia, Aprobación, Cierre de notas,
 *  Estrategias, Participación en reuniones) viven en otros sistemas, no
 *  están acá todavía -- por eso NO se arma una "calificación" ponderada
 *  compuesta, solo indicadores descriptivos de lo que sí tenemos.
 *
 *  Diseño validado con una propuesta de Fable (2026-09-01) antes de
 *  construir: esto es un panel de ACOMPAÑAMIENTO, no una tabla de
 *  posiciones -- cada docente se compara contra sí mismo y contra el
 *  promedio institucional, nunca contra sus compañeros ordenados. La
 *  lista de abajo va alfabética a propósito, no por desempeño.
 * ==========================================================================*/

/** Docentes "placeholder" que no son personas reales (docentes genéricos
 *  de inducción, suplencias sin asignar, etc.) -- se excluyen del ranking
 *  de raíz. Lista manual por ahora (v1); cuando exista un catálogo real
 *  de docentes en Supabase, esto se reemplaza por un flag en esa tabla en
 *  vez de comparar nombres a mano. */
const DOCENTES_EXCLUIDOS_RANKING = new Set(['Docente Inducción']);

/** Umbral de muestra para RANKING INDIVIDUAL -- más estricto que
 *  N_MINIMO_CONFIABLE (=5, pensado para categorías de programa completas
 *  con muchos estudiantes detrás). Comparar personas por nombre con pocas
 *  respuestas es mucho más riesgoso que comparar categorías -- 2-3
 *  estudiantes descontentos (o contentos) pueden hundir/inflar a alguien
 *  injustamente. Por debajo de N_MIN_DOCENTE_OCULTO el docente ni aparece
 *  en la lista; entre ese piso y N_MIN_DOCENTE_CONFIABLE aparece marcado
 *  "muestra en construcción". */
const N_MIN_DOCENTE_OCULTO = 5;
const N_MIN_DOCENTE_CONFIABLE = 15;

/** Agrupa las filas crudas (traen docente/materia/comentario desde
 *  2026-09-01, ver "Calcular Stats" del workflow del panel) por docente,
 *  calculando lo que la ficha necesita. Excluye placeholders y filas sin
 *  nombre de docente. */
function construirRankingDocentes_(crudo, cuposEsperadosPorDocente) {
  const mapa = {};
  (crudo || []).forEach((grupo) => {
    (grupo.filas || []).forEach((f) => {
      const nombre = (f.docente || '').trim();
      if (!nombre || DOCENTES_EXCLUIDOS_RANKING.has(nombre)) return;
      if (!mapa[nombre]) mapa[nombre] = { nombre, areas: new Set(), materias: new Set(), filas: [] };
      if (grupo.categoria_programa) mapa[nombre].areas.add(grupo.categoria_programa);
      if (f.materia) mapa[nombre].materias.add(f.materia);
      mapa[nombre].filas.push({ ...f, mes_calificacion: grupo.mes_calificacion });
    });
  });

  return Object.values(mapa).map((d) => {
    const total = d.filas.length;
    const promedioDocente = calcularPromedioClaves(d.filas, SECCION_DOCENTE.keys);
    const porPregunta = {};
    SECCION_DOCENTE.keys.forEach((k) => { porPregunta[k] = calcularPromedioClaves(d.filas, [k]); });
    const conComentario = d.filas.filter((f) => f.docente_comentarios);
    const longitudPromedio = conComentario.length
      ? Math.round(conComentario.reduce((s, f) => s + f.docente_comentarios.length, 0) / conComentario.length)
      : null;
    const confiabilidad = total < N_MIN_DOCENTE_OCULTO ? 'oculto' : total < N_MIN_DOCENTE_CONFIABLE ? 'construccion' : 'confiable';
    const cuposEsperados = cuposEsperadosPorDocente?.[d.nombre] ?? null;
    return {
      nombre: d.nombre,
      areas: Array.from(d.areas).sort(),
      materias: Array.from(d.materias).sort(),
      filas: d.filas,
      totalRespuestas: total,
      cuposEsperados,
      promedioDocente,
      porPregunta,
      comentarios: { conteo: conComentario.length, longitudPromedio },
      confiabilidad,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Suma cupos_activos por docente para el recorte de mes actual (o para
 *  todos los meses acumulados si mesSeleccionado === 'TODOS') -- 2026-09-07,
 *  a pedido del usuario: "necesito que al lado de Respuestas aparezca la
 *  cantidad de estudiantes que esperábamos que se respondiera, eso lo
 *  sabemos con los cupos". cuposDocente viene del webhook ya agregado por
 *  docente+mes (ver "Calcular Stats" del workflow del panel), cruzando por
 *  nombre exacto contra tutor_calendario -- un docente cuyo nombre en las
 *  respuestas no calce EXACTO con tutor_calendario (typo, variante) queda
 *  sin match acá y se muestra como "—" en vez de un número engañoso. */
function cuposEsperadosPorDocente_(cuposDocente, mesSeleccionado) {
  const mapa = {};
  (cuposDocente || []).forEach((c) => {
    if (mesSeleccionado !== 'TODOS' && c.mes_calificacion !== mesSeleccionado) return;
    mapa[c.docente] = (mapa[c.docente] || 0) + (c.cupos_activos || 0);
  });
  return mapa;
}

/** "TODOS" (agregado histórico completo) + cada mes presente en crudo, en
 *  orden de calendario -- 2026-09-04, a pedido del usuario: poder ver el
 *  Ranking Docente de UN mes puntual, no solo el acumulado desde Agosto
 *  ("hasta ahora está muy general"). Ordena por índice en MESES_ES, no
 *  alfabético (para que Agosto salga antes que Septiembre). */
function mesesDisponiblesRanking_(crudo) {
  const set = new Set((crudo || []).map((g) => g.mes_calificacion).filter(Boolean));
  return Array.from(set).sort((a, b) => MESES_ES.indexOf(a) - MESES_ES.indexOf(b));
}

function RankingDocente({ incluirModulo0 }) {
  const [crudo, setCrudo] = useState(null);
  const [cuposDocente, setCuposDocente] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [mesSeleccionado, setMesSeleccionado] = useState('TODOS');

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const { crudo, cuposDocente } = await fetchStatsYCrudo();
        if (vivo) { setCrudo(crudo); setCuposDocente(cuposDocente); }
      } catch (e) {
        if (vivo) setError(e.message || String(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const mesesDisponibles = useMemo(() => mesesDisponiblesRanking_(crudo), [crudo]);
  // 2026-09-09: mismo filtro global de Módulo 0 que Grupos/Estadísticas,
  // aplicado en el mismo paso que ya filtraba por mes (ver
  // filtrarCrudoModulo0_ más arriba en el archivo).
  const crudoFiltrado = useMemo(() => {
    const porMes = mesSeleccionado === 'TODOS' ? crudo : (crudo || []).filter((g) => g.mes_calificacion === mesSeleccionado);
    return filtrarCrudoModulo0_(porMes, incluirModulo0);
  }, [crudo, mesSeleccionado, incluirModulo0]);
  const cuposPorDocente = useMemo(() => cuposEsperadosPorDocente_(cuposDocente, mesSeleccionado), [cuposDocente, mesSeleccionado]);

  const docentes = useMemo(() => construirRankingDocentes_(crudoFiltrado, cuposPorDocente), [crudoFiltrado, cuposPorDocente]);
  const visibles = useMemo(() => docentes.filter((d) => d.confiabilidad !== 'oculto'), [docentes]);
  const ocultosCount = docentes.length - visibles.length;
  const promedioInstitucional = useMemo(() => {
    const todas = (crudoFiltrado || []).flatMap((g) => g.filas || []);
    const porPregunta = {};
    SECCION_DOCENTE.keys.forEach((k) => { porPregunta[k] = calcularPromedioClaves(todas, [k]); });
    return porPregunta;
  }, [crudoFiltrado]);

  const docenteActivo = visibles.find((d) => d.nombre === seleccionado) || null;
  const estiloPanel = estiloPanelSeccion_(COLOR_SECCION_RANKING);

  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>;
  if (error) {
    return <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md p-3 border" style={estiloPanel}>
        <p className="text-sm font-semibold mb-1" style={{ color: COLOR_SECCION_RANKING }}>Ranking Docente</p>
        <p className="text-xs text-slate-400">
          Panel de acompañamiento, no una tabla de posiciones: cada docente se compara contra sí mismo y contra el promedio institucional, nunca contra sus compañeros. Datos desde Agosto 2026 (las respuestas que nosotros mismos recolectamos).{' '}
          {mesSeleccionado === 'TODOS'
            ? 'Mostrando el acumulado de todos los meses'
            : `Mostrando solo ${mesSeleccionado}`} — con menos de {N_MIN_DOCENTE_OCULTO} respuestas (en ese recorte) un docente todavía no aparece acá{ocultosCount > 0 ? ` (${ocultosCount} en ese caso ahora mismo)` : ''}; entre {N_MIN_DOCENTE_OCULTO} y {N_MIN_DOCENTE_CONFIABLE} se marca "⚠ muestra en construcción".
        </p>
      </div>

      <div className="rounded-md p-3 border" style={estiloPanel}>
        <p className="text-xs text-slate-400 mb-2">Mes que se está evaluando</p>
        <div className="flex flex-wrap gap-2">
          {['TODOS', ...mesesDisponibles].map((mes) => {
            const color = mes === 'TODOS' ? COLOR_SECCION_RANKING : colorDeMes(mes);
            const activo = mesSeleccionado === mes;
            return (
              <button
                key={mes}
                type="button"
                onClick={() => setMesSeleccionado(mes)}
                className="text-sm rounded-md px-3 py-1.5 border transition-colors flex items-center gap-1.5"
                style={activo ? { backgroundColor: color + '26', borderColor: color, color } : { borderColor: '#2f3a4d', color: '#cbd5e1' }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {mes === 'TODOS' ? 'Todos los meses' : mes}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto" style={estiloPanel}>
        <table className="text-xs w-full whitespace-nowrap border-collapse">
          <thead>
            <tr>
              <Th>Docente</Th>
              <Th>Área(s)</Th>
              <Th right>Respuestas</Th>
              <Th right>Esperadas</Th>
              <Th right>Promedio Docente</Th>
              <th className="py-1.5 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-slate-500">Todavía no hay docentes con suficientes respuestas acumuladas.</td></tr>
            )}
            {visibles.map((d) => {
              const enConstruccion = d.confiabilidad === 'construccion';
              const activo = d.nombre === seleccionado;
              return (
                <tr
                  key={d.nombre}
                  className={'border-t border-ink-700 cursor-pointer transition-colors ' + (activo ? 'bg-ink-700/50' : 'hover:bg-ink-800/60')}
                  onClick={() => setSeleccionado(activo ? null : d.nombre)}
                >
                  <Td>{d.nombre}</Td>
                  <Td>{d.areas.join(' · ') || '—'}</Td>
                  <Td right>{d.totalRespuestas}</Td>
                  <Td right>
                    <span title={d.cuposEsperados ? `Suma de cupos activos de los grupos de este docente (según Tutor Calendario)` : 'No encontramos cupos activos para cruzar contra este docente (nombre no calza exacto con Tutor Calendario)'}>
                      {d.cuposEsperados || '—'}
                    </span>
                  </Td>
                  <Td right>
                    <span className="inline-flex items-center gap-1 justify-end">
                      {comaDecimal_((d.promedioDocente ?? 0).toFixed(2))}
                      {enConstruccion && (
                        <span className="text-amber-400" title={`Entre ${N_MIN_DOCENTE_OCULTO} y ${N_MIN_DOCENTE_CONFIABLE} respuestas -- muestra en construcción`}>⚠</span>
                      )}
                    </span>
                  </Td>
                  <td className="py-1.5 pr-3 text-right text-accent-400">{activo ? '▾' : '▸'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {docenteActivo && (
        <FichaDocente
          docente={docenteActivo}
          promedioInstitucional={promedioInstitucional}
          enConstruccion={docenteActivo.confiabilidad === 'construccion'}
          mesSeleccionado={mesSeleccionado}
        />
      )}
    </div>
  );
}

function FichaDocente({ docente, promedioInstitucional, enConstruccion, mesSeleccionado }) {
  const etiquetaPeriodo = mesSeleccionado === 'TODOS' ? 'todos los meses acumulados' : mesSeleccionado;
  const dataPreguntas = useMemo(() => {
    const labels = SECCION_DOCENTE.keys.map((k) => ETIQUETA_CORTA[k] || k);
    const valoresDocente = SECCION_DOCENTE.keys.map((k) => docente.porPregunta[k]);
    const valoresInstitucional = SECCION_DOCENTE.keys.map((k) => promedioInstitucional[k]);
    return [
      {
        type: 'bar', orientation: 'h', name: docente.nombre, y: labels, x: valoresDocente,
        marker: { color: SECCION_DOCENTE.color },
        text: etiquetasDecimal_(valoresDocente), textposition: 'outside', textfont: { color: SECCION_DOCENTE.color, size: 10 },
      },
      {
        type: 'bar', orientation: 'h', name: 'Promedio institucional', y: labels, x: valoresInstitucional,
        marker: { color: '#4a5875' },
        text: etiquetasDecimal_(valoresInstitucional), textposition: 'outside', textfont: { color: '#94a3b8', size: 10 },
      },
    ];
  }, [docente, promedioInstitucional]);

  const layoutPreguntas = useMemo(() => ({
    height: 300,
    margin: { t: 24, r: 40, b: 32, l: 140 },
    separators: ',.',
    barmode: 'group',
    xaxis: { title: 'Promedio /5', range: [0, 5.6] },
    legend: { orientation: 'h', y: -0.18 },
  }), []);

  const distribucion = useMemo(() => {
    const conteos = [0, 0, 0, 0, 0];
    docente.filas.forEach((f) => {
      const prom = calcularPromedioClaves([f], SECCION_DOCENTE.keys);
      if (typeof prom === 'number') {
        const bucket = Math.min(5, Math.max(1, Math.round(prom)));
        conteos[bucket - 1] += 1;
      }
    });
    return conteos;
  }, [docente]);

  const dataDistribucion = useMemo(() => [{
    type: 'bar', x: ['1', '2', '3', '4', '5'], y: distribucion,
    marker: { color: SECCION_DOCENTE.color },
    text: distribucion.map(String), textposition: 'outside',
  }], [distribucion]);

  const layoutDistribucion = useMemo(() => ({
    height: 220,
    margin: { t: 16, r: 16, b: 32, l: 40 },
    separators: ',.',
    xaxis: { title: 'Promedio de esa respuesta, redondeado (1-5)' },
    yaxis: { title: 'Respuestas' },
  }), []);

  const materiasDetalle = useMemo(() => docente.materias.map((materia) => {
    const filasMateria = docente.filas.filter((f) => f.materia === materia);
    return { materia, n: filasMateria.length, promedio: calcularPromedioClaves(filasMateria, SECCION_DOCENTE.keys) };
  }), [docente]);

  return (
    <div className="rounded-md p-4 border space-y-4" style={estiloPanelSeccion_(COLOR_SECCION_RANKING)}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">{docente.nombre}</p>
          <p className="text-xs text-slate-400">
            {docente.areas.join(' · ')} · {docente.totalRespuestas} respuesta(s)
            {docente.cuposEsperados ? ` de ${docente.cuposEsperados} estudiante(s) esperado(s) (${Math.round((docente.totalRespuestas / docente.cuposEsperados) * 1000) / 10}%)` : ''}
          </p>
        </div>
        {enConstruccion && (
          <span className="text-[11px] font-medium text-amber-300 bg-amber-950/40 border border-amber-800 rounded px-2 py-1">
            ⚠ Muestra en construcción -- menos de {N_MIN_DOCENTE_CONFIABLE} respuestas acumuladas, estos números todavía pueden moverse mucho con cada respuesta nueva.
          </span>
        )}
      </div>

      <div className="bg-ink-800 border border-ink-600 rounded-md p-3">
        <p className="text-xs text-slate-300 mb-2">Bloque Docente, pregunta por pregunta -- vs. promedio institucional ({etiquetaPeriodo})</p>
        <PlotlyChart data={dataPreguntas} layout={layoutPreguntas} style={{ width: '100%', height: 300 }} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-ink-800 border border-ink-600 rounded-md p-3">
          <p className="text-xs text-slate-300 mb-2">Distribución de respuestas (detecta polarización, no solo el promedio)</p>
          <PlotlyChart data={dataDistribucion} layout={layoutDistribucion} style={{ width: '100%', height: 220 }} />
        </div>

        <div className="bg-ink-800 border border-ink-600 rounded-md p-3 space-y-3">
          {materiasDetalle.length > 1 && (
            <div>
              <p className="text-xs text-slate-300 mb-1.5">Por materia</p>
              <table className="text-xs w-full">
                <tbody>
                  {materiasDetalle.map((m) => (
                    <tr key={m.materia} className="border-t border-ink-700">
                      <Td>{m.materia}</Td>
                      <Td right>{m.n} resp.</Td>
                      <Td right>{comaDecimal_((m.promedio ?? 0).toFixed(2))}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-300 mb-1">Comentarios de estudiantes</p>
            {docente.comentarios.conteo > 0 ? (
              <p className="text-xs text-slate-400">
                {docente.comentarios.conteo} de {docente.totalRespuestas} respuesta(s) incluyeron un comentario (largo promedio ~{docente.comentarios.longitudPromedio} caracteres). El contenido no se muestra acá todavía -- queda pendiente para una fase futura, con más volumen y acceso restringido.
              </p>
            ) : (
              <p className="text-xs text-slate-500">Sin comentarios registrados todavía.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
