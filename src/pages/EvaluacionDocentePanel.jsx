import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  recargarDirectorioDocente,
  indexarDirectorioPorNombre,
  fetchCantEstListasPorGrupo,
  urlSisGrupo,
  enviarReporteGestion,
  enviarAlertaCierre,
  fetchAnalisisCualitativo,
  fetchCualitativoPendientes,
  fetchRecalcularMesCualitativo,
  fetchMatrizPromedio,
  fetchEstadoMesesCualitativo,
  TEMAS_CUALITATIVO,
  RAMAS_CUALITATIVO,
  CAMPOS_CUALITATIVO,
  SENTIMIENTOS_CUALITATIVO,
  fetchAlertasCierre,
  formatearFechaDDMMYYYY,
  fetchMesesActivosMapa,
  fetchMesesDisponibles,
  fetchStatsYCrudo,
  fetchConteosRespuestas,
  fetchRespuestasErradasDetalle,
  corregirRespuesta,
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

const VISTAS = { TABLA: 'tabla', ESTADISTICAS: 'estadisticas', CUALITATIVO: 'cualitativo', RANKING: 'ranking', ALERTAS: 'alertas' };

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
  // Fuerza el remount (y por lo tanto el refetch de Supabase) de la vista
  // activa -- 2026-09-14, a pedido del usuario tras ver "Cant. est. listas"
  // y "Asist. ≥1" en — aunque el dato ya estaba en Supabase: la página
  // simplemente no había vuelto a leer desde que cargó. Cambiar la key de
  // la vista activa la remonta sin recargar todo el navegador.
  const [recargaKey, setRecargaKey] = useState(0);

  async function cargarMeses() {
    const [mesesData, activosData] = await Promise.all([fetchMesesDisponibles(), fetchMesesActivosMapa()]);
    // Orden CRONOLÓGICO (por índice en MESES_ES), no alfabético -- 2026-09-08,
    // bug reportado por el usuario: con .sort() por defecto "Octubre" queda
    // antes que "Septiembre" (O < S alfabéticamente). Mismo criterio que ya
    // usa mesesDisponiblesRanking_ en Ranking Docente.
    setMeses([...mesesData].sort((a, b) => MESES_ES.indexOf(a) - MESES_ES.indexOf(b)));
    setActivos(activosData);
  }

  useEffect(() => {
    (async () => {
      try {
        await cargarMeses();
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  async function onRefrescarVista() {
    await cargarMeses().catch((e) => setError(e.message || String(e)));
    setRecargaKey((k) => k + 1);
  }

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
    <BarraSincronizacion onRefrescarVista={onRefrescarVista} />
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
        {vista === VISTAS.TABLA && <TablaGrupos key={recargaKey} meses={meses} activos={activos} incluirModulo0={incluirModulo0} />}
        {vista === VISTAS.ESTADISTICAS && <Estadisticas key={recargaKey} meses={meses} incluirModulo0={incluirModulo0} />}
        {vista === VISTAS.CUALITATIVO && <Cualitativo key={recargaKey} />}
        {vista === VISTAS.RANKING && <RankingDocente key={recargaKey} incluirModulo0={incluirModulo0} />}
        {vista === VISTAS.ALERTAS && <VistaAlertasCierre key={recargaKey} />}
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
function BarraSincronizacion({ onRefrescarVista }) {
  const [ultimoSync, setUltimoSync] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [recargandoDir, setRecargandoDir] = useState(false);
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

  async function onClickRecargarDir() {
    setError(null);
    setRecargandoDir(true);
    try {
      await recargarDirectorioDocente();
      await onRefrescarVista();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRecargandoDir(false);
    }
  }

  async function onClickRefrescar() {
    setError(null);
    setRefrescando(true);
    try {
      await onRefrescarVista();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRefrescando(false);
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
        <button
          type="button"
          disabled={refrescando}
          onClick={onClickRefrescar}
          title="Vuelve a leer Supabase (respuestas, listas, cupos, alertas...) sin re-sincronizar. Útil si otra app (ej. Asistencia y Aprobación) acaba de actualizar un dato y esta página lo sigue mostrando viejo."
          className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-ink-700 hover:border-ink-500 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {refrescando ? <IconoSpinner /> : <IconoSync />}
          <span>Refrescar vista</span>
        </button>
        <button
          type="button"
          disabled={recargandoDir}
          onClick={onClickRecargarDir}
          title="Vuelve a leer la hoja TUTORES-BASE DE DIRECTORIO y actualiza el directorio compartido entre las apps"
          className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-ink-700 hover:border-ink-500 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {recargandoDir ? <IconoSpinner /> : <IconoSync />}
          <span>Recargar directorio</span>
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5">
        "Actualizar datos de grupos" trae de nuevo la hoja "ENCUESTAS DE SATISFACCION" a Supabase. "Refrescar vista" solo vuelve a leer lo que ya hay en Supabase (sin disparar ningún sync) -- úsalo si ves guiones (—) en Cant. est. listas / Asist. ≥1 u otro dato que sospechas que ya se actualizó en otra app pero esta pantalla todavía no.
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
    { id: VISTAS.ESTADISTICAS, label: 'Estadísticas Cuantitativas', icono: '📊' },
    { id: VISTAS.CUALITATIVO, label: 'Estadísticas Cualitativas', icono: '💬' },
    { id: VISTAS.RANKING, label: 'Ranking Docente', icono: '🏅' },
    { id: VISTAS.ALERTAS, label: 'Alertas de cierre', icono: '📣' },
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
  respuestas_brutas: { t: 'Resp. brutas', center: true, punto: '#cbd5e1', tip: 'Todas las respuestas de esta materia en su carrera y mes, sin importar qué docente eligió el estudiante.' },
  respuestas: { t: 'Resp. del grupo', center: true, punto: '#34d399', tip: 'Respuestas de esta materia con el tutor de este grupo. Es el número que cuenta para el grupo.' },
  respuestas_erradas: { t: 'Resp. erradas', center: true, punto: '#fbbf24', tip: 'Respuestas que no cuentan para ningún grupo: (1) eligieron esta materia con un docente que no la dicta, o (2) eligieron a este tutor con una materia que no dicta este mes. Clic en el número para ver el detalle y corregirlas.' },
  estado_materia: { t: 'Estado', center: true },
  alerta_cierre: { t: 'Gestión', center: true },
};

const GRUPOS_COL_DEF = [
  { id: 'ident', label: 'Identificación', color: '#94a3b8', cols: ['id_grupo_mapeo', 'materia', 'mes_calificacion'] },
  { id: 'acad', label: 'Detalle académico', color: '#a78bfa', cols: ['horario', 'fecha_calendario_inicio', 'fecha_calendario_fin', 'group_id', 'section_id'] },
  { id: 'docente', label: 'Docente', color: '#38bdf8', cols: ['tutor_calendario'] },
  { id: 'cupos', label: 'Seguimiento', color: '#34d399', cols: ['cupos_activos', 'cantidad_estudiantes_listas', 'asistentes_min_1_sesion'] },
  // 2026-10-15, a pedido del usuario: las respuestas + estado + gestión van
  // en su propio grupo del acordeón, separado de cupos/lista/asistencia.
  { id: 'resp', label: 'Respuestas y gestión', color: '#fbbf24', cols: ['respuestas_brutas', 'respuestas', 'respuestas_erradas', 'estado_materia', 'alerta_cierre'] },
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
function claveRespuestas_(categoria, mes, materia, tutor) {
  // 2026-10-15, a pedido del usuario: las respuestas de un grupo son las de
  // SU materia con SU tutor ("el tutor específico de esa materia"). Antes se
  // contaba por categoría+mes+materia, así que dos grupos de la misma
  // materia con distinto docente mostraban el MISMO total (ej. GA1300 de
  // Jose W Roa mostraba 43 cuando nadie lo eligió: eran 37 de Zully Matiz +
  // 6 a docentes que no dictan esa materia). La materia se compara con
  // claveMateria_ (ignora códigos/puntuación, igual que el Ranking).
  return normalizar(categoria) + '|' + normalizar(mes) + '|' + claveMateria_(materia) + '|' + normalizar(tutor);
}

/** conteos (fetchConteosRespuestas, por categoria+mes+materia+docente) ->
 *  { claveRespuestas_: n }. Se suma porque dos materias con distinta
 *  tilde/espacios caen en la misma clave. */
function mapaDeConteos_(conteos) {
  const m = {};
  (conteos || []).forEach((c) => {
    const k = claveRespuestas_(c.categoria_programa, c.mes_calificacion, c.materia, c.docente);
    m[k] = (m[k] || 0) + (c.respuestas || 0);
  });
  return m;
}

function claveMateriaCarreraMes_(categoria, mes, materia) {
  return normalizar(categoria) + '|' + normalizar(mes) + '|' + claveMateria_(materia);
}

function claveDocenteCarreraMes_(categoria, mes, docente) {
  return normalizar(categoria) + '|' + normalizar(mes) + '|' + normalizar(docente);
}

/** "Materia errada" (2026-10-16): respuestas que NO calzan con ningún grupo
 *  y cuyo docente SÍ es tutor de algún grupo en esa carrera+mes (o sea, el
 *  docente es real y está asignado, pero la materia que pusieron no es suya),
 *  agrupadas por carrera+mes+docente -> { n, porMateria }. Se excluyen los
 *  docentes comodín ("Docente Inducción"): figuran en la base con Módulo 0 y
 *  sus respuestas erradas son de docente equivocado, no de materia. */
function respuestasSinGrupoPorDocente_(conteos, filasBase) {
  const validas = new Set((filasBase || []).map((f) => claveRespuestas_(f.categoria_programa, f.mes_calificacion, f.materia, f.tutor_calendario)));
  const tutores = new Set((filasBase || [])
    .filter((f) => f.tutor_calendario && !esDocentePlaceholder_(f.tutor_calendario))
    .map((f) => claveDocenteCarreraMes_(f.categoria_programa, f.mes_calificacion, f.tutor_calendario)));
  const m = {};
  (conteos || []).forEach((c) => {
    if (!c.docente || esDocentePlaceholder_(c.docente)) return;
    if (validas.has(claveRespuestas_(c.categoria_programa, c.mes_calificacion, c.materia, c.docente))) return;
    const k = claveDocenteCarreraMes_(c.categoria_programa, c.mes_calificacion, c.docente);
    if (!tutores.has(k)) return;
    if (!m[k]) m[k] = { n: 0, porMateria: {} };
    m[k].n += c.respuestas || 0;
    const mat = (c.materia || 'sin materia').trim();
    m[k].porMateria[mat] = (m[k].porMateria[mat] || 0) + (c.respuestas || 0);
  });
  return m;
}

/** Respuestas cuya combinación materia+docente NO corresponde a ningún grupo
 *  de la base (el estudiante eligió un docente que no dicta esa materia),
 *  agrupadas por categoria+mes+materia -> { n, porDocente: {docente: n} }.
 *  No se le suman a ningún grupo; se muestran como "+N" en los grupos de
 *  esa materia para que no se pierdan. */
function respuestasSinGrupo_(conteos, filasBase) {
  const validas = new Set((filasBase || []).map((f) => claveRespuestas_(f.categoria_programa, f.mes_calificacion, f.materia, f.tutor_calendario)));
  const m = {};
  (conteos || []).forEach((c) => {
    if (validas.has(claveRespuestas_(c.categoria_programa, c.mes_calificacion, c.materia, c.docente))) return;
    const k = claveMateriaCarreraMes_(c.categoria_programa, c.mes_calificacion, c.materia);
    if (!m[k]) m[k] = { n: 0, porDocente: {} };
    m[k].n += c.respuestas || 0;
    const d = (c.docente || 'sin docente').trim();
    m[k].porDocente[d] = (m[k].porDocente[d] || 0) + (c.respuestas || 0);
  });
  return m;
}

const GRUPOS_COL_ABIERTOS_INICIAL = new Set(['ident', 'docente', 'cupos', 'resp']); // "acad" arranca plegado (es la más ancha)

function celdaGrupo_(f, key) {
  const def = COLDEF_GRUPOS[key];
  const v = f[key];
  if (v == null || v === '') return '—';
  return def.fmt ? def.fmt(v) : String(v);
}

/** Desde este momento `respuestas_antes` (doc_alertas_cierre) se guarda con
 *  el conteo por materia+tutor; los registros anteriores tenían el total de
 *  toda la materia. ISO UTC, comparable con `creado_en`. */
const FECHA_CONTEO_POR_TUTOR = '2026-10-15T16:47:00';

/** Número de "Resp. brutas" (neutro, blanco) o "Resp. del grupo" (verde si
 *  hay, rojo suave si es 0 -- ese grupo no tiene ninguna respuesta propia),
 *  con el mismo ancho que la pastilla de erradas para que las tres columnas
 *  se lean alineadas. */
function PildoraRespuestas({ tipo, valor }) {
  const n = valor || 0;
  if (tipo === 'respuestas_brutas') {
    return <span className="inline-block min-w-[2.25rem] rounded-md px-2 py-0.5 font-medium text-slate-200 bg-slate-500/10 border border-slate-500/25">{n}</span>;
  }
  return n > 0
    ? <span className="inline-block min-w-[2.25rem] rounded-md px-2 py-0.5 font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40">{n}</span>
    : <span className="inline-block min-w-[2.25rem] rounded-md px-2 py-0.5 font-bold text-rose-300/90 bg-rose-500/10 border border-rose-500/30">0</span>;
}

/** "Resp. erradas" del grupo (2026-10-15/16). Suma DOS tipos de error:
 *  - docente errado: respuestas de la materia del grupo con un docente que no
 *    la dicta (son de la MATERIA: si dos grupos comparten materia, ambos las
 *    muestran);
 *  - materia errada: respuestas que eligieron al tutor del grupo (correcto)
 *    con una materia que él no dicta ese mes.
 *  0 = gris discreto; >0 = número clicable que abre el detalle. */
function CeldaRespuestasErradas({ f, lista, listaMateria }) {
  const [abierto, setAbierto] = useState(false);
  const n = f.respuestas_erradas || 0;
  if (!n) return <span className="inline-block min-w-[2.25rem] rounded-md px-2 py-0.5 text-slate-600">0</span>;
  const nDoc = f.respuestas_erradas_docente || 0;
  const nMat = f.respuestas_erradas_materia || 0;
  const ld = lista || (nDoc ? [f] : []);
  const lm = listaMateria || (nMat ? [f] : []);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center justify-center gap-1 min-w-[2.25rem] rounded-md px-2 py-0.5 font-bold text-amber-300 bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 transition-colors"
        title={`Ver el detalle: ${nDoc} con otro docente · ${nMat} con otra materia`}
      >
        {n} <span className="text-[10px] font-normal opacity-80">›</span>
      </button>
      {abierto && <ModalRespuestasErradas lista={ld} listaMateria={lm} f={f} onClose={() => setAbierto(false)} />}
    </>
  );
}

function fechaHoraCorta_(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

/** Botón "📋 Lista de clase" (o "sin lista"). */
function BotonListaClase({ url, titulo, compacto }) {
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 text-[11px] font-semibold rounded-md px-2 py-1 border border-sky-700/60 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20"
      title={titulo}
    >
      {compacto ? '📋' : '📋 Lista de clase'}
    </a>
  ) : (
    <span className="shrink-0 text-[11px] text-slate-600" title="Este grupo no tiene lista de clase registrada">sin lista</span>
  );
}

/** Ventana de respuestas erradas (2026-10-16, diseño pedido por el usuario):
 *  UNA tabla con todas las erradas del grupo (de los dos tipos) y, por fila,
 *  dos correcciones independientes -- "Corregir materia" y "Corregir
 *  docente" -- porque el error puede estar en cualquiera de los dos (o en
 *  ambos). La combinación elegida tiene que existir en doc_base_de_grupos
 *  (misma carrera+mes): se muestra el grupo resultante y Guardar solo se
 *  habilita si existe. `lista` = filas para buscar "docente errado" (una por
 *  carrera+materia), `listaMateria` = filas para "materia errada" (una por
 *  carrera+tutor); cada fila trae `grupos_carrera_mes` (todos los grupos de
 *  su carrera y mes). */
function ModalRespuestasErradas({ f, lista, listaMateria, onClose }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState({}); // respuesta_id -> { materia, docente }
  const [correcciones, setCorrecciones] = useState({}); // respuesta_id -> { estado, texto }

  const todas = [...lista, ...listaMateria];
  const carreras = Array.from(new Set(todas.map((x) => x.categoria_programa)));
  const variasCarreras = carreras.length > 1;
  // grupos de la base por carrera (para opciones y para resolver el grupo)
  const gruposDeCarrera = useMemo(() => {
    const m = {};
    todas.forEach((x) => { if (!m[x.categoria_programa]) m[x.categoria_programa] = x.grupos_carrera_mes || []; });
    return m;
    // eslint-disable-next-line
  }, []);
  // listas de clase relacionadas: grupos de esta materia + grupos de este tutor
  const relacionados = useMemo(() => {
    const out = [];
    const vistos = new Set();
    const add = (g, carrera) => { if (g.group_id && !vistos.has(g.group_id)) { vistos.add(g.group_id); out.push({ ...g, carrera }); } };
    todas.forEach((x) => (gruposDeCarrera[x.categoria_programa] || []).forEach((g) => {
      if (claveMateria_(g.materia) === claveMateria_(x.materia) || normalizar(g.tutor) === normalizar(x.tutor_calendario)) add(g, x.categoria_programa);
    }));
    return out.sort((a, b) => (a.materia + a.tutor).localeCompare(b.materia + b.tutor, 'es'));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    let vivo = true;
    const pedidos = [
      ...lista.map((x) => fetchRespuestasErradasDetalle({
        categoria: x.categoria_programa,
        mes: x.mes_calificacion,
        materia: x.materia,
        tutoresValidos: Array.from(new Set((x.tutores_materia || []).map((t) => t.tutor))),
      }).then((r) => r.map((fila) => ({ ...fila, carrera: x.categoria_programa })))),
      ...listaMateria.map((x) => fetchRespuestasErradasDetalle({
        modo: 'materia',
        categoria: x.categoria_programa,
        mes: x.mes_calificacion,
        docente: x.tutor_calendario,
        materiasValidas: (x.grupos_del_tutor || []).map((g) => g.materia),
      }).then((r) => r.map((fila) => ({ ...fila, carrera: x.categoria_programa })))),
    ];
    Promise.all(pedidos)
      .then((rs) => {
        if (!vivo) return;
        const vistos = new Set();
        const unicas = rs.flat().filter((r) => { const k = r.respuesta_id || JSON.stringify(r); if (vistos.has(k)) return false; vistos.add(k); return true; });
        setFilas(unicas.sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en))));
      })
      .catch((e) => { if (vivo) setError(e); });
    return () => { vivo = false; };
    // eslint-disable-next-line
  }, []);

  // helpers de opciones / resolución
  const materiasDe = (carrera) => {
    const m = new Map();
    (gruposDeCarrera[carrera] || []).forEach((g) => { const k = claveMateria_(g.materia); if (!m.has(k)) m.set(k, g.materia); });
    return Array.from(m.values()).sort((a, b) => a.localeCompare(b, 'es'));
  };
  const tutoresDe = (carrera, materia) => Array.from(new Set((gruposDeCarrera[carrera] || [])
    .filter((g) => materia && claveMateria_(g.materia) === claveMateria_(materia))
    .map((g) => g.tutor))).sort((a, b) => a.localeCompare(b, 'es'));
  const grupoDe = (carrera, materia, docente) => (gruposDeCarrera[carrera] || []).find((g) =>
    materia && docente && claveMateria_(g.materia) === claveMateria_(materia) && normalizar(g.tutor) === normalizar(docente));
  // valor inicial de cada fila = lo que eligió el estudiante (normalizado al nombre de la base)
  const valorDe = (r) => {
    if (sel[r.respuesta_id]) return sel[r.respuesta_id];
    const materia = materiasDe(r.carrera).find((m) => claveMateria_(m) === claveMateria_(r.materia)) || '';
    const docente = tutoresDe(r.carrera, materia).find((t) => normalizar(t) === normalizar(r.docente)) || '';
    return { materia, docente };
  };
  function cambiarMateria(r, materia) {
    const actual = valorDe(r);
    const tutores = tutoresDe(r.carrera, materia);
    const docente = tutores.find((t) => normalizar(t) === normalizar(actual.docente || r.docente)) || (tutores.length === 1 ? tutores[0] : '');
    setSel((p) => ({ ...p, [r.respuesta_id]: { materia, docente } }));
  }
  function cambiarDocente(r, docente) {
    setSel((p) => ({ ...p, [r.respuesta_id]: { ...valorDe(r), docente } }));
  }
  async function guardar(r) {
    const v = valorDe(r);
    const g = grupoDe(r.carrera, v.materia, v.docente);
    if (!g) return;
    setCorrecciones((p) => ({ ...p, [r.respuesta_id]: { estado: 'enviando' } }));
    try {
      const res = await corregirRespuesta({ respuestaId: r.respuesta_id, groupId: g.group_id });
      setCorrecciones((p) => ({ ...p, [r.respuesta_id]: { estado: 'ok', texto: `${res.materia || g.materia} · ${res.docente} · ${res.id_grupo_mapeo}` } }));
    } catch (e) {
      setCorrecciones((p) => ({ ...p, [r.respuesta_id]: { estado: 'error', texto: e.message } }));
    }
  }

  const repetidas = useMemo(() => {
    const c = {};
    (filas || []).forEach((r) => { if (r.cedula) c[r.cedula] = (c[r.cedula] || 0) + 1; });
    return new Set(Object.keys(c).filter((k) => c[k] > 1));
  }, [filas]);
  const correos = Array.from(new Set((filas || []).map((r) => r.correo).filter(Boolean)));

  // "Según lo que eligieron" (2026-10-16, a pedido del usuario): por cada
  // DOCENTE que eligieron los estudiantes, qué materias dicta en esa
  // carrera+mes; y por cada MATERIA elegida distinta a la de este grupo,
  // quién la dicta -- con sus listas de clase, para revisar si el estudiante
  // en realidad es de ese grupo.
  const segunEleccion = useMemo(() => {
    const docentes = new Map();
    const materias = new Map();
    (filas || []).forEach((r) => {
      const grupos = gruposDeCarrera[r.carrera] || [];
      if (r.docente) {
        const k = r.carrera + '|' + normalizar(r.docente);
        if (!docentes.has(k)) {
          docentes.set(k, { nombre: r.docente, carrera: r.carrera, n: 0, grupos: grupos.filter((g) => normalizar(g.tutor) === normalizar(r.docente)) });
        }
        docentes.get(k).n += 1;
      }
      if (r.materia && claveMateria_(r.materia) !== claveMateria_(f.materia)) {
        const k = r.carrera + '|' + claveMateria_(r.materia);
        if (!materias.has(k)) {
          materias.set(k, { nombre: r.materia, carrera: r.carrera, n: 0, grupos: grupos.filter((g) => claveMateria_(g.materia) === claveMateria_(r.materia)) });
        }
        materias.get(k).n += 1;
      }
    });
    return { docentes: Array.from(docentes.values()), materias: Array.from(materias.values()) };
    // eslint-disable-next-line
  }, [filas]);
  const hayCorregidas = Object.values(correcciones).some((c) => c.estado === 'ok');
  const selectCls = 'bg-ink-800 border border-ink-600 rounded px-1.5 py-1 text-xs text-slate-200 max-w-[230px]';

  return (
    <ModalRanking
      titulo={`Respuestas erradas · ${f.materia}`}
      subtitulo={`${carreras.join(' + ')} · ${f.mes_calificacion} · tutor ${f.tutor_calendario || '—'}`}
      ancho="max-w-[96rem]"
      onClose={onClose}
    >
      <p className="text-xs text-slate-400 mb-3">
        Estas respuestas no cuentan para ningún grupo: el estudiante combinó una materia y un docente que no corresponden. Corrige la <b className="text-slate-200">materia</b>, el <b className="text-slate-200">docente</b> o ambos; la combinación tiene que existir en la base de grupos. Se guarda lo que eligió el estudiante y quién corrigió.
      </p>

      <p className="text-[11px] text-slate-500 mb-2">Abre las listas de clase y busca el correo del estudiante con Ctrl+F para saber a qué grupo pertenece.</p>
      <div className="grid lg:grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-ink-600 bg-ink-800/50 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">De este grupo · materia y tutor ({relacionados.length})</p>
          <ul className="space-y-1.5 text-sm text-slate-200">
            {relacionados.map((g) => (
              <li key={g.group_id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{g.materia} <span className="text-slate-500 text-xs">· {g.tutor} · {g.grupo}{variasCarreras ? ' · ' + g.carrera : ''}</span></span>
                <BotonListaClase url={g.listaUrl} titulo={`Abrir la lista de clase de ${g.materia} con ${g.tutor} (${g.grupo})`} />
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/15 p-3">
          <p className="text-[11px] uppercase tracking-wider text-amber-400/80 mb-2">Según lo que eligieron los estudiantes</p>
          {filas == null ? (
            <p className="text-xs text-slate-500">Cargando…</p>
          ) : (
            <div className="space-y-3">
              {segunEleccion.docentes.map((d) => (
                <div key={d.carrera + d.nombre}>
                  <p className="text-xs text-slate-300 mb-1">
                    Docente elegido: <b className="text-amber-200">{d.nombre}</b> <span className="text-slate-500">· {d.n} resp.{variasCarreras ? ' · ' + d.carrera : ''}</span>
                  </p>
                  {d.grupos.length === 0 ? (
                    <p className="text-[11px] text-slate-500 pl-3">No dicta ninguna materia en {d.carrera} este mes.</p>
                  ) : (
                    <ul className="space-y-1 pl-3 text-sm text-slate-200">
                      {d.grupos.map((g) => (
                        <li key={g.group_id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">dicta {g.materia} <span className="text-slate-500 text-xs">· {g.grupo}</span></span>
                          <BotonListaClase url={g.listaUrl} titulo={`Abrir la lista de clase de ${g.materia} con ${g.tutor} (${g.grupo})`} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {segunEleccion.materias.map((m) => (
                <div key={m.carrera + m.nombre}>
                  <p className="text-xs text-slate-300 mb-1">
                    Materia elegida: <b className="text-amber-200">{m.nombre}</b> <span className="text-slate-500">· {m.n} resp.{variasCarreras ? ' · ' + m.carrera : ''}</span>
                  </p>
                  {m.grupos.length === 0 ? (
                    <p className="text-[11px] text-slate-500 pl-3">No hay ningún grupo de esa materia en {m.carrera} este mes.</p>
                  ) : (
                    <ul className="space-y-1 pl-3 text-sm text-slate-200">
                      {m.grupos.map((g) => (
                        <li key={g.group_id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">la dicta {g.tutor} <span className="text-slate-500 text-xs">· {g.grupo}</span></span>
                          <BotonListaClase url={g.listaUrl} titulo={`Abrir la lista de clase de ${g.materia} con ${g.tutor} (${g.grupo})`} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className={'rounded-lg border px-3 py-2 text-sm ' + (error.sesionExpirada ? 'border-amber-800 bg-amber-950/30 text-amber-200' : 'border-red-900 bg-red-950/40 text-red-300')}>
          {error.message}
        </div>
      ) : filas == null ? (
        <p className="text-sm text-slate-400">Cargando detalle…</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400">
              {filas.length} respuesta(s){repetidas.size > 0 && <span className="text-amber-300"> · {repetidas.size} estudiante(s) respondieron más de una vez</span>}
              {hayCorregidas && <span className="text-emerald-300"> · recarga la vista para ver los conteos actualizados</span>}
            </p>
            {correos.length > 0 && (
              <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                {correos.length} correo(s) distinto(s)
                <BotonCopiar valor={correos.join(', ')} label={`${correos.length} correo(s)`} />
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full whitespace-nowrap">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  {variasCarreras && <Th>Carrera</Th>}
                  <Th>Correo del estudiante</Th>
                  <Th>Cédula</Th>
                  <Th>Materia que eligió</Th>
                  <Th>Corregir materia</Th>
                  <Th>Docente que eligió</Th>
                  <Th>Corregir docente</Th>
                  <Th>Queda en</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => {
                  const c = correcciones[r.respuesta_id];
                  const v = valorDe(r);
                  const g = grupoDe(r.carrera, v.materia, v.docente);
                  const cambiaMateria = v.materia && claveMateria_(v.materia) !== claveMateria_(r.materia);
                  const cambiaDocente = v.docente && normalizar(v.docente) !== normalizar(r.docente);
                  const bloqueada = !r.respuesta_id || c?.estado === 'enviando' || c?.estado === 'ok';
                  return (
                    <tr key={r.respuesta_id || i} className="border-t border-ink-700 align-middle">
                      <Td><span className="text-slate-400">{fechaHoraCorta_(r.creado_en)}</span></Td>
                      {variasCarreras && <Td><ChipCarrera carrera={r.carrera} /></Td>}
                      <Td>{r.correo || <span className="text-slate-500">sin correo</span>}</Td>
                      <Td>
                        {r.cedula || '—'}
                        {repetidas.has(r.cedula) && <span className="ml-1.5 text-[10px] text-amber-300" title="Este estudiante respondió más de una vez">repetida</span>}
                      </Td>
                      <Td><span className={cambiaMateria ? 'text-slate-500 line-through' : 'text-slate-200'}>{r.materia || '—'}</span></Td>
                      <Td>
                        <select value={v.materia} onChange={(e) => cambiarMateria(r, e.target.value)} className={selectCls + (cambiaMateria ? ' border-emerald-600' : '')} disabled={bloqueada}>
                          <option value="">— elige materia —</option>
                          {materiasDe(r.carrera).map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </Td>
                      <Td><span className={cambiaDocente ? 'text-slate-500 line-through' : 'text-slate-200'}>{r.docente || '—'}</span></Td>
                      <Td>
                        <select value={v.docente} onChange={(e) => cambiarDocente(r, e.target.value)} className={selectCls + (cambiaDocente ? ' border-emerald-600' : '')} disabled={bloqueada || !v.materia}>
                          <option value="">{v.materia ? '— elige docente —' : 'elige primero la materia'}</option>
                          {tutoresDe(r.carrera, v.materia).map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Td>
                      <Td>
                        {c?.estado === 'ok' ? (
                          <span className="text-emerald-300 font-semibold">✓ {c.texto}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {g ? (
                              <>
                                <span className="text-slate-300">→ <b>{g.grupo}</b></span>
                                <BotonListaClase url={g.listaUrl} compacto titulo={`Lista de clase de ${g.grupo}`} />
                              </>
                            ) : (
                              <span className="text-slate-500 text-[11px]">{v.materia && v.docente ? 'esa combinación no existe' : 'sin grupo'}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => guardar(r)}
                              disabled={!g || bloqueada}
                              className="rounded px-2 py-1 text-xs font-semibold bg-accent-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {c?.estado === 'enviando' ? '…' : 'Guardar'}
                            </button>
                            {c?.estado === 'error' && <span className="text-red-300 text-[11px] max-w-[220px] whitespace-normal">{c.texto}</span>}
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ModalRanking>
  );
}

/** ID Grupo (Mapeo) — link a la hoja de la lista de clase (`listado_url`,
 *  viene de asap_seguimiento_grupo). Si no hay lista, texto plano. */
function CeldaIdGrupoMapeo({ f }) {
  if (!f.id_grupo_mapeo) return '—';
  if (!f.listado_url) return f.id_grupo_mapeo;
  return (
    <a href={f.listado_url} target="_blank" rel="noreferrer" className="text-accent-400 hover:text-accent-300" title="Abrir la lista de clase">
      {f.id_grupo_mapeo}
    </a>
  );
}

/** Group ID — link a la ficha del grupo en el SIS de Kuepa. */
function CeldaGroupId({ groupId }) {
  if (!groupId) return '—';
  return (
    <a href={urlSisGrupo(groupId)} target="_blank" rel="noreferrer" className="text-accent-400 hover:text-accent-300 underline decoration-dotted underline-offset-2" title="Abrir en el SIS">
      {groupId}
    </a>
  );
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
  const [conteos, setConteos] = useState([]); // respuestas por categoria+mes+materia
  const [combos, setCombos] = useState([]);
  const [mapaListas, setMapaListas] = useState(() => new Map()); // group_id -> cant. est. en la lista (asap_seguimiento_grupo)
  const [dirIdx, setDirIdx] = useState(null); // índice del directorio de docentes (tooltip de contacto)
  const [alertas, setAlertas] = useState([]); // doc_alertas_cierre (historial)
  const [alertaEnviando, setAlertaEnviando] = useState(null); // group_id en curso
  const [alertaMsg, setAlertaMsg] = useState(null); // { tipo, texto }
  const [gestionGrupo, setGestionGrupo] = useState(null); // fila abierta en el modal de Gestión
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
          fetchConteosRespuestas().catch(() => []),
          fetchCantEstListasPorGrupo().catch(() => new Map()),
          fetchAlertasCierre().catch(() => []),
        ]);
        setFilasRaw(g);
        setCombos(c);
        setDirIdx(indexarDirectorioPorNombre(dir));
        setConteos(sc);
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

  // conteo de respuestas por (categoria + mes + materia + tutor) normalizado.
  const mapaRespuestas = useMemo(() => mapaDeConteos_(conteos), [conteos]);
  const sinGrupo = useMemo(() => respuestasSinGrupo_(conteos, filasRaw), [conteos, filasRaw]);
  const sinGrupoPorDocente = useMemo(() => respuestasSinGrupoPorDocente_(conteos, filasRaw), [conteos, filasRaw]);
  // todos los grupos de cada carrera+mes -- opciones de "Corregir materia" /
  // "Corregir docente" en la ventana de erradas (2026-10-16).
  const gruposPorCarreraMes = useMemo(() => {
    const m = {};
    (filasRaw || []).forEach((f) => {
      if (!f.tutor_calendario || !f.group_id) return;
      const k = normalizar(f.categoria_programa) + '|' + normalizar(f.mes_calificacion);
      if (!m[k]) m[k] = [];
      m[k].push({ materia: f.materia, tutor: f.tutor_calendario, grupo: f.id_grupo_mapeo, group_id: f.group_id, listaUrl: mapaListas.get(f.group_id)?.listaUrl ?? null });
    });
    return m;
  }, [filasRaw, mapaListas]);
  // grupos de cada tutor por carrera+mes -- opciones para reasignar una
  // respuesta de "materia errada" a otra materia del mismo docente.
  const gruposPorTutor = useMemo(() => {
    const m = {};
    (filasRaw || []).forEach((f) => {
      if (!f.tutor_calendario) return;
      const k = claveDocenteCarreraMes_(f.categoria_programa, f.mes_calificacion, f.tutor_calendario);
      if (!m[k]) m[k] = [];
      m[k].push({ materia: f.materia, grupo: f.id_grupo_mapeo, group_id: f.group_id, listaUrl: mapaListas.get(f.group_id)?.listaUrl ?? null });
    });
    return m;
  }, [filasRaw, mapaListas]);
  // total de la materia (todos los docentes) y tutores que la dictan, por
  // categoría+mes+materia -- para "Resp. brutas" y el detalle de erradas.
  const brutasPorMateria = useMemo(() => {
    const m = {};
    (conteos || []).forEach((c) => {
      const k = claveMateriaCarreraMes_(c.categoria_programa, c.mes_calificacion, c.materia);
      m[k] = (m[k] || 0) + (c.respuestas || 0);
    });
    return m;
  }, [conteos]);
  const tutoresPorMateria = useMemo(() => {
    const m = {};
    (filasRaw || []).forEach((f) => {
      const k = claveMateriaCarreraMes_(f.categoria_programa, f.mes_calificacion, f.materia);
      if (!m[k]) m[k] = [];
      if (f.tutor_calendario) {
        m[k].push({
          tutor: f.tutor_calendario,
          grupo: f.id_grupo_mapeo,
          group_id: f.group_id,
          // lista de clase del grupo (asap_seguimiento_grupo) -- para buscar ahí
          // el correo de un estudiante que respondió con el docente equivocado.
          listaUrl: mapaListas.get(f.group_id)?.listaUrl ?? null,
        });
      }
    });
    return m;
  }, [filasRaw, mapaListas]);

  // cada grupo lleva pegado su `respuestas` (nº de evaluaciones de esa
  // materia en su misma categoría+mes); 0 si todavía no hay ninguna.
  const filas = useMemo(
    () =>
      filasRaw.map((f) => ({
        ...f,
        respuestas: mapaRespuestas[claveRespuestas_(f.categoria_programa, f.mes_calificacion, f.materia, f.tutor_calendario)] || 0,
        respuestas_brutas: brutasPorMateria[claveMateriaCarreraMes_(f.categoria_programa, f.mes_calificacion, f.materia)] || 0,
        respuestas_erradas_docente: sinGrupo[claveMateriaCarreraMes_(f.categoria_programa, f.mes_calificacion, f.materia)]?.n || 0,
        respuestas_erradas_materia: sinGrupoPorDocente[claveDocenteCarreraMes_(f.categoria_programa, f.mes_calificacion, f.tutor_calendario)]?.n || 0,
        respuestas_erradas:
          (sinGrupo[claveMateriaCarreraMes_(f.categoria_programa, f.mes_calificacion, f.materia)]?.n || 0) +
          (sinGrupoPorDocente[claveDocenteCarreraMes_(f.categoria_programa, f.mes_calificacion, f.tutor_calendario)]?.n || 0),
        respuestas_sin_grupo_docente: sinGrupoPorDocente[claveDocenteCarreraMes_(f.categoria_programa, f.mes_calificacion, f.tutor_calendario)] || null,
        grupos_del_tutor: gruposPorTutor[claveDocenteCarreraMes_(f.categoria_programa, f.mes_calificacion, f.tutor_calendario)] || [],
        grupos_carrera_mes: gruposPorCarreraMes[normalizar(f.categoria_programa) + '|' + normalizar(f.mes_calificacion)] || [],
        respuestas_sin_grupo: sinGrupo[claveMateriaCarreraMes_(f.categoria_programa, f.mes_calificacion, f.materia)] || null,
        tutores_materia: tutoresPorMateria[claveMateriaCarreraMes_(f.categoria_programa, f.mes_calificacion, f.materia)] || [],
        cantidad_estudiantes_listas: mapaListas.get(f.group_id)?.cant ?? null,
        asistentes_min_1_sesion: mapaListas.get(f.group_id)?.asis ?? null,
        listado_url: mapaListas.get(f.group_id)?.listaUrl ?? null,
        estado_materia: estadoMateria_(f.fecha_calendario_inicio, f.fecha_calendario_fin),
      })),
    [filasRaw, mapaRespuestas, sinGrupo, sinGrupoPorDocente, gruposPorTutor, gruposPorCarreraMes, brutasPorMateria, tutoresPorMateria, mapaListas]
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
              onAbrirGestion={setGestionGrupo}
            />
          ))}
          {combosVisibles.length > 0 && (
            <SeccionCombinadosEvalDocente
              combos={combosVisibles}
              gruposCol={gruposCol}
              onToggleGrupoCol={toggleGrupoCol}
              dirIdx={dirIdx}
              alertasPorGrupo={alertasPorGrupo}
              onAbrirGestion={setGestionGrupo}
            />
          )}
        </div>
      )}

      {gestionGrupo && (
        <ModalGestion
          f={gestionGrupo}
          dirIdx={dirIdx}
          estadoAlerta={alertasPorGrupo?.get(gestionGrupo.group_id) || null}
          historial={alertas.filter((a) => a.group_id === gestionGrupo.group_id)}
          onEnviado={async () => setAlertas(await fetchAlertasCierre().catch((prev) => prev || alertas))}
          onClose={() => setGestionGrupo(null)}
        />
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
// 2026-10-15, a pedido del usuario: las 3 columnas de respuestas NO van por
// miembro -- el aula combinada vio clase con el mismo tutor, así que se
// muestran sumadas en un solo recuadro (rowSpan), ver totalesRespuestasCombo_.
const COMB_ED_POR_MIEMBRO = new Set(['id_grupo_mapeo', 'group_id', 'section_id', 'cupos_activos', 'cantidad_estudiantes_listas', 'asistentes_min_1_sesion', 'estado_materia', 'alerta_cierre']);

/** Totales de respuestas de un grupo combinado: suma de sus miembros SIN
 *  contar dos veces la misma clave (si dos miembros son de la misma carrera
 *  y materia, sus brutas/erradas son las mismas y su "del grupo" también si
 *  comparten tutor). Devuelve además los miembros (uno por carrera+materia)
 *  con erradas, para el detalle. */
function totalesRespuestasCombo_(ms) {
  const sumaDistinta = (claveFn, campo) => {
    const vistos = new Map();
    ms.forEach((m) => { const k = claveFn(m); if (!vistos.has(k)) vistos.set(k, m[campo] || 0); });
    return Array.from(vistos.values()).reduce((a, b) => a + b, 0);
  };
  const claveMat = (m) => claveMateriaCarreraMes_(m.categoria_programa, m.mes_calificacion, m.materia);
  const claveDoc = (m) => claveDocenteCarreraMes_(m.categoria_programa, m.mes_calificacion, m.tutor_calendario);
  const unicos = (claveFn, campo) => {
    const out = [];
    const vistos = new Set();
    ms.forEach((m) => { const k = claveFn(m); if (!vistos.has(k) && m[campo] > 0) { vistos.add(k); out.push(m); } });
    return out;
  };
  const erradasDocente = sumaDistinta(claveMat, 'respuestas_erradas_docente');
  const erradasMateria = sumaDistinta(claveDoc, 'respuestas_erradas_materia');
  return {
    respuestas: sumaDistinta((m) => claveRespuestas_(m.categoria_programa, m.mes_calificacion, m.materia, m.tutor_calendario), 'respuestas'),
    respuestas_brutas: sumaDistinta(claveMat, 'respuestas_brutas'),
    respuestas_erradas_docente: erradasDocente,
    respuestas_erradas_materia: erradasMateria,
    respuestas_erradas: erradasDocente + erradasMateria,
    conErradas: unicos(claveMat, 'respuestas_erradas_docente'),
    conErradasMateria: unicos(claveDoc, 'respuestas_erradas_materia'),
  };
}

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
function SeccionCombinadosEvalDocente({ combos, gruposCol, onToggleGrupoCol, dirIdx, alertasPorGrupo, onAbrirGestion }) {
  const scrollRef = useRef(null);
  usePinGroupId(scrollRef, [gruposCol, combos]);
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
      <div ref={scrollRef} className="overflow-x-auto bg-ink-900">
        <table className="w-full text-xs border-collapse whitespace-nowrap">
          <TheadGruposCategoria gruposCol={gruposCol} onToggleGrupoCol={onToggleGrupoCol} />
          {combos.map((c) => (
            <FilasComboCombinadoED key={c.id} c={c} gruposCol={gruposCol} onToggleGrupoCol={onToggleGrupoCol} totalCols={totalCols} dirIdx={dirIdx} alertasPorGrupo={alertasPorGrupo} onAbrirGestion={onAbrirGestion} />
          ))}
        </table>
      </div>
    </section>
  );
}

function FilasComboCombinadoED({ c, gruposCol, onToggleGrupoCol, totalCols, dirIdx, alertasPorGrupo, onAbrirGestion }) {
  const ms = c.miembros || [];
  const m0 = ms[0] || {};
  const n = ms.length || 1;
  const suma = ms.reduce((a, m) => a + (Number(m.cupos_activos) || 0), 0);
  const tot = totalesRespuestasCombo_(ms);
  const carrerasCombo = Array.from(new Set(ms.map((m) => m.categoria_programa).filter(Boolean)));
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
        <tr key={m.group_id} className="group border-t border-ink-800 hover:bg-ink-850/40">
          {GRUPOS_COL_DEF.map((g) => {
            const abierto = gruposCol.has(g.id);
            if (!abierto) {
              if (i !== 0) return null;
              return (
                <td
                  key={g.id}
                  onClick={() => onToggleGrupoCol(g.id)}
                  rowSpan={n}
                  className={'px-2 py-2 text-center text-slate-600 cursor-pointer hover:text-slate-300 align-top ' + (g.id === 'ident' ? 'sticky left-0 z-10 bg-ink-900 group-hover:bg-ink-850 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)] ' : '')}
                  style={{ borderLeft: `2px solid ${g.color}66`, backgroundColor: g.id === 'ident' ? undefined : g.color + '0A' }}
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
              } else if (key === 'id_grupo_mapeo') {
                contenido = (
                  <span className="inline-flex items-center gap-1.5">
                    <CeldaIdGrupoMapeo f={m} />
                    {m.categoria_programa && <ChipCarrera carrera={m.categoria_programa} />}
                  </span>
                );
              } else if (key === 'group_id') {
                contenido = <CeldaGroupId groupId={m.group_id} />;
              } else if (key === 'tutor_calendario') {
                contenido = <TooltipDocente nombre={merged.tutor_calendario} dir={dirIdx} />;
              } else if (key === 'estado_materia') {
                contenido = <PillEstadoMateria estado={m.estado_materia} />;
              } else if (key === 'alerta_cierre') {
                // Gestión mira el total COMBINADO: el aula compartida tiene un solo
                // conjunto de respuestas; si no, un miembro marcaría "sin
                // respuestas" aunque su aula sí las tenga.
                contenido = <BotonGestion f={{ ...m, respuestas: tot.respuestas, carreras_combo: carrerasCombo }} estadoAlerta={alertasPorGrupo?.get(m.group_id) || null} onAbrir={onAbrirGestion} />;
              } else if (key === 'respuestas_erradas') {
                contenido = <CeldaRespuestasErradas f={{ ...m, respuestas_erradas: tot.respuestas_erradas, respuestas_erradas_docente: tot.respuestas_erradas_docente, respuestas_erradas_materia: tot.respuestas_erradas_materia }} lista={tot.conErradas} listaMateria={tot.conErradasMateria} />;
              } else if (key === 'respuestas' || key === 'respuestas_brutas') {
                contenido = (
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <PildoraRespuestas tipo={key} valor={tot[key]} />
                    {key === 'respuestas' && carrerasCombo.length > 1 && <span className="text-[10px] text-slate-500">suma {carrerasCombo.length} carreras</span>}
                  </span>
                );
              } else if (perMiembro) {
                contenido = celdaGrupo_(m, key);
              } else {
                contenido = celdaGrupo_(merged, key);
              }

              return (
                <td
                  key={key}
                  data-col={key}
                  rowSpan={perMiembro ? undefined : n}
                  className={'px-3 py-2 ' + (key === 'id_grupo_mapeo' ? 'sticky left-0 z-10 bg-ink-900 group-hover:bg-ink-850 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)] ' : '') + (['respuestas', 'respuestas_brutas', 'respuestas_erradas'].includes(key) ? 'align-middle ' : 'align-top ') + (def.center ? 'text-center ' : '') + (def.mono ? 'font-mono text-[11px] text-slate-400 ' : 'text-slate-300 ')}
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
          {carrerasCombo.length > 0 && <span className="text-slate-400">{carrerasCombo.join(' + ')} · </span>}
          {c.etiqueta} · <span style={{ color: COMB_COLOR_ED }} className="font-semibold">cupos combinados: {suma}</span>
        </td>
      </tr>
    </tbody>
  );
}

function TablaCategoriaGrupos({ categoria, grupos, abierta, onToggle, gruposCol, onToggleGrupoCol, dirIdx, alertasPorGrupo, onAbrirGestion }) {
  const color = COLOR_CATEGORIA[categoria] || '#5b7fff';
  const [fMateria, setFMateria] = useState('');
  const [fTutor, setFTutor] = useState('');
  const scrollRef = useRef(null);
  usePinGroupId(scrollRef, [gruposCol, abierta, grupos, fMateria, fTutor]);

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
      const k = claveRespuestas_(g.categoria_programa, g.mes_calificacion, g.materia, g.tutor_calendario);
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

          <div ref={scrollRef} className="overflow-x-auto bg-ink-900">
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
                      onAbrirGestion={onAbrirGestion}
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

/* Columnas fijas al desplazar la tabla hacia el lado (2026-10-15, igual que
 * en la app de Asistencia): "ID Grupo (Mapeo)" queda SIEMPRE pegada a la
 * izquierda (sticky left-0), y "Group ID" se pega a su derecha SOLO cuando
 * el scroll horizontal la alcanzaría -- fuera de ese punto es una columna
 * normal. Se manipula el DOM directo (sin useState) para no re-renderizar
 * todas las filas en cada pixel de scroll. */
const PIN_TH_CLASSES = ['sticky', 'z-20', 'bg-ink-850', 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]'];
const PIN_TD_CLASSES = ['sticky', 'z-10', 'bg-ink-900', 'group-hover:bg-ink-850', 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)]'];

function usePinGroupId(scrollRef, deps) {
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return undefined;
    function actualizar() {
      const anclaTh = cont.querySelector('thead [data-col="id_grupo_mapeo"]');
      const groupIdTh = cont.querySelector('thead [data-col="group_id"]');
      const celdas = cont.querySelectorAll('[data-col="group_id"]');
      if (!anclaTh || !groupIdTh) {
        celdas.forEach((el) => { el.classList.remove(...PIN_TH_CLASSES, ...PIN_TD_CLASSES); el.style.left = ''; });
        return;
      }
      const anchoAncla = anclaTh.getBoundingClientRect().width;
      let offsetNatural = 0;
      for (const celda of groupIdTh.parentElement.children) {
        if (celda === groupIdTh) break;
        offsetNatural += celda.getBoundingClientRect().width;
      }
      const debeFijarse = cont.scrollLeft + anchoAncla > offsetNatural;
      celdas.forEach((el) => {
        const esTh = el.tagName === 'TH';
        const clases = esTh ? PIN_TH_CLASSES : PIN_TD_CLASSES;
        const otras = esTh ? PIN_TD_CLASSES : PIN_TH_CLASSES;
        if (debeFijarse) {
          el.classList.remove(...otras);
          el.classList.add(...clases);
          el.style.left = anchoAncla + 'px';
        } else {
          el.classList.remove(...clases, ...otras);
          el.style.left = '';
        }
      });
    }
    let pendiente = false;
    function onScroll() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => { actualizar(); pendiente = false; });
    }
    actualizar();
    cont.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', actualizar);
    return () => {
      cont.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', actualizar);
    };
    // eslint-disable-next-line
  }, deps);
}

function TheadGruposCategoria({ gruposCol, onToggleGrupoCol }) {
  return (
    <thead>
      {/* Fila 1 — headers de los acordeones de columnas, cada uno con su color */}
      <tr>
        {GRUPOS_COL_DEF.map((g) => {
          const abierto = gruposCol.has(g.id);
          const fijaCol = g.id === 'ident' && !abierto;
          return (
            <th
              key={g.id}
              colSpan={abierto ? g.cols.length : 1}
              className={'px-3 py-2 text-left align-bottom border-b-2 ' + (fijaCol ? 'sticky left-0 z-20 bg-ink-850 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)] ' : '')}
              style={{ backgroundColor: fijaCol ? undefined : g.color + (abierto ? '24' : '12'), borderColor: g.color }}
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
            return <th key={g.id} className={'border-b border-ink-700 ' + (g.id === 'ident' ? 'sticky left-0 z-20 bg-ink-850 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)] ' : '')} style={{ borderLeft: `2px solid ${g.color}66` }} />;
          }
          return g.cols.map((key, j) => {
            const def = COLDEF_GRUPOS[key];
            return (
              <th
                key={key}
                data-col={key}
                className={
                  'px-3 py-2 font-semibold text-[11px] uppercase tracking-wider text-slate-400 whitespace-nowrap border-b border-ink-700 ' +
                  (def.center ? 'text-center ' : 'text-left ') +
                  (def.wide ? 'min-w-[190px] ' : '') +
                  (key === 'id_grupo_mapeo' ? 'sticky left-0 z-20 bg-ink-850 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)] ' : '')
                }
                style={j === 0 ? { borderLeft: `2px solid ${g.color}66` } : undefined}
                title={def.tip}
              >
                {def.punto && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: def.punto }} />}
                {def.tip ? <span className="underline decoration-dotted decoration-slate-600 underline-offset-2 cursor-help">{def.t}</span> : def.t}
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

/** Situación de gestión de una fila:
 *   'sin_respuestas'  → materia cerró y 0 respuestas
 *   'insuficiente'    → materia cerró y 1..N_MINIMO_CONFIABLE-1 respuestas
 *   null              → no hay nada que gestionar (aún en curso, o con respuestas suficientes) */
function situacionGestion_(f) {
  if (f.estado_materia !== 'cerro') return null;
  const r = f.respuestas || 0;
  if (r === 0) return 'sin_respuestas';
  if (r < N_MINIMO_CONFIABLE) return 'insuficiente';
  return null;
}
/** Días que faltan para que cierre la materia (0 = cierra hoy). Solo tiene
 *  sentido si está en curso; null si no hay fecha de fin válida. */
function diasParaCierre_(f) {
  const fin = String(f.fecha_calendario_fin || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fin)) return null;
  const ms = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.max(0, Math.round((ms(fin) - ms(hoyBogota_())) / 86400000));
}

const GESTION_META = {
  sin_respuestas: { txt: 'Sin respuestas de encuesta docente (materia cerrada)', color: '#f43f5e' },
  insuficiente: { txt: 'Insuficiencia de respuestas evaluación docente', color: '#f59e0b' },
};

/** Texto para copiar/reenviar manualmente por WhatsApp (no se envía por
 *  API -- 2026-09-12, a pedido del usuario: mantener la generación de la
 *  plantilla en la app, pero el envío real al grupo de WhatsApp lo hace el
 *  staff a mano desde su celular/WhatsApp Web). */
function textoWhatsappGestion_(tipo, f, urlEncuesta, urlsEncuesta) {
  const periodo = `${formatearFechaDDMMYYYY(f.fecha_calendario_inicio) || 's/f'} al ${formatearFechaDDMMYYYY(f.fecha_calendario_fin) || 's/f'}`;
  const asistieron = f.asistentes_min_1_sesion ?? 0;
  const respuestas = f.respuestas ?? 0;
  const cantListas = f.cantidad_estudiantes_listas ?? null;
  const nombreTutor = (f.tutor_calendario || '').trim();
  const materia = f.materia || 'la materia';
  const urlSis = urlSisGrupo(f.group_id);
  const partes = [];
  partes.push(nombreTutor ? `Hola *${nombreTutor}* 👋` : 'Hola 👋');
  partes.push('');
  if (tipo === 'sin_respuestas') {
    partes.push(`🔴 Tu materia *${materia}* (${periodo}) ya cerró y, según nuestros reportes, *ningún estudiante* completó la evaluación docente.`);
    partes.push('');
    partes.push(
      `El grupo, según el listado asignado, tiene aproximadamente ${cantListas ?? '—'} estudiantes, de los cuales ${asistieron} sí asistieron a clase. Necesitamos que actúes lo antes posible:`
    );
  } else if (tipo === 'insuficiente') {
    partes.push(
      `🟠 En tu materia *${materia}* (${periodo}), de un grupo de aproximadamente ${cantListas ?? '—'} estudiantes, ${asistieron} asistieron a clase y solo ${respuestas} completaron la evaluación docente — son muy pocas respuestas para tener una lectura confiable.`
    );
    partes.push('');
    partes.push('Ayúdanos recordándole a tus demás estudiantes completarla lo antes posible:');
  } else if (tipo === 'en_curso') {
    const dias = diasParaCierre_(f);
    partes.push(
      `🔵 Tu materia *${materia}* (${periodo}) todavía está en curso${dias !== null ? (dias === 0 ? ' y cierra hoy' : ` · quedan ${dias} ${dias === 1 ? 'día' : 'días'}`) : ''}. Te invitamos a enviarles a tus estudiantes el link de la evaluación docente antes de que cierre:`
    );
  } else {
    return '';
  }
  if (urlsEncuesta && urlsEncuesta.length > 1) {
    partes.push('👥 Es un grupo combinado: cada estudiante debe usar el link de *su* carrera:');
    urlsEncuesta.forEach((x) => partes.push(`• ${x.carrera}: ${x.url}`));
  } else if (urlEncuesta) partes.push(urlEncuesta);
  partes.push('');
  if (f.listado_url) {
    partes.push('📋 Estas son tus listas de clase:');
    partes.push(f.listado_url);
    partes.push('');
  }
  if (urlSis) {
    partes.push('🖥️ Este es tu grupo en el SIS:');
    partes.push(urlSis);
    partes.push('');
  }
  partes.push('¡Gracias por tu gestión! 🙌');
  return partes.join('\n');
}

/** Botón "Gestión" — en TODAS las filas, con un look propio (pill sólida
 *  índigo, distinto al resto de la tabla). Abre el modal de gestión. Si la
 *  materia cerró y hay algo que atender (0 respuestas / insuficientes)
 *  muestra un puntito de color. */
function BotonGestion({ f, estadoAlerta, onAbrir }) {
  const sit = situacionGestion_(f);
  return (
    <button
      type="button"
      onClick={() => onAbrir(f)}
      title={
        'Abrir gestión' +
        (sit ? ' · ' + GESTION_META[sit].txt : '') +
        (estadoAlerta ? ' · WhatsApp ' + (estadoAlerta === 'enviado' ? 'enviado' : 'registrado') : '')
      }
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white bg-accent-500 hover:bg-accent-400 transition-colors active:translate-y-px"
    >
      Gestión
      {sit && (
        <span
          className="w-1.5 h-1.5 rounded-full ring-1 ring-white/60"
          style={{ backgroundColor: GESTION_META[sit].color }}
        />
      )}
      {estadoAlerta && <span className="text-[9px] leading-none">{estadoAlerta === 'enviado' ? '✓' : '•'}</span>}
    </button>
  );
}

/** Modal de gestión de una materia: datos del grupo + acciones. Canal
 *  "Correo" envía automático (n8n → Gmail); canal "WhatsApp" solo genera el
 *  texto para copiar/reenviar manualmente (sin envío por API). */
function ModalGestion({ f, dirIdx, estadoAlerta, historial, onEnviado, onClose }) {
  const [enviando, setEnviando] = useState(null); // 'sin_respuestas' | 'insuficiente' | null
  const [msg, setMsg] = useState(null); // { tipo:'ok'|'error', texto }
  const [canal, setCanal] = useState('correo'); // 'correo' | 'whatsapp'
  const [plantillaWA, setPlantillaWA] = useState(null); // { tipo, texto } | null
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const tutor = dirIdx?.porNombre?.get(normalizar(f.tutor_calendario || '')) || null;
  const correo = tutor?.correo_institucional || '';
  const sit = situacionGestion_(f);

  // Link de la encuesta de evaluación docente que le corresponde a esta
  // materia: se arma por CATEGORÍA + MES (no por grupo), igual que en la
  // vista de links del panel.
  const urlEncuesta =
    f.categoria_programa && f.mes_calificacion
      ? `${window.location.origin}/evaluar/${slug(f.categoria_programa)}/${slug(f.mes_calificacion)}`
      : null;
  // 2026-10-15: grupo combinado entre carreras -> un link por carrera (cada
  // estudiante responde con el de SU carrera). null en grupos normales.
  const urlsEncuesta =
    f.carreras_combo && f.carreras_combo.length > 1 && f.mes_calificacion
      ? f.carreras_combo.map((c) => ({ carrera: c, url: `${window.location.origin}/evaluar/${slug(c)}/${slug(f.mes_calificacion)}` }))
      : null;

  function registrarPlantillaWA(tipo) {
    enviarAlertaCierre({
      group_id: f.group_id,
      id_grupo_mapeo: f.id_grupo_mapeo,
      categoria_programa: f.categoria_programa,
      mes_calificacion: f.mes_calificacion,
      materia: f.materia,
      tutor_calendario: f.tutor_calendario,
      canal: 'whatsapp',
      tipo,
      destinatario: tutor?.celular || null,
      respuestas_antes: f.respuestas ?? 0,
    })
      .then(() => onEnviado?.())
      .catch(() => {});
  }

  function manejarClicTipo(tipo) {
    if (canal === 'whatsapp') {
      setMsg(null);
      setPlantillaWA({ tipo, texto: textoWhatsappGestion_(tipo, f, urlEncuesta, urlsEncuesta) });
      registrarPlantillaWA(tipo);
      return;
    }
    if (canal === 'ambos') {
      setPlantillaWA({ tipo, texto: textoWhatsappGestion_(tipo, f, urlEncuesta, urlsEncuesta) });
      registrarPlantillaWA(tipo);
      enviarReporte(tipo);
      return;
    }
    enviarReporte(tipo);
  }

  async function enviarReporte(tipo) {
    if (!correo) {
      setMsg({ tipo: 'error', texto: 'No se encontró correo institucional para este tutor en el directorio — no se pudo enviar.' });
      return;
    }
    setEnviando(tipo);
    setMsg(null);
    try {
      await enviarReporteGestion({
        tipo,
        destino: correo,
        group_id: f.group_id,
        id_grupo_mapeo: f.id_grupo_mapeo,
        categoria_programa: f.categoria_programa,
        mes_calificacion: f.mes_calificacion,
        materia: f.materia,
        tutor_calendario: f.tutor_calendario,
        correo_tutor: correo,
        cantidad_estudiantes_listas: f.cantidad_estudiantes_listas ?? null,
        asistentes_min_1_sesion: f.asistentes_min_1_sesion ?? null,
        respuestas: f.respuestas ?? 0,
        respuestas_antes: f.respuestas ?? 0,
        fecha_calendario_inicio: f.fecha_calendario_inicio || null,
        fecha_calendario_fin: f.fecha_calendario_fin || null,
        listado_url: f.listado_url || null,
        url_sis: urlSisGrupo(f.group_id),
        url_encuesta: urlEncuesta,
        urls_encuesta: urlsEncuesta,
      });
      setMsg({ tipo: 'ok', texto: `Reporte enviado por correo a ${correo}.` });
      onEnviado?.();
    } catch (e) {
      setMsg({ tipo: 'error', texto: 'No se pudo enviar: ' + (e.message || e) });
    } finally {
      setEnviando(null);
    }
  }

  const diasCierre = diasParaCierre_(f);
  const enCurso = f.estado_materia === 'en_curso';

  async function enviarInvitacionEnCurso() {
    if (!correo) {
      setMsg({ tipo: 'error', texto: 'No se encontró correo institucional para este tutor en el directorio — no se pudo enviar.' });
      return;
    }
    setEnviando('en_curso');
    setMsg(null);
    try {
      await enviarReporteGestion({
        tipo: 'en_curso',
        destino: correo,
        dias_restantes: diasCierre,
        group_id: f.group_id,
        id_grupo_mapeo: f.id_grupo_mapeo,
        categoria_programa: f.categoria_programa,
        mes_calificacion: f.mes_calificacion,
        materia: f.materia,
        tutor_calendario: f.tutor_calendario,
        correo_tutor: correo || null,
        cantidad_estudiantes_listas: f.cantidad_estudiantes_listas ?? null,
        asistentes_min_1_sesion: f.asistentes_min_1_sesion ?? null,
        respuestas: f.respuestas ?? 0,
        respuestas_antes: f.respuestas ?? 0,
        fecha_calendario_inicio: f.fecha_calendario_inicio || null,
        fecha_calendario_fin: f.fecha_calendario_fin || null,
        listado_url: f.listado_url || null,
        url_sis: urlSisGrupo(f.group_id),
        url_encuesta: urlEncuesta,
        urls_encuesta: urlsEncuesta,
      });
      setMsg({ tipo: 'ok', texto: `Invitación enviada por correo a ${correo}.` });
      onEnviado?.();
    } catch (e) {
      setMsg({ tipo: 'error', texto: 'No se pudo enviar: ' + (e.message || e) });
    } finally {
      setEnviando(null);
    }
  }

  // 2026-10-02: antes este botón solo mandaba correo, ignorando el selector
  // Correo/WhatsApp/Ambos de arriba -- al elegir WhatsApp no pasaba nada
  // (bug reportado por el usuario: "le di whatsapp... no se generó la
  // plantilla"). Ahora respeta el canal igual que manejarClicTipo.
  function manejarClicEnCurso() {
    if (canal === 'whatsapp') {
      setMsg(null);
      setPlantillaWA({ tipo: 'en_curso', texto: textoWhatsappGestion_('en_curso', f, urlEncuesta, urlsEncuesta) });
      registrarPlantillaWA('en_curso');
      return;
    }
    if (canal === 'ambos') {
      setPlantillaWA({ tipo: 'en_curso', texto: textoWhatsappGestion_('en_curso', f, urlEncuesta, urlsEncuesta) });
      registrarPlantillaWA('en_curso');
      enviarInvitacionEnCurso();
      return;
    }
    enviarInvitacionEnCurso();
  }

  const Dato = ({ label, children }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-200">{children ?? '—'}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-6xl max-h-[88vh] overflow-y-auto rounded-2xl border border-ink-600 bg-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-700">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Gestión de la materia</div>
            <div className="text-sm font-semibold text-slate-100 truncate">
              {f.id_grupo_mapeo} · {f.materia}
            </div>
            <div className="text-xs text-slate-500">{f.categoria_programa} · {f.mes_calificacion}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100 text-lg leading-none -mt-1">×</button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-[220px_1fr_300px] gap-5">
        <div className="order-3 md:order-1 md:border-r md:border-ink-700 md:pr-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Historial de este grupo {historial && historial.length > 0 ? `(${historial.length})` : ''}
          </div>
          {historial && historial.length > 0 ? (
            <div className="space-y-1.5 max-h-[420px] md:max-h-none overflow-y-auto">
              {historial.map((a) => {
                const tipoTxt = a.tipo === 'sin_respuestas' ? 'Sin respuestas' : a.tipo === 'insuficiente' ? 'Insuficiente' : a.tipo === 'en_curso' ? 'Invitación (en curso)' : (a.tipo || 'Gestión');
                const estadoTxt = a.estado === 'enviado' ? 'enviado' : a.estado === 'error' ? 'error' : a.estado === 'plantilla_generada' ? 'plantilla generada' : (a.estado || '—');
                const estadoColor = a.estado === 'enviado' ? 'text-emerald-400' : a.estado === 'error' ? 'text-red-400' : 'text-slate-400';
                return (
                  <div key={a.id} className="rounded-md border border-ink-700 bg-ink-850/40 px-2 py-1.5 flex items-start gap-1.5 text-[11px] text-slate-300">
                    <span className="mt-px">{a.canal === 'whatsapp' ? '💬' : '✉'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {tipoTxt} · <span className={estadoColor}>{estadoTxt}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {a.creado_en ? new Date(a.creado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                      </div>
                      {a.destinatario && <div className="text-[10px] text-slate-500 truncate">{a.destinatario}</div>}
                      {a.respuestas_antes !== null && a.respuestas_antes !== undefined && (
                        <div className="text-[10px] mt-0.5">
                          Respuestas: {a.respuestas_antes} → <b className={(f.respuestas ?? 0) > a.respuestas_antes ? 'text-emerald-400' : 'text-slate-400'}>{f.respuestas ?? 0}</b>
                          {(f.respuestas ?? 0) > a.respuestas_antes && ' ↑'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-slate-600">Sin gestiones previas para este grupo.</div>
          )}
        </div>
        <div className="order-1 md:order-2 space-y-4 min-w-0">
          {sit && (
            <div
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: GESTION_META[sit].color + '80', color: GESTION_META[sit].color, backgroundColor: GESTION_META[sit].color + '14' }}
            >
              {GESTION_META[sit].txt}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato label="Tutor">
              {f.tutor_calendario || '—'}
              {(tutor?.celular || correo) && (
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {tutor?.celular && (
                    <div className="flex items-center gap-1">
                      <span>📱 {tutor.celular}</span>
                      <BotonCopiar valor={tutor.celular} label="número" />
                    </div>
                  )}
                  {correo && <div className="break-all">✉ {correo}</div>}
                </div>
              )}
            </Dato>
            <Dato label="Materia">{f.materia}</Dato>
            <Dato label="Cant. est. listas">{f.cantidad_estudiantes_listas ?? '—'}</Dato>
            <Dato label="Asist. ≥1">{f.asistentes_min_1_sesion ?? '—'}</Dato>
            <Dato label="Respuestas">{f.respuestas ?? 0}</Dato>
            <Dato label="Estado">{ESTADO_MATERIA_META[f.estado_materia]?.txt || '—'}</Dato>
            <Dato label="Inicio">{formatearFechaDDMMYYYY(f.fecha_calendario_inicio) || '—'}</Dato>
            <Dato label="Finalización">{formatearFechaDDMMYYYY(f.fecha_calendario_fin) || '—'}</Dato>
            <Dato label="Lista de clase">
              {f.listado_url ? (
                <a href={f.listado_url} target="_blank" rel="noreferrer" className="text-accent-400 hover:text-accent-300 underline decoration-dotted underline-offset-2">
                  Abrir lista →
                </a>
              ) : '—'}
            </Dato>
            <Dato label="Group ID">
              <a href={urlSisGrupo(f.group_id)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-accent-400 hover:text-accent-300 underline decoration-dotted underline-offset-2 break-all">
                {f.group_id}
              </a>
            </Dato>
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-850/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              Encuesta de evaluación docente · {urlsEncuesta ? urlsEncuesta.map((x) => x.carrera).join(' + ') : f.categoria_programa} · {f.mes_calificacion}
            </div>
            {urlsEncuesta ? (
              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-400">Grupo combinado: cada estudiante usa el link de su carrera.</div>
                {urlsEncuesta.map((x) => (
                  <div key={x.carrera} className="flex items-center gap-2">
                    <span className="shrink-0"><ChipCarrera carrera={x.carrera} /></span>
                    <a href={x.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-xs text-accent-400 hover:text-accent-300 underline decoration-dotted underline-offset-2 break-all">{x.url}</a>
                    <BotonCopiar valor={x.url} label={'link ' + x.carrera} />
                  </div>
                ))}
              </div>
            ) : urlEncuesta ? (
              <div className="flex items-center gap-2">
                <a
                  href={urlEncuesta}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 text-xs text-accent-400 hover:text-accent-300 underline decoration-dotted underline-offset-2 break-all"
                >
                  {urlEncuesta}
                </a>
                <BotonCopiar valor={urlEncuesta} label="link" />
              </div>
            ) : (
              <div className="text-xs text-slate-500">—</div>
            )}
            <p className="text-[10px] text-slate-600 mt-1">El link es por carrera + mes (lo comparten todas las materias de esa carrera en ese mes).</p>
          </div>
        </div>

        <div className="order-2 md:order-3 space-y-2 md:border-l md:border-ink-700 md:pl-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Acciones · reporte</div>
              <div className="inline-flex rounded-md border border-ink-700 overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => { setCanal('correo'); setPlantillaWA(null); setMsg(null); }}
                  className={'px-2.5 py-1 font-semibold ' + (canal === 'correo' ? 'bg-accent-600 text-white' : 'text-slate-400 hover:bg-ink-800')}
                >
                  ✉ Correo
                </button>
                <button
                  type="button"
                  onClick={() => { setCanal('whatsapp'); setMsg(null); }}
                  className={'px-2.5 py-1 font-semibold ' + (canal === 'whatsapp' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-ink-800')}
                >
                  💬 WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => { setCanal('ambos'); setMsg(null); }}
                  className={'px-2.5 py-1 font-semibold ' + (canal === 'ambos' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-ink-800')}
                >
                  ✉+💬 Ambos
                </button>
              </div>
            </div>
            {canal === 'correo' && (
              <div className={'text-[10px] text-right -mt-1 ' + (correo ? 'text-slate-500' : 'text-rose-400')}>
                {correo ? `→ ${correo}` : '⚠ sin correo del tutor en el directorio'}
              </div>
            )}
            {canal === 'whatsapp' && (
              <div className="text-[10px] text-slate-500 -mt-1">
                Genera el texto para copiar y reenviarlo tú mismo al grupo/chat de WhatsApp del tutor — no se envía automático.
              </div>
            )}
            {canal === 'ambos' && (
              <div className={'text-[10px] -mt-1 ' + (correo ? 'text-slate-500' : 'text-rose-400')}>
                {correo
                  ? `Envía el correo automático (→ ${correo}) y además genera el texto de WhatsApp para copiar y reenviar.`
                  : '⚠ sin correo del tutor en el directorio — solo se generará el texto de WhatsApp.'}
              </div>
            )}
            <button
              type="button"
              disabled={!!enviando}
              onClick={() => manejarClicTipo('sin_respuestas')}
              className={
                'w-full rounded-md border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait ' +
                (sit === 'sin_respuestas'
                  ? 'border-rose-600 bg-rose-950/40 text-rose-200 ring-1 ring-rose-700/50'
                  : 'border-rose-800/60 bg-rose-950/20 text-rose-300 hover:bg-rose-950/40')
              }
            >
              {enviando === 'sin_respuestas' ? 'Enviando…' : 'Sin respuestas de encuesta docente (materia cerrada)'}
            </button>
            <button
              type="button"
              disabled={!!enviando}
              onClick={() => manejarClicTipo('insuficiente')}
              className={
                'w-full rounded-md border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait ' +
                (sit === 'insuficiente'
                  ? 'border-amber-600 bg-amber-950/40 text-amber-200 ring-1 ring-amber-700/50'
                  : 'border-amber-800/60 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40')
              }
            >
              {enviando === 'insuficiente' ? 'Enviando…' : 'Insuficiencia de respuestas evaluación docente'}
            </button>

            <div className="mt-3 pt-3 border-t border-ink-700 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-sky-400">Materia en curso · invitación anticipada</div>
              <p className="text-[10px] text-slate-500 leading-snug">
                Invita al tutor a enviar la encuesta a sus estudiantes <b>antes</b> de que cierre. Usa el canal elegido arriba (Correo/WhatsApp/Ambos).
              </p>
              <button
                type="button"
                disabled={!!enviando || !enCurso}
                onClick={manejarClicEnCurso}
                title={enCurso ? undefined : 'Solo disponible mientras la materia está en curso'}
                className="w-full rounded-md border border-sky-700/60 bg-sky-950/30 px-3 py-2 text-sm font-semibold text-sky-200 transition-colors hover:bg-sky-950/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {enviando === 'en_curso'
                  ? 'Enviando…'
                  : enCurso
                    ? `Invitar a enviar la encuesta${diasCierre !== null ? (diasCierre === 0 ? ' · cierra hoy' : ` · quedan ${diasCierre} ${diasCierre === 1 ? 'día' : 'días'}`) : ''}`
                    : 'Invitar a enviar la encuesta (solo materias en curso)'}
              </button>
              {(canal === 'correo' || canal === 'ambos') && (
                <div className={'text-[10px] ' + (correo ? 'text-slate-500' : 'text-rose-400')}>
                  {correo ? `→ ${correo}` : '⚠ sin correo del tutor en el directorio'}
                </div>
              )}
            </div>
            {msg && (
              <div className={'text-xs ' + (msg.tipo === 'ok' ? 'text-emerald-300' : 'text-red-300')}>
                {msg.texto}
              </div>
            )}
            {(canal === 'whatsapp' || canal === 'ambos') && plantillaWA && (
              <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400">Plantilla lista para enviar</div>
                  <BotonCopiar valor={plantillaWA.texto} label="texto" />
                </div>
                <pre className="whitespace-pre-wrap break-words text-xs text-slate-200 font-sans">{plantillaWA.texto}</pre>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(plantillaWA.texto)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5"
                >
                  Abrir WhatsApp Web para reenviar →
                </a>
              </div>
            )}
        </div>
        </div>
      </div>
    </div>
  );
}

function FilaGrupoCategoria({ f, gruposCol, onToggleGrupoCol, dirIdx, alertasPorGrupo, onAbrirGestion }) {
  return (
    <tr className="group border-t border-ink-800 hover:bg-ink-850/50">
      {GRUPOS_COL_DEF.map((g) => {
        const abierto = gruposCol.has(g.id);
        if (!abierto) {
          const fijaCol = g.id === 'ident';
          return (
            <td
              key={g.id}
              onClick={() => onToggleGrupoCol(g.id)}
              className={'px-2 py-2 text-center text-slate-600 cursor-pointer hover:text-slate-300 ' + (fijaCol ? 'sticky left-0 z-10 bg-ink-900 group-hover:bg-ink-850 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)] ' : '')}
              style={{ borderLeft: `2px solid ${g.color}66`, backgroundColor: fijaCol ? undefined : g.color + '0A' }}
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
              data-col={key}
              title={esResp || key === 'respuestas_brutas' ? COLDEF_GRUPOS[key].tip : undefined}
              className={
                'px-3 py-2 ' +
                (key === 'id_grupo_mapeo' ? 'sticky left-0 z-10 bg-ink-900 group-hover:bg-ink-850 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.5)] ' : '') +
                (def.center ? 'text-center ' : '') +
                (def.mono ? 'font-mono text-[11px] text-slate-400 ' : 'text-slate-300 ') +
                ''
              }
              style={style}
            >
              {key === 'mes_calificacion' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorDeMes(f.mes_calificacion) }} />
                  {f.mes_calificacion}
                </span>
              ) : key === 'id_grupo_mapeo' ? (
                <CeldaIdGrupoMapeo f={f} />
              ) : key === 'group_id' ? (
                <CeldaGroupId groupId={f.group_id} />
              ) : key === 'tutor_calendario' ? (
                <TooltipDocente nombre={f.tutor_calendario} dir={dirIdx} />
              ) : key === 'estado_materia' ? (
                <PillEstadoMateria estado={f.estado_materia} />
              ) : key === 'alerta_cierre' ? (
                <BotonGestion
                  f={f}
                  estadoAlerta={alertasPorGrupo?.get(f.group_id) || null}
                  onAbrir={onAbrirGestion}
                />
              ) : key === 'respuestas_erradas' ? (
                <CeldaRespuestasErradas f={f} />
              ) : key === 'respuestas' || key === 'respuestas_brutas' ? (
                <PildoraRespuestas tipo={key} valor={f[key]} />
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
/** Vista propia "Alertas de cierre" (2026-09-11, a pedido del usuario: "las
 *  alertas deberiamos dejarlas en otra seccion... debajo de ranking
 *  docente"). Antes vivía como un panel colapsable al final de la tabla de
 *  Grupos; ahora es su propia pestaña en el nav, con fetch propio (no
 *  depende de haber entrado antes a Grupos) y columna de Fecha/Hora
 *  separadas -- "seria tambien bueno conocer la hora del envio". */
function VistaAlertasCierre() {
  const [alertas, setAlertas] = useState([]);
  const [conteos, setConteos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [al, cr] = await Promise.all([
        fetchAlertasCierre(),
        fetchConteosRespuestas().catch(() => []),
      ]);
      setAlertas(al);
      setConteos(cr);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  // Igual que en TablaGrupos: nº actual de respuestas de evaluación docente
  // por categoría+mes+materia -- para comparar contra respuestas_antes y ver
  // si la alerta/plantilla tuvo efecto.
  const mapaRespuestasAhora = useMemo(() => mapaDeConteos_(conteos), [conteos]);

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Alertas de cierre</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Materias que ya cerraron sin ninguna respuesta de evaluación docente y se avisó al tutor -- {alertas.length} en total.
          </p>
        </div>
        <button
          type="button"
          onClick={cargar}
          className="text-xs text-slate-300 border border-ink-600 rounded-md px-2.5 py-1.5 hover:bg-ink-700 transition-colors shrink-0"
        >
          Actualizar
        </button>
      </div>

      {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>}
      {cargando ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : alertas.length === 0 ? (
        <p className="text-xs text-slate-500">Todavía no se ha enviado ninguna alerta.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-800">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-ink-850 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Hora</th>
                <th className="px-3 py-2 text-left">Materia</th>
                <th className="px-3 py-2 text-left">Categoría · Mes</th>
                <th className="px-3 py-2 text-left">Tutor</th>
                <th className="px-3 py-2 text-left">Canal</th>
                <th className="px-3 py-2 text-left">Destinatario</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Respuestas</th>
                <th className="px-3 py-2 text-left">Enviada por</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {alertas.map((a) => {
                const ts = a.creado_en ? new Date(a.creado_en) : null;
                const respuestasAhora = mapaRespuestasAhora[claveRespuestas_(a.categoria_programa, a.mes_calificacion, a.materia, a.tutor_calendario)] || 0;
                // antes del 2026-10-15 respuestas_antes guardaba el total de TODA la
                // materia (sin distinguir tutor) -- no es comparable con el conteo actual.
                const anteriorAlCambio = a.creado_en && a.creado_en < FECHA_CONTEO_POR_TUTOR;
                return (
                  <tr key={a.id} className="border-t border-ink-800">
                    <td className="px-3 py-1.5 text-slate-400">
                      {ts ? ts.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-slate-400">
                      {ts ? ts.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-3 py-1.5">{a.materia || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-400">{[a.categoria_programa, a.mes_calificacion].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-1.5">{a.tutor_calendario || '—'}</td>
                    <td className="px-3 py-1.5">{a.canal === 'whatsapp' ? '💬 WhatsApp' : '✉ correo'}</td>
                    <td className="px-3 py-1.5 text-slate-400">{a.destinatario || '—'}</td>
                    <td
                      className={
                        'px-3 py-1.5 font-medium ' +
                        (a.estado === 'enviado' ? 'text-emerald-300' : (a.estado === 'registrada' || a.estado === 'plantilla_generada') ? 'text-amber-300' : 'text-red-300')
                      }
                    >
                      {a.estado === 'enviado' ? 'Enviada' : a.estado === 'registrada' ? 'Registrada' : a.estado === 'plantilla_generada' ? 'Plantilla generada' : 'Error'}
                      {a.detalle ? <span className="text-slate-500 font-normal"> · {a.detalle}</span> : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {a.respuestas_antes !== null && a.respuestas_antes !== undefined ? (
                        <>
                          <span
                            className={anteriorAlCambio ? 'text-slate-500 underline decoration-dotted cursor-help' : undefined}
                            title={anteriorAlCambio ? 'Registrado antes del 15/10/2026: este número era el total de TODA la materia (todos los tutores), no solo el de este tutor. No es comparable con el valor actual.' : undefined}
                          >
                            {a.respuestas_antes}{anteriorAlCambio ? '*' : ''}
                          </span>{' '}→ <b className={!anteriorAlCambio && respuestasAhora > a.respuestas_antes ? 'text-emerald-300' : 'text-slate-300'}>{respuestasAhora}</b>
                          {!anteriorAlCambio && respuestasAhora > a.respuestas_antes && ' ↑'}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{a.enviado_por || '—'}</td>
                  </tr>
                );
              })}
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
            ? { backgroundColor: color + '26', borderColor: color, color: '#f1f5f9' }
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

/** Paleta de carreras -- 2026-10-16, validada con validate_palette.js del
 *  skill dataviz (--mode dark --surface #0f131a --pairs all): única
 *  combinación de 4 de la paleta de referencia que pasa todos los checks.
 *  La anterior fallaba para daltónicos (Marketing rosa ↔ Ingeniería verde).
 *  Son colores de MARCA (punto, borde, fondo tenue, línea): el texto va
 *  siempre en slate -- el verde no llega a 4,5:1 como texto. */
const COLOR_CATEGORIA = {
  Administración: '#9085e9',
  Contabilidad: '#c98500',
  Ingeniería: '#008300',
  Marketing: '#d55181',
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Estadísticas cuantitativas de evaluación docente</h2>
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
                            ? { backgroundColor: color + '26', borderColor: color, color: '#f1f5f9' }
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
 *  CUALITATIVO — 2026-09-23. Codificación temática + sentimiento de los
 *  comentarios abiertos (doc_analisis_cualitativo), clasificados por Claude
 *  Code dentro de la sesión (sin API de pago) sobre una muestra del 78% del
 *  histórico -- el resto quedó pendiente por decisión explícita del usuario
 *  de no seguir gastando en el backfill. Codebook y colores en
 *  TEMAS_CUALITATIVO (evaluacionDocente.js).
 * ========================================================================== */

function Cualitativo() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  // mesFiltro null = paso 1, todavía no se eligió mes (2026-09-24, a pedido
  // del usuario: al entrar debe preguntar el mes ANTES de mostrar nada más).
  const [mesFiltro, setMesFiltro] = useState(null);
  const [subvista, setSubvista] = useState('matriz'); // 'matriz' | 'areas'
  const [pendientes, setPendientes] = useState(null); // { total, porMes: [{mes, pendientes}] } | null mientras carga
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    fetchAnalisisCualitativo()
      .then(setDatos)
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setCargando(false));
    // No bloquea la carga principal ni muestra error propio -- es un dato
    // "nice to have", si falla simplemente no se muestra el aviso.
    fetchCualitativoPendientes().then(setPendientes).catch(() => {});
  }, []);

  // Vista efectiva que alimenta Matriz/Áreas -- 2026-09-28, a pedido del
  // usuario: la vista combinada "Todos" ya no es una pantalla a la que hay
  // que navegar (botón "Ver todos los meses juntos"), va siempre debajo de
  // la tabla de Gestión. mesFiltro null = "Todos" (default); un mes puntual
  // sigue siendo su propia pantalla con botón "‹ Cambiar mes".
  const mesEfectivo = mesFiltro ?? 'todos';

  const pendientesDelMes = useMemo(() => {
    if (!pendientes) return 0;
    if (mesEfectivo === 'todos') return pendientes.total;
    return pendientes.porMes.find((m) => m.mes === mesEfectivo)?.pendientes || 0;
  }, [pendientes, mesEfectivo]);

  async function recalcularMes() {
    if (mesEfectivo === 'todos') return;
    const ok = window.confirm(
      `¿Recalcular ${mesEfectivo}? Esto borra el análisis cualitativo ya hecho de ese mes -- vuelve a quedar "pendiente" hasta que se reclasifique en una sesión de Claude Code. No se puede deshacer.`
    );
    if (!ok) return;
    setRecalculando(true);
    try {
      await fetchRecalcularMesCualitativo(mesEfectivo);
      const [nuevosDatos, nuevosPendientes] = await Promise.all([fetchAnalisisCualitativo(), fetchCualitativoPendientes()]);
      setDatos(nuevosDatos);
      setPendientes(nuevosPendientes);
    } catch (e) {
      window.alert('No se pudo recalcular: ' + (e.message || String(e)));
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold text-slate-100">Estadísticas cualitativas de evaluación</h2>

      {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>}
      {cargando && <p className="text-xs text-slate-400">Cargando análisis cualitativo…</p>}

      {!cargando && !error && mesFiltro === null && (
        <div id="gestion-meses-cualitativo">
          <GestionMeses onVerMes={(m) => setMesFiltro(m)} />
        </div>
      )}

      {!cargando && !error && (
        <div className="space-y-4 pt-1">
          {mesFiltro !== null && (
            <div className="pt-2 border-t border-ink-800" />
          )}
          <div className="flex flex-wrap items-center gap-3">
            {mesFiltro !== null && (
              <>
                <button type="button" onClick={() => setMesFiltro(null)} className="text-xs text-accent-400 hover:text-accent-300 shrink-0">
                  ‹ Cambiar mes
                </button>
                <span className="text-xs text-slate-500">
                  Mes: <span className="font-semibold" style={{ color: colorDeMes(mesFiltro) }}>{mesFiltro}</span>
                </span>
                <button
                  type="button"
                  onClick={recalcularMes}
                  disabled={recalculando}
                  title="Borra el análisis cualitativo de este mes para que se vuelva a clasificar en la próxima sesión de Claude Code"
                  className="text-[11px] px-2 py-1 rounded-md border border-ink-700 text-slate-400 hover:text-amber-300 hover:border-amber-800 disabled:opacity-50 disabled:cursor-wait"
                >
                  {recalculando ? 'Recalculando…' : '🔄 Recalcular este mes'}
                </button>
              </>
            )}
            {mesFiltro === null && (
              <span className="text-xs text-slate-500">
                Vista combinada: <span className="font-semibold text-slate-300">Todos los meses</span>
              </span>
            )}
            <div className="inline-flex rounded-md border border-ink-700 overflow-hidden text-xs ml-auto">
              <button
                type="button"
                onClick={() => setSubvista('matriz')}
                className={'px-3 py-1.5 font-semibold ' + (subvista === 'matriz' ? 'bg-accent-600 text-white' : 'text-slate-400 hover:bg-ink-800')}
              >
                Matriz Descriptiva
              </button>
              <button
                type="button"
                onClick={() => setSubvista('areas')}
                className={'px-3 py-1.5 font-semibold ' + (subvista === 'areas' ? 'bg-accent-600 text-white' : 'text-slate-400 hover:bg-ink-800')}
              >
                Áreas Temáticas
              </button>
            </div>
          </div>

          {pendientesDelMes > 0 && (
            <div className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/60 rounded-md px-3 py-2">
              ⚠ Hay <b>{pendientesDelMes}</b> comentario{pendientesDelMes === 1 ? '' : 's'} nuevo{pendientesDelMes === 1 ? '' : 's'} sin clasificar todavía (respuestas que llegaron o cambiaron después del último análisis). Pídele a Claude que los procese para que los números de acá queden al día.
            </div>
          )}

          {subvista === 'matriz' && (
            <MatrizDescriptiva
              datos={datos}
              mesFiltro={mesEfectivo}
              onCambiarMes={() => document.getElementById('gestion-meses-cualitativo')?.scrollIntoView({ behavior: 'smooth' })}
            />
          )}
          {subvista === 'areas' && <AreasTematicas datos={datos} mesFiltro={mesEfectivo} />}
        </div>
      )}
    </section>
  );
}

/** Tabla de "Gestión" -- paso 1 de Cualitativo, 2026-09-28 a pedido del
 *  usuario: reemplaza los chips de mes simples por un panel que muestra los
 *  12 meses del año con su tabla de origen real, si ya se procesó y cuándo.
 *  Enero-Julio (bloque histórico `doc_historico_enero_julio_2026`) se
 *  muestra con `habilitado:false` -- ese bloque todavía no está integrado
 *  al pipeline de invalidación/reclasificación, así que el botón de
 *  gestión ahí es solo informativo hasta que se decida activarlo. */
function GestionMeses({ onVerMes }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  // modal: { fila, paso } -- paso maneja un mini flujo dentro del propio
  // modal ('deshabilitado' | 'sin-datos' | 'procesar-nuevo' | 'copiado' |
  // 'copiado-fallo' | 'confirmar-reproceso-1' | 'confirmar-reproceso-2' |
  // 'clave' | 'procesando' | 'resultado'). 2026-09-28: reemplaza
  // window.confirm/prompt/alert -- a pedido del usuario, la confirmación y
  // la clave deben quedar DENTRO de la app, no como diálogos nativos del
  // navegador.
  const [modal, setModal] = useState(null);

  const cargar = useCallback(() => {
    fetchEstadoMesesCualitativo()
      .then(setFilas)
      .catch((e) => setError(e.message || String(e)));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirGestion(fila) {
    if (!fila.habilitado) { setModal({ fila, paso: 'deshabilitado' }); return; }
    if (fila.estado !== 'procesado') {
      setModal({ fila, paso: fila.pendientes === 0 ? 'sin-datos' : 'procesar-nuevo' });
      return;
    }
    setModal({ fila, paso: 'confirmar-reproceso-1' });
  }

  async function procesarNuevo(fila) {
    try {
      await navigator.clipboard.writeText(`Clasificá ${fila.mes}, por favor.`);
      setModal({ fila, paso: 'copiado' });
    } catch {
      setModal({ fila, paso: 'copiado-fallo' });
    }
  }

  async function confirmarClave(fila, clave) {
    if (clave !== 'FESNA2026') {
      setModal({ fila, paso: 'clave', claveError: 'Clave incorrecta.' });
      return;
    }
    setModal({ fila, paso: 'procesando' });
    try {
      const filasBorradas = await fetchRecalcularMesCualitativo(fila.mes);
      setModal({
        fila,
        paso: 'resultado',
        mensaje: `Listo: se invalidaron ${filasBorradas} comentario${filasBorradas === 1 ? '' : 's'} de ${fila.mes} (los que cambiaron de verdad). Van a quedar pendientes hasta que se reclasifiquen.`,
      });
      cargar();
    } catch (e) {
      setModal({ fila, paso: 'resultado', mensaje: 'No se pudo reprocesar: ' + (e.message || String(e)), esError: true });
    }
  }

  if (error) return <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>;
  if (!filas) return <p className="text-xs text-slate-400">Cargando estado de los meses…</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Estado de la clasificación cualitativa por mes. La vista combinada de todos los meses está debajo de esta tabla.</p>
      <div className="overflow-x-auto rounded-lg border border-ink-700">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-950/60">
              <th className="text-left px-3 py-2 text-slate-500 font-medium">Mes</th>
              <th className="text-left px-3 py-2 text-slate-500 font-medium">Año</th>
              <th className="text-left px-3 py-2 text-slate-500 font-medium">Estado</th>
              <th className="text-left px-3 py-2 text-slate-500 font-medium">Tabla de origen</th>
              <th className="text-right px-3 py-2 text-slate-500 font-medium">Encuestados</th>
              <th className="text-left px-3 py-2 text-slate-500 font-medium">Procesamiento</th>
              <th className="text-left px-3 py-2 text-slate-500 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.mes} className={'border-b border-ink-800 last:border-b-0 hover:bg-ink-800/30' + (!fila.habilitado ? ' opacity-60' : '')}>
                <td className="px-3 py-2">
                  {fila.habilitado ? (
                    <button type="button" onClick={() => onVerMes(fila.mes)} className="font-semibold hover:underline" style={{ color: colorDeMes(fila.mes) }}>
                      {fila.mes}
                    </button>
                  ) : (
                    <span className="font-semibold text-slate-400">{fila.mes}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-400">{fila.anio}</td>
                <td className="px-3 py-2">
                  <span className={'inline-flex items-center gap-1.5 font-semibold ' + (fila.estado === 'procesado' ? 'text-emerald-400' : 'text-slate-500')}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: fila.estado === 'procesado' ? '#10b981' : '#64748b' }} />
                    {fila.estado === 'procesado' ? 'Procesado' : 'No procesado'}
                  </span>
                  {fila.pendientes > 0 && <span className="ml-1.5 text-amber-400">· {fila.pendientes} pend.</span>}
                </td>
                <td className="px-3 py-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">{fila.tabla_origen}</td>
                <td className="px-3 py-2 text-right text-slate-300">{fila.cantidad_encuestados}</td>
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fila.ultimo_procesamiento ? formatearFechaHora_(fila.ultimo_procesamiento) : 'Nunca'}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => abrirGestion(fila)}
                    className="text-[11px] px-2 py-1 rounded-md border border-ink-700 text-slate-400 hover:text-accent-300 hover:border-accent-800"
                  >
                    Gestión
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ModalGestionMes
          modal={modal}
          onCerrar={() => setModal(null)}
          onProcesarNuevo={procesarNuevo}
          onAvanzar={(paso) => setModal((m) => ({ ...m, paso }))}
          onConfirmarClave={confirmarClave}
        />
      )}
    </div>
  );
}

/** Modal in-app del flujo de "Gestión" por mes -- confirmar, confirmar de
 *  nuevo, pedir la clave "FESNA2026" y mostrar el resultado, todo dentro de
 *  la aplicación (sin window.confirm/prompt/alert). */
function ModalGestionMes({ modal, onCerrar, onProcesarNuevo, onAvanzar, onConfirmarClave }) {
  const { fila, paso, claveError } = modal;
  const [claveLocal, setClaveLocal] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={paso === 'procesando' ? undefined : onCerrar}>
      <div className="bg-ink-900 border border-ink-700 rounded-lg p-5 max-w-md w-full space-y-4 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Gestión — {fila.mes} {fila.anio}</h3>
          {paso !== 'procesando' && (
            <button type="button" onClick={onCerrar} className="text-slate-500 hover:text-slate-300 leading-none">✕</button>
          )}
        </div>

        {paso === 'deshabilitado' && (
          <>
            <p className="text-sm text-slate-300">El bloque histórico ({fila.mes}) todavía no está habilitado para procesar desde acá.</p>
            <p className="text-xs text-slate-500">Avisale a Nicolás en el chat si querés activarlo.</p>
            <div className="flex justify-end">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md bg-accent-600 text-white font-semibold hover:bg-accent-500">Entendido</button>
            </div>
          </>
        )}

        {paso === 'sin-datos' && (
          <>
            <p className="text-sm text-slate-300">{fila.mes} todavía no tiene respuestas cargadas.</p>
            <div className="flex justify-end">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md bg-accent-600 text-white font-semibold hover:bg-accent-500">Entendido</button>
            </div>
          </>
        )}

        {paso === 'procesar-nuevo' && (
          <>
            <p className="text-sm text-slate-300">
              ¿Deseás procesar <b>{fila.mes}</b>? Hay <b>{fila.pendientes}</b> comentario{fila.pendientes === 1 ? '' : 's'} sin clasificar.
            </p>
            <p className="text-xs text-slate-500">Esto no lo hace un script solo -- le vas a tener que pedir a Claude en el chat que los revise uno por uno (sin API de pago de por medio).</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-slate-400 hover:bg-ink-800">Cancelar</button>
              <button type="button" onClick={() => onProcesarNuevo(fila)} className="text-xs px-3 py-1.5 rounded-md bg-accent-600 text-white font-semibold hover:bg-accent-500">Sí, procesar</button>
            </div>
          </>
        )}

        {(paso === 'copiado' || paso === 'copiado-fallo') && (
          <>
            <p className="text-sm text-slate-300">
              {paso === 'copiado' ? 'Copiado al portapapeles:' : 'Pedile a Claude en el chat:'}{' '}
              <span className="font-mono text-accent-300">"Clasificá {fila.mes}, por favor."</span>
            </p>
            <p className="text-xs text-slate-500">Pegaselo en una sesión de Claude Code cuando quieras que lo procese.</p>
            <div className="flex justify-end">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md bg-accent-600 text-white font-semibold hover:bg-accent-500">Listo</button>
            </div>
          </>
        )}

        {paso === 'confirmar-reproceso-1' && (
          <>
            <p className="text-sm text-slate-300">
              <b>{fila.mes}</b> ya fue procesado (última vez: {formatearFechaHora_(fila.ultimo_procesamiento)}). ¿Deseás reprocesarlo?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-slate-400 hover:bg-ink-800">Cancelar</button>
              <button type="button" onClick={() => onAvanzar('confirmar-reproceso-2')} className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-500">Sí, reprocesar</button>
            </div>
          </>
        )}

        {paso === 'confirmar-reproceso-2' && (
          <>
            <p className="text-sm text-amber-300 font-semibold">¿Estás completamente seguro?</p>
            <p className="text-xs text-slate-400">
              Esto invalida (no borra todo el mes, solo lo que cambió de texto de verdad) los comentarios de {fila.mes} -- van a quedar "pendientes" hasta que Claude los reclasifique.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-slate-400 hover:bg-ink-800">Cancelar</button>
              <button type="button" onClick={() => onAvanzar('clave')} className="text-xs px-3 py-1.5 rounded-md bg-red-700 text-white font-semibold hover:bg-red-600">Sí, estoy seguro</button>
            </div>
          </>
        )}

        {paso === 'clave' && (
          <>
            <p className="text-sm text-slate-300">Escribí la clave para confirmar el reprocesamiento de <b>{fila.mes}</b>:</p>
            <input
              type="password"
              value={claveLocal}
              onChange={(e) => setClaveLocal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onConfirmarClave(fila, claveLocal); }}
              autoFocus
              className="w-full bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {claveError && <p className="text-xs text-red-400">{claveError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-slate-400 hover:bg-ink-800">Cancelar</button>
              <button type="button" onClick={() => onConfirmarClave(fila, claveLocal)} className="text-xs px-3 py-1.5 rounded-md bg-red-700 text-white font-semibold hover:bg-red-600">Confirmar</button>
            </div>
          </>
        )}

        {paso === 'procesando' && (
          <p className="text-sm text-slate-400">Reprocesando {fila.mes}…</p>
        )}

        {paso === 'resultado' && (
          <>
            <p className={'text-sm ' + (modal.esError ? 'text-red-300' : 'text-emerald-300')}>{modal.mensaje}</p>
            <div className="flex justify-end">
              <button type="button" onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-md bg-accent-600 text-white font-semibold hover:bg-accent-500">Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Descarga un .txt en el navegador con los comentarios de un panel de
 *  sentimiento (Áreas Temáticas > detalle de tema) -- 2026-09-28, a pedido
 *  del usuario. Sin backend: arma el archivo en el cliente con Blob y
 *  dispara la descarga con un <a> temporal. */
function descargarTxt_(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function descargarComentarios_(tema, sentimiento, lista, campoMeta) {
  const encabezado = `${tema.label} — ${sentimiento.label} (${lista.length} comentario${lista.length === 1 ? '' : 's'})`;
  const cuerpo = lista
    .map((f, i) => {
      const meta = [campoMeta[f.campo_origen] || f.campo_origen, f.mes_calificacion, f.categoria_programa].filter(Boolean).join(' · ');
      return `${i + 1}. [${meta}]\n${f.texto}\n`;
    })
    .join('\n');
  const nombreArchivo = `${tema.key}_${sentimiento.key}.txt`;
  descargarTxt_(nombreArchivo, `${encabezado}\n${'='.repeat(encabezado.length)}\n\n${cuerpo}`);
}

/** "2026-09-28T20:43:42+00:00" -> "28/09/2026, 2:43 p.m." (formato 12h). */
function formatearFechaHora_(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fecha}, ${hora}`;
}

/** Pestaña "Áreas Temáticas" -- el árbol de temas por rama + panel de
 *  detalle al seleccionar uno (lo que ya existía como cuerpo único de
 *  Cualitativo, ahora extraído porque el mes se elige en un paso previo y
 *  esto convive con la Matriz Descriptiva como pestaña hermana). */
function AreasTematicas({ datos, mesFiltro }) {
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [incluirSinSustancia, setIncluirSinSustancia] = useState(false);
  const [temaSeleccionado, setTemaSeleccionado] = useState(null);
  const [resumenAbierto, setResumenAbierto] = useState(false);

  const filtrados = useMemo(() => {
    return datos.filter(
      (d) =>
        (mesFiltro === 'todos' || d.mes_calificacion === mesFiltro) &&
        (categoriaFiltro === 'todas' || d.categoria_programa === categoriaFiltro)
    );
  }, [datos, mesFiltro, categoriaFiltro]);

  // Filas "con señal" = tienen al menos un tema distinto de SIN_SUSTANCIA.
  // El gráfico principal usa esto por defecto -- mezclar miles de "todo
  // bien" diluye la lectura de lo que sí importa (checkbox para verlo igual).
  const filasSenal = useMemo(() => filtrados.filter((f) => f.temas.some((t) => t !== 'SIN_SUSTANCIA')), [filtrados]);
  const filasSinSustancia = filtrados.length - filasSenal.length;
  const base = incluirSinSustancia ? filtrados : filasSenal;

  // Respuestas (estudiantes) únicas en este filtro -- para anclar "X
  // comentarios" a algo entendible (un estudiante puede escribir hasta 4
  // comentarios sueltos: Plataforma/Docente/Contenidos/General), mismo
  // criterio que ya se usa en Matriz Descriptiva (2026-09-24, a pedido del
  // usuario: "me podría perder... si son 300 respuestas aprox pero 3182
  // comentarios").
  const respuestasUnicas = useMemo(() => new Set(filtrados.map((f) => f.comentario_id)).size, [filtrados]);

  const conteoTemas = useMemo(() => {
    const c = {};
    base.forEach((f) => f.temas.forEach((t) => { if (incluirSinSustancia || t !== 'SIN_SUSTANCIA') c[t] = (c[t] || 0) + 1; }));
    return c;
  }, [base, incluirSinSustancia]);

  const temasOrdenados = TEMAS_CUALITATIVO.filter((t) => t.key !== 'SIN_SUSTANCIA' && conteoTemas[t.key] > 0)
    .sort((a, b) => (conteoTemas[b.key] || 0) - (conteoTemas[a.key] || 0));

  // "Áreas más críticas" -- 2026-09-28, a pedido del usuario: de un vistazo,
  // qué temas concentran más quejas (no solo cuáles se mencionan más).
  // Ordena por cantidad de comentarios negativos (mixto cuenta aparte, no
  // se suma) -- sirve tanto para un mes puntual como para "Todos" porque es
  // el mismo componente en los dos casos.
  const areasGraves = useMemo(() => {
    const porTema = {};
    filasSenal.forEach((f) => {
      f.temas.forEach((t) => {
        if (t === 'SIN_SUSTANCIA') return;
        const acc = porTema[t] || (porTema[t] = { negativo: 0, mixto: 0, total: 0 });
        acc.total += 1;
        if (f.sentimiento === 'negativo') acc.negativo += 1;
        if (f.sentimiento === 'mixto') acc.mixto += 1;
      });
    });
    return Object.entries(porTema)
      .map(([key, v]) => ({
        key,
        tema: TEMAS_CUALITATIVO.find((t) => t.key === key),
        ...v,
        pctNegativo: v.total > 0 ? Math.round((v.negativo / v.total) * 100) : 0,
      }))
      .filter((a) => a.negativo > 0)
      .sort((a, b) => b.negativo - a.negativo || b.pctNegativo - a.pctNegativo)
      .slice(0, 5);
  }, [filasSenal]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <ChipFiltro activo={categoriaFiltro === 'todas'} onClick={() => { setCategoriaFiltro('todas'); setTemaSeleccionado(null); }} color="#94a3b8">Todas las categorías</ChipFiltro>
          {CATEGORIAS_EVALUACION_DOCENTE.map((c) => (
            <ChipFiltro key={c} activo={categoriaFiltro === c} onClick={() => { setCategoriaFiltro(c); setTemaSeleccionado(null); }} color={COLOR_CATEGORIA[c] || '#5b7fff'}>{c}</ChipFiltro>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400 ml-auto">
          <input type="checkbox" checked={incluirSinSustancia} onChange={(e) => setIncluirSinSustancia(e.target.checked)} />
          Incluir comentarios sin sustancia
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 bg-ink-800/50 border border-ink-700 rounded-md px-3 py-2">
        <span className="text-slate-200 font-semibold">{respuestasUnicas} respuestas</span>
        <span className="text-slate-600">→</span>
        <span>{filtrados.length} comentarios escritos <span className="text-slate-600">(hasta 4 x respuesta)</span></span>
        <span className="text-slate-600">·</span>
        <span className="text-emerald-300 font-semibold">{filasSenal.length} con tema identificable</span>
        <span className="text-slate-600">·</span>
        <span>{filasSinSustancia} sin sustancia <span className="text-slate-600">(genéricos: "todo bien", "n/a", etc.)</span></span>
        {datos && datos.length > 0 && <span className="text-slate-600">· cobertura: 100% del histórico</span>}
      </div>

      <div className="rounded-lg border border-ink-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setResumenAbierto((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-ink-800/60 hover:bg-ink-800 transition-colors"
        >
          <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
            📊 Resumen
            {areasGraves.length > 0 && (
              <span className="text-[11px] font-semibold text-red-300 bg-red-950/50 border border-red-900/60 rounded-full px-2 py-0.5">
                {areasGraves.length} área{areasGraves.length === 1 ? '' : 's'} crítica{areasGraves.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
          <span className="text-[11px] text-slate-400">{resumenAbierto ? '▲ Ocultar' : '▼ Ver áreas más afectadas'}</span>
        </button>

        {resumenAbierto && (
          <div className="px-3 py-3 border-t border-ink-700">
            <p className="text-[11px] font-semibold text-slate-400 mb-2">
              🔥 Áreas más críticas {mesFiltro === 'todos' ? '(todos los meses)' : `de ${mesFiltro}`} -- ordenadas por cantidad de comentarios negativos
            </p>
            {areasGraves.length === 0 ? (
              <p className="text-xs text-slate-500">No hay comentarios negativos en este filtro.</p>
            ) : (
              <div className="space-y-2.5">
                {areasGraves.map((a, i) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setTemaSeleccionado(a.key)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs text-slate-200 font-medium truncate group-hover:text-white">
                        <span className="text-red-400 font-bold mr-1">{i + 1}.</span>{a.tema?.label || a.key}
                      </span>
                      <span className="text-[11px] text-red-300 font-semibold shrink-0">
                        {a.negativo} negativo{a.negativo === 1 ? '' : 's'}{a.mixto > 0 ? ` + ${a.mixto} mixto${a.mixto === 1 ? '' : 's'}` : ''} · {a.pctNegativo}%
                      </span>
                    </div>
                    <div className="w-full bg-ink-800 rounded h-2 overflow-hidden">
                      <div className="h-full bg-red-500 rounded transition-all" style={{ width: `${a.pctNegativo}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Temas más mencionados</h3>
        <p className="text-[11px] text-slate-500 mb-2">Clic en un tema para ver de qué se trata y leer comentarios reales de estudiantes.</p>
        {temasOrdenados.length === 0 ? (
          <p className="text-xs text-slate-500">Sin datos para este filtro.</p>
        ) : (
          <div className="space-y-4">
            {RAMAS_CUALITATIVO.map((rama) => {
              const temasRama = temasOrdenados.filter((t) => t.rama === rama.key);
              if (temasRama.length === 0) return null;
              const totalRama = temasRama.reduce((acc, t) => acc + (conteoTemas[t.key] || 0), 0);
              // Barras contra el TOTAL de opiniones con tema identificable (no el
              // máximo de la rama) -- a pedido del usuario: así el largo de la
              // barra es una proporción real y comparable entre ramas, no solo
              // relativa dentro de su propia familia.
              const pctRama = filasSenal.length > 0 ? Math.round((totalRama / filasSenal.length) * 100) : 0;
              return (
                <div key={rama.key}>
                  <div className="flex items-center gap-2 mb-1.5 pb-1 border-b" style={{ borderColor: rama.color + '40' }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rama.color }} />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: rama.color }}>{rama.label}</span>
                    <span className="text-[11px] text-slate-500">{totalRama} · {pctRama}% del total</span>
                  </div>
                  <div className="space-y-1.5 pl-4">
                    {temasRama.map((t) => {
                      const n = conteoTemas[t.key] || 0;
                      const pct = filasSenal.length > 0 ? Math.round((n / filasSenal.length) * 1000) / 10 : 0;
                      const activo = temaSeleccionado === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setTemaSeleccionado(activo ? null : t.key)}
                          className={'w-full flex items-center gap-2 rounded px-1 py-0.5 -mx-1 transition-colors ' + (activo ? 'bg-ink-800' : 'hover:bg-ink-850')}
                        >
                          <span className={'w-44 shrink-0 text-xs text-left truncate ' + (activo ? 'text-white font-semibold' : 'text-slate-300')} title={t.label}>{t.label}</span>
                          <div className="flex-1 bg-ink-800 rounded h-4 overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: t.color, opacity: activo ? 1 : 0.85 }} />
                          </div>
                          <span className="w-20 shrink-0 text-xs text-slate-400 text-right">{n} · {pct}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {temaSeleccionado && (
        <DetalleTema
          tema={TEMAS_CUALITATIVO.find((t) => t.key === temaSeleccionado)}
          filas={filasSenal.filter((f) => f.temas.includes(temaSeleccionado))}
          onCerrar={() => setTemaSeleccionado(null)}
        />
      )}
    </div>
  );
}

/** Pestaña "Matriz Descriptiva" -- 2026-09-24, a pedido del usuario, sobre
 *  el formato de un ejemplo que compartió (hoja de cálculo con 3 bloques por
 *  carrera). El bloque 3 es lo nuevo de verdad: cruza el SENTIMIENTO del
 *  comentario cualitativo con el PROMEDIO REAL que ese mismo estudiante dio
 *  en las preguntas Likert cuantitativas (por sección: Profesor/Contenidos/
 *  Plataforma/Institución-NPS) -- responde "¿un estudiante que escribió algo
 *  negativo también calificó bajo en números, o hay un desfase entre lo que
 *  dice y lo que califica?". Se deduplica por comentario_id para no contar
 *  la nota del mismo estudiante varias veces si dejó comentarios en más de
 *  un campo con el mismo sentimiento. */
function MatrizDescriptiva({ datos, mesFiltro, onCambiarMes }) {
  const filtrados = useMemo(
    () => datos.filter((d) => mesFiltro === 'todos' || d.mes_calificacion === mesFiltro),
    [datos, mesFiltro]
  );

  // Promedios Likert/NPS: se piden aparte, ya agregados del lado del
  // servidor (ver ERR-020 en error-knowledge-base.md -- mandar los 14
  // campos Likert de las ~4900 filas de golpe fue lo que tumbó el workflow
  // por falta de memoria). Solo existe para un mes puntual, nunca "Todos".
  const [promediosServidor, setPromediosServidor] = useState(null);
  const [cargandoPromedios, setCargandoPromedios] = useState(false);

  useEffect(() => {
    if (!mesFiltro || mesFiltro === 'todos') {
      setPromediosServidor(null);
      return;
    }
    setCargandoPromedios(true);
    fetchMatrizPromedio(mesFiltro)
      .then(setPromediosServidor)
      .catch(() => setPromediosServidor(null))
      .finally(() => setCargandoPromedios(false));
  }, [mesFiltro]);

  const porCarrera = useMemo(() => {
    return CATEGORIAS_EVALUACION_DOCENTE.map((carrera) => {
      const filas = filtrados.filter((f) => f.categoria_programa === carrera);
      const comentariosEscritos = filas.length; // filas sueltas: hasta 4 por estudiante (plataforma+docente+contenidos+general)
      const filasSenal = filas.filter((f) => f.temas.some((t) => t !== 'SIN_SUSTANCIA'));

      // "Con tema" / "sin sustancia" se miden por RESPUESTA (estudiante), no
      // por comentario suelto -- un estudiante cuenta como "con tema" si AL
      // MENOS UNO de sus hasta-4 comentarios tiene un tema identificable
      // (2026-09-24: antes contaba comentarios sueltos, lo que inflaba el
      // total hasta 4x y no cuadraba con "Total de respuestas" de arriba).
      const porEstudiante = new Map();
      filas.forEach((f) => {
        const actual = porEstudiante.get(f.comentario_id) || { conTema: false };
        if (f.temas.some((t) => t !== 'SIN_SUSTANCIA')) actual.conTema = true;
        porEstudiante.set(f.comentario_id, actual);
      });
      const totalRespuestas = porEstudiante.size;
      const conTema = [...porEstudiante.values()].filter((e) => e.conTema).length;
      const sinSustancia = totalRespuestas - conTema;

      const promediosCarrera = promediosServidor?.find((p) => p.carrera === carrera);
      const porTipo = SENTIMIENTOS_CUALITATIVO.map((s) => {
        const filasTipo = filasSenal.filter((f) => f.sentimiento === s.key);
        const servidor = promediosCarrera?.porTipo?.find((t) => t.sentimiento === s.key);
        return {
          sentimiento: s,
          frecuencia: filasTipo.length,
          profesor: servidor?.profesor ?? null,
          contenidos: servidor?.contenidos ?? null,
          plataforma: servidor?.plataforma ?? null,
          nps: servidor?.nps ?? null,
        };
      });

      // Solo para el embudo (unidad = comentarios, no respuestas, para que
      // las 3 etapas narren de forma monótona decreciente: posibles >=
      // escritos >= con tema). Distinto de conTema/sinSustancia de arriba,
      // que son por RESPUESTA y alimentan la tabla de Promedio de nota.
      const comentariosPosibles = totalRespuestas * 4;
      const comentariosConTema = filasSenal.length;

      return { carrera, comentariosEscritos, comentariosPosibles, comentariosConTema, sinSustancia, conTema, totalRespuestas, porTipo };
    });
  }, [filtrados, promediosServidor]);

  const totalRespuestasGlobal = porCarrera.reduce((acc, c) => acc + c.totalRespuestas, 0);

  return (
    <div className="space-y-5">
      <BloqueMatriz icono="👥" titulo={`Total de respuestas ${mesFiltro === 'todos' ? '(todos los meses)' : `para ${mesFiltro}`}`}>
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="bg-ink-950/60 border border-ink-600 rounded-lg px-5 py-3 flex flex-col justify-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Total</div>
            <div className="text-3xl font-extrabold text-slate-100 leading-tight">{totalRespuestasGlobal}</div>
          </div>
          <div className="flex flex-wrap gap-2 flex-1">
            {porCarrera.map((c) => {
              const color = COLOR_CATEGORIA[c.carrera] || '#5b7fff';
              const pct = totalRespuestasGlobal > 0 ? Math.round((c.totalRespuestas / totalRespuestasGlobal) * 100) : 0;
              return (
                <div key={c.carrera} className="rounded-md px-3 py-2 min-w-[130px] flex-1" style={{ backgroundColor: color + '14', borderLeft: `3px solid ${color}` }}>
                  <div className="text-[11px] font-bold text-slate-200">{c.carrera}</div>
                  <div className="text-lg font-bold text-slate-100 leading-tight">{c.totalRespuestas} <span className="text-[10px] font-normal text-slate-500">({pct}%)</span></div>
                </div>
              );
            })}
          </div>
        </div>
      </BloqueMatriz>

      <BloqueMatriz
        icono="📋"
        titulo="Distribución de comentarios cualitativos"
        descripcion='Cada respuesta puede generar hasta 4 comentarios (Plataforma/Docente/Contenidos/General); de esos, algunos no dicen nada real ("todo bien", "n/a") y otros sí traen un tema identificable.'
      >
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {porCarrera.map((c) => (
            <EmbudoCarrera key={c.carrera} c={c} color={COLOR_CATEGORIA[c.carrera] || '#5b7fff'} />
          ))}
        </div>
      </BloqueMatriz>

      <BloqueMatriz
        icono="🎯"
        titulo="Promedio de nota de comentarios con tema identificable"
        descripcion='Cruza el sentimiento del comentario con el promedio real (escala 1-5; Institución/NPS es 0-10) que ese mismo estudiante dio en la parte cuantitativa. Color = qué tan alta o baja es la nota, no el sentimiento.'
      >
        {mesFiltro === 'todos' ? (
          <div className="text-xs text-slate-500 italic flex flex-wrap items-center gap-2">
            <span>Elegí un mes específico (no "Todos") para ver esta tabla -- se calcula del lado del servidor mes por mes para no volver a sobrecargar el workflow (ver ERR-020).</span>
            <button
              type="button"
              onClick={onCambiarMes}
              className="not-italic text-accent-400 hover:text-accent-300 font-semibold shrink-0"
            >
              Elegir mes ›
            </button>
          </div>
        ) : cargandoPromedios ? (
          <p className="text-xs text-slate-400">Cargando promedios…</p>
        ) : (
        <div className="space-y-4">
          {porCarrera.map((c) => {
            const color = COLOR_CATEGORIA[c.carrera] || '#5b7fff';
            return (
              <div key={c.carrera} className="rounded-lg overflow-hidden border" style={{ borderColor: color + '35' }}>
                <div className="px-3 py-1.5 text-xs font-bold text-slate-100 flex items-center gap-1.5" style={{ backgroundColor: color + '1c' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  {c.carrera}
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr className="border-b border-ink-700">
                        <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Tipo</th>
                        <th className="text-right px-3 py-1.5 text-slate-500 font-medium">Frecuencia</th>
                        <th className="text-center px-3 py-1.5 text-slate-500 font-medium">Profesor</th>
                        <th className="text-center px-3 py-1.5 text-slate-500 font-medium">Contenidos</th>
                        <th className="text-center px-3 py-1.5 text-slate-500 font-medium">Plataforma</th>
                        <th className="text-center px-3 py-1.5 text-slate-500 font-medium">Institución/NPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.porTipo.map((t) => (
                        <tr key={t.sentimiento.key} className="border-b border-ink-800 last:border-b-0">
                          <td className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: t.sentimiento.color }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.sentimiento.color }} />
                              {t.sentimiento.label}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{t.frecuencia}</td>
                          <td className="px-3 py-1.5 text-center"><PildoraNota valor={t.profesor} max={5} /></td>
                          <td className="px-3 py-1.5 text-center"><PildoraNota valor={t.contenidos} max={5} /></td>
                          <td className="px-3 py-1.5 text-center"><PildoraNota valor={t.plataforma} max={5} /></td>
                          <td className="px-3 py-1.5 text-center"><PildoraNota valor={t.nps} max={10} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </BloqueMatriz>
    </div>
  );
}

/** Embudo por carrera (2026-09-24, a pedido del usuario: "para alguien que
 *  no hizo la encuesta, deberíamos dejarlo claro... no sé si un embudo sería
 *  mejor visualmente"). Solo 2 escalones REALES que se angostan (Respuestas
 *  -> Con tema identificable, que siempre es <= Respuestas); los "hasta 4
 *  comentarios por respuesta" van como anotación de ramificación en el medio
 *  (esa parte CRECE, no encaja en un embudo que se angosta) y "sin
 *  sustancia" se muestra como el recorte que se queda afuera. */
function EmbudoCarrera({ c, color }) {
  const sinEscribir = Math.max(0, c.comentariosPosibles - c.comentariosEscritos);
  const sinSustancia = Math.max(0, c.comentariosEscritos - c.comentariosConTema);

  const etapas = [
    {
      label: 'Comentarios posibles',
      valor: c.comentariosPosibles,
      info: `Cada respuesta trae 4 preguntas abiertas (Plataforma, Docente, Contenidos y General). Con ${c.totalRespuestas} respuestas, el máximo teórico es ${c.totalRespuestas} × 4 = ${c.comentariosPosibles} comentarios posibles.`,
    },
    {
      label: 'Comentarios escritos',
      valor: c.comentariosEscritos,
      info: `De esos ${c.comentariosPosibles} comentarios posibles, los estudiantes realmente escribieron ${c.comentariosEscritos}. La diferencia (${sinEscribir}) quedó en blanco -- el campo "General" es opcional, por eso no todos llegan al máximo.`,
    },
    {
      label: 'Con tema identificable',
      valor: c.comentariosConTema,
      info: `De los ${c.comentariosEscritos} comentarios escritos, ${c.comentariosConTema} dicen algo real. Los otros ${sinSustancia} son genéricos ("todo bien", "n/a", "excelente" sueltos) y no aportan un tema.`,
    },
  ];
  const secundarios = [
    null,
    {
      label: 'Sin escribir',
      valor: sinEscribir,
      info: `De los ${c.comentariosPosibles} comentarios posibles (${c.totalRespuestas} respuestas × 4 preguntas), ${sinEscribir} quedaron en blanco -- el estudiante no llenó ese campo. Es normal que no dé cero: "General" es opcional, y a veces se saltan alguno de los otros.`,
    },
    {
      label: 'Sin sustancia',
      valor: sinSustancia,
      info: `De los ${c.comentariosEscritos} comentarios que sí se escribieron, ${sinSustancia} no dicen nada real -- son respuestas genéricas como "todo bien", "n/a" o "excelente" sueltos, sin ningún tema identificable.`,
    },
  ];

  const max = etapas[0].valor || 1;
  const W = 300;
  const H = 50; // alto máximo del trapecio
  const HMIN = 8; // para que un valor chico siga siendo visible, no desaparezca
  const altura_ = (v) => HMIN + (Math.max(0, v) / max) * (H - HMIN);
  const alturas = etapas.map((e) => altura_(e.valor));
  const segW = W / 3;

  return (
    <div className="rounded-lg border bg-ink-950/40 p-3" style={{ borderColor: color + '35' }}>
      <div className="text-xs font-bold mb-2 text-center" style={{ color }}>
        {c.carrera} <span className="text-slate-400 font-normal">· {c.totalRespuestas} respuestas</span>
      </div>

      <div className="grid grid-cols-3 gap-1 mb-1">
        {etapas.map((e, i) => (
          <div key={i} className="text-center px-0.5">
            <div className="text-[9px] text-slate-500 leading-tight h-6 flex items-start justify-center gap-0.5">
              <span>{e.label}</span>
              <span title={e.info} className="text-slate-600 hover:text-slate-300 cursor-help shrink-0 leading-none">ⓘ</span>
            </div>
            <div className="text-sm font-bold text-slate-100">{e.valor}</div>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="46" preserveAspectRatio="none">
        {[0, 1, 2].map((i) => {
          const x0 = i * segW;
          const x1 = x0 + segW;
          const hIzq = alturas[i];
          const hDer = i < 2 ? alturas[i + 1] : alturas[i]; // último segmento queda plano
          const opacidad = 0.42 + (i / 2) * 0.58; // claro -> oscuro, un solo color
          return (
            <polygon
              key={i}
              points={`${x0},0 ${x1},0 ${x1},${hDer} ${x0},${hIzq}`}
              fill={color}
              fillOpacity={opacidad}
              stroke={i > 0 ? '#0b0f1a' : 'none'}
              strokeWidth={i > 0 ? 1.5 : 0}
            />
          );
        })}
      </svg>

      <div className="grid grid-cols-3 gap-1 mt-1.5">
        {secundarios.map((s, i) => (
          <div key={i} className="text-center px-0.5 text-[9.5px] text-slate-500 leading-tight">
            {s && (
              <>
                <span className="inline-flex items-center gap-0.5">
                  {s.label}
                  <span title={s.info} className="text-slate-600 hover:text-slate-300 cursor-help shrink-0 leading-none">ⓘ</span>
                </span>
                <br /><span className="text-slate-400 font-semibold">{s.valor}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tarjeta contenedora de cada bloque de la matriz -- separa visualmente
 *  "total respuestas" / "distribución" / "promedio de nota" en vez de que
 *  sean 3 tablas sueltas sin jerarquía (2026-09-24, a pedido del usuario:
 *  "que se logre diferenciar cada cosa correctamente"). */
function BloqueMatriz({ icono, titulo, descripcion, children }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850/40 p-3.5">
      <h3 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-1.5">
        <span>{icono}</span> {titulo}
      </h3>
      {descripcion && <p className="text-[11px] text-slate-500 mb-3">{descripcion}</p>}
      <div className={descripcion ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

/** Nota como píldora de color (rojo -> ámbar -> verde según qué tan alta es
 *  contra su propia escala) -- así se lee de un vistazo sin comparar números
 *  entre columnas de escalas distintas (Likert 1-5 vs NPS 0-10). */
function PildoraNota({ valor, max }) {
  if (valor === null || valor === undefined) {
    return <span className="text-slate-600">—</span>;
  }
  const color = colorNota_(valor, max);
  return (
    <span className="inline-block min-w-[42px] rounded px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: color + '26', color }}>
      {fmtNota_(valor)}
    </span>
  );
}

function colorNota_(valor, max) {
  const t = Math.max(0, Math.min(1, valor / max));
  const stops = t <= 0.5
    ? [[244, 63, 94], [245, 158, 11], t / 0.5]
    : [[245, 158, 11], [16, 185, 129], (t - 0.5) / 0.5];
  const [c1, c2, localT] = stops;
  const rgb = c1.map((v, i) => Math.round(v + (c2[i] - v) * localT));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function fmtNota_(v) {
  return v === null || v === undefined ? '—' : v.toFixed(1).replace('.', ',');
}

/** Panel de detalle al hacer clic en un tema: qué significa la categoría +
 *  comentarios reales, organizados en un panel por sentimiento (no una lista
 *  plana intercalada) -- así se lee de un vistazo cuánto hay de cada tipo y
 *  no hay que rastrear una etiqueta por cada línea. */
function DetalleTema({ tema, filas, onCerrar }) {
  const MAX_POR_PANEL = 8;
  const grupos = useMemo(() => {
    const g = {};
    SENTIMIENTOS_CUALITATIVO.forEach((s) => { g[s.key] = []; });
    filas.forEach((f) => { (g[f.sentimiento] || (g[f.sentimiento] = [])).push(f); });
    return g;
  }, [filas]);

  const campoMeta = Object.fromEntries(CAMPOS_CUALITATIVO.map((c) => [c.key, c.label]));
  const sentimientoMeta = Object.fromEntries(SENTIMIENTOS_CUALITATIVO.map((s) => [s.key, s]));

  // "Post-its" destacados: los comentarios más fuertes/relevantes de esta
  // subrama. Reparto proporcional entre negativo/mixto y positivo (no fijo
  // 2+2): si un lado domina en cantidad se le dan más cupos, pero siempre
  // queda al menos 1 para el otro lado -- "cuando negativo supera en exceso
  // si deberían mostrarse más negativos, pero equilibrar un poco" (2026-09-24,
  // a pedido del usuario). Dentro de cada lado, el texto más largo/detallado.
  const destacados = useMemo(() => {
    const porLargo = (a, b) => b.texto.trim().length - a.texto.trim().length;
    const validos = filas.filter((f) => f.texto && f.texto.trim().length > 15);
    const negMix = validos.filter((f) => f.sentimiento === 'negativo' || f.sentimiento === 'mixto').sort(porLargo);
    const pos = validos.filter((f) => f.sentimiento === 'positivo').sort(porLargo);
    const resto = validos.filter((f) => f.sentimiento === 'neutral').sort(porLargo);

    const CUPOS = 4;
    let cuposNeg, cuposPos;
    if (negMix.length === 0) { cuposNeg = 0; cuposPos = CUPOS; }
    else if (pos.length === 0) { cuposNeg = CUPOS; cuposPos = 0; }
    else {
      const ratio = negMix.length / (negMix.length + pos.length);
      cuposNeg = Math.min(3, Math.max(1, Math.round(ratio * CUPOS)));
      cuposPos = CUPOS - cuposNeg;
    }

    const out = [...negMix.slice(0, cuposNeg), ...pos.slice(0, cuposPos)];
    if (out.length < CUPOS) {
      const usados = new Set(out);
      const sobrante = [...negMix, ...pos, ...resto].filter((f) => !usados.has(f));
      out.push(...sobrante.slice(0, CUPOS - out.length));
    }
    return out.slice(0, CUPOS);
  }, [filas]);

  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: tema.color + '55', backgroundColor: tema.color + '0e' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-bold" style={{ color: tema.color }}>{tema.label}</div>
          <p className="text-xs text-slate-300 mt-0.5">{tema.descripcion}</p>
          <p className="text-[11px] text-slate-500 mt-1">{filas.length} comentarios con este tema en el filtro actual.</p>
        </div>
        <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-100 text-lg leading-none">×</button>
      </div>

      {filas.length === 0 ? (
        <p className="text-xs text-slate-500">Sin comentarios para mostrar.</p>
      ) : (
        <>
          <div className="mb-4 space-y-1">
            {SENTIMIENTOS_CUALITATIVO.map((s) => {
              const n = (grupos[s.key] || []).length;
              const pct = filas.length > 0 ? Math.round((n / filas.length) * 100) : 0;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[11px] text-slate-300 text-right">{s.label}</span>
                  <div className="flex-1 bg-ink-800 rounded h-3.5 overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </div>
                  <span className="w-16 shrink-0 text-[11px] text-slate-400">{n} · {pct}%</span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] font-semibold text-slate-400 mb-2">Todos los comentarios de este tema</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {SENTIMIENTOS_CUALITATIVO.map((s) => {
            const lista = grupos[s.key] || [];
            return (
              <div key={s.key} className="rounded-md border bg-ink-900/60 flex flex-col" style={{ borderColor: s.color + '40' }}>
                <div className="px-3 py-1.5 border-b" style={{ borderColor: s.color + '30', backgroundColor: s.color + '14' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-[11px] text-slate-400">{lista.length}</span>
                  </div>
                  {lista.length > 0 && (
                    <button
                      type="button"
                      onClick={() => descargarComentarios_(tema, s, lista, campoMeta)}
                      title={`Descargar los ${lista.length} comentarios de "${s.label}" en un archivo de texto`}
                      className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-[10.5px] font-semibold px-2 py-1 rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 hover:bg-ink-800 transition-colors"
                    >
                      ⬇ Descargar .txt
                    </button>
                  )}
                </div>
                <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
                  {lista.length === 0 ? (
                    <p className="text-[11px] text-slate-600 italic px-1 py-2">Sin comentarios.</p>
                  ) : (
                    <>
                      {lista.slice(0, MAX_POR_PANEL).map((f, i) => (
                        <div key={i} className="bg-ink-800/70 rounded px-2 py-1.5">
                          <div className="text-[9.5px] text-slate-500 mb-0.5">
                            {campoMeta[f.campo_origen] || f.campo_origen}
                            {f.mes_calificacion && <span> · {f.mes_calificacion}</span>}
                            {f.categoria_programa && <span> · {f.categoria_programa}</span>}
                          </div>
                          <p className="text-[11px] text-slate-200 leading-snug">"{f.texto}"</p>
                        </div>
                      ))}
                      {lista.length > MAX_POR_PANEL && (
                        <p className="text-[10px] text-slate-500 text-center pt-0.5">+{lista.length - MAX_POR_PANEL} más</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          </div>

          {destacados.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-slate-400 mb-2">📌 Comentarios destacados</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {destacados.map((f, i) => {
                  const sm = sentimientoMeta[f.sentimiento];
                  return (
                    <div
                      key={i}
                      className="rounded-sm px-3 py-3 shadow-lg"
                      style={{
                        backgroundColor: (sm?.color || '#64748b') + '22',
                        border: `1px solid ${(sm?.color || '#64748b')}55`,
                        borderTop: `3px solid ${sm?.color || '#64748b'}`,
                        transform: `rotate(${i % 2 === 0 ? '-1.5deg' : '1.5deg'})`,
                      }}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: sm?.color }}>
                        {sm?.label} · {campoMeta[f.campo_origen] || f.campo_origen}
                      </div>
                      <p className="text-[11px] text-slate-200 leading-snug italic">"{f.texto}"</p>
                      <div className="text-[9px] text-slate-500 mt-1.5">
                        {f.mes_calificacion}{f.categoria_programa ? ` · ${f.categoria_programa}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
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
      text: etiquetasDecimal_(serie), textposition: 'top center', textfont: { color: '#cbd5e1', size: 9 },
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
      style={activo ? { backgroundColor: color + '2e', borderColor: color, color: '#f1f5f9' } : { borderColor: '#2f3a4d', color: '#94a3b8' }}
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
          <div className="text-lg font-semibold text-slate-100 tabular-nums">{muestraChica ? '—' : (resumen.promedio_general ?? '—')}</div>
          <div className="text-[11px] text-slate-400">Promedio /5</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100 tabular-nums">{muestraChica ? '—' : (resumen.promedio_nps ?? '—')}</div>
          <div className="text-[11px] text-slate-400">NPS /10</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100 tabular-nums">{resumen.respuestas}</div>
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
 *  de raíz, tanto si vienen de la base de grupos como de las respuestas.
 *  2026-10-14: por patrón (la base trae "Docente Inducción" y "Docente de
 *  inducción 2"); cuando exista un catálogo real de docentes en Supabase,
 *  esto se reemplaza por un flag en esa tabla. */
function esDocentePlaceholder_(nombre) {
  return /^docente( de)? induccion/.test(normalizar(nombre));
}

/** Umbral de muestra para RANKING INDIVIDUAL -- más estricto que
 *  N_MINIMO_CONFIABLE (=5, pensado para categorías de programa completas
 *  con muchos estudiantes detrás). Comparar personas por nombre con pocas
 *  respuestas es mucho más riesgoso que comparar categorías -- 2-3
 *  estudiantes descontentos (o contentos) pueden hundir/inflar a alguien
 *  injustamente. 2026-10-14: como ahora la lista sale de la base de grupos,
 *  el docente SIEMPRE aparece (para contrastar asignado vs. respondido),
 *  pero por debajo de N_MIN_DOCENTE_OCULTO NO se muestra su promedio
 *  ("muestra insuficiente"); entre ese piso y N_MIN_DOCENTE_CONFIABLE se
 *  marca "muestra en construcción". */
const N_MIN_DOCENTE_OCULTO = 5;
const N_MIN_DOCENTE_CONFIABLE = 15;

const STOPWORDS_MATERIA = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'en', 'para']);
const ROMANOS_MATERIA = { i: '1', ii: '2', iii: '3', iv: '4' };

/** Clave de materia para cruzar lo que puso el estudiante contra lo asignado
 *  en doc_base_de_grupos -- 2026-10-14. En Agosto (formulario anterior) los
 *  nombres de las respuestas quedaron escritos distinto a la base: códigos
 *  ("3273V", "(2892V)", "- MPV1", "-1V"), puntos finales, "I" vs "1",
 *  "Proceso" vs "Procesos", "de la". Se quitan códigos, paréntesis,
 *  puntuación y palabras vacías, se pasa el romano final a número y se
 *  quita la "s" final de cada palabra. */
function claveMateria_(materia) {
  let t = normalizar(materia)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d*\s*mpv\d*\b/g, ' ')
    .replace(/\b\d+\s*v\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ');
  const palabras = t.split(/\s+/).filter((p) => p && !STOPWORDS_MATERIA.has(p));
  if (palabras.length && ROMANOS_MATERIA[palabras[palabras.length - 1]]) {
    palabras[palabras.length - 1] = ROMANOS_MATERIA[palabras[palabras.length - 1]];
  }
  return palabras.map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p)).join(' ');
}

/** ¿La clave de la respuesta corresponde a esta clave asignada? Exacta, o
 *  una es prefijo de palabras completas de la otra ("constitucion politica
 *  colombia" vs "constitucion politica") -- solo se usa contra las materias
 *  asignadas a ESE docente ese mes, así que el prefijo no confunde materias
 *  de distintos docentes. */
function calzaMateria_(claveResp, claveAsig) {
  if (!claveResp || !claveAsig) return false;
  if (claveResp === claveAsig) return true;
  const [corta, larga] = claveResp.length < claveAsig.length ? [claveResp, claveAsig] : [claveAsig, claveResp];
  return corta.length >= 8 && larga.startsWith(corta + ' ');
}

/** Ranking construido DESDE doc_base_de_grupos -- 2026-10-14, a pedido del
 *  usuario: "las materias de cada docente que deberían estar en el ranking
 *  son las asignadas en doc_base_de_grupos", para contrastar lo asignado
 *  contra lo que respondieron los estudiantes (que pueden haber puesto una
 *  materia errada).
 *  - Docentes = tutor_calendario de la base en el recorte (aunque tengan 0
 *    respuestas), materias = las asignadas, Esperadas = suma de cupos_activos.
 *  - Cada respuesta se asigna al docente que eligió el estudiante. Si su
 *    materia calza (claveMateria_) con una asignada a ese docente ese mes
 *    -- primero en la misma carrera, luego en cualquiera (clases
 *    transversales) -- cuenta para esa materia; si no, queda como "materia
 *    no asignada" (posible error del estudiante). El promedio del docente
 *    usa TODAS las respuestas que lo nombran: el estudiante igual evaluó a
 *    esa persona, la materia errada es un tema de calidad del dato.
 *  - Respuestas a docentes que no están en la base en ese recorte van a
 *    `sinAsignacion` (se muestran aparte, no se pierden). */
/** Clave de la lista de clase de un grupo -- dos grupos combinados comparten
 *  la MISMA lista (mismo listado_url), así que sus asistentes/estudiantes no
 *  se deben sumar dos veces. Sin url, cada grupo es su propia lista. */
function claveLista_(g, mapaListas) {
  return mapaListas?.get(g.group_id)?.listaUrl || 'g:' + g.group_id;
}

/** Confiabilidad PROPORCIONAL (2026-10-16, a pedido del usuario): la muestra
 *  de referencia son los estudiantes que asistieron al menos a una clase
 *  (Asist. ≥1); 3 respuestas de 4 asistentes es representativo aunque sean
 *  pocas. Las estadísticas se muestran SIEMPRE que haya respuestas; esto
 *  solo define el aviso. */
const COBERTURA_REPRESENTATIVA = 0.5;
function confiabilidadDocente_(total, muestra) {
  if (!total) return 'sin';
  if (total >= N_MIN_DOCENTE_CONFIABLE) return 'confiable';
  if (muestra && total / muestra >= COBERTURA_REPRESENTATIVA) return 'representativa';
  if (total < N_MIN_DOCENTE_OCULTO) return 'pequena';
  return 'construccion';
}

function construirRankingDesdeBase_(crudo, baseRecorte, mapaListas) {
  const docentes = new Map();
  const asignPorDocMes = new Map();
  const listasGlobal = new Map(); // claveLista -> asistentes (para el total sin duplicar)
  baseRecorte.forEach((g) => {
    const nombre = (g.tutor_calendario || '').trim();
    if (!nombre || esDocentePlaceholder_(nombre)) return;
    const dn = normalizar(nombre);
    if (!docentes.has(dn)) {
      docentes.set(dn, { nombre, asignaciones: new Map(), gruposPorCarrera: {}, filas: [], noAsignadas: {}, listas: new Map() });
    }
    const d = docentes.get(dn);
    const clave = claveMateria_(g.materia);
    const k = g.categoria_programa + '|' + clave;
    if (!d.asignaciones.has(k)) {
      d.asignaciones.set(k, { carrera: g.categoria_programa, materia: (g.materia || '').trim(), clave, esperadas: 0, grupos: 0, filas: [], listas: new Map() });
    }
    const a = d.asignaciones.get(k);
    a.esperadas += Number(g.cupos_activos) || 0;
    a.grupos += 1;
    // Asist. ≥1 y Cant. est. listas (asap_seguimiento_grupo), por lista única
    const lis = mapaListas?.get(g.group_id) || null;
    const cl = claveLista_(g, mapaListas);
    const datoLista = { asis: lis?.asis ?? null, cant: lis?.cant ?? null };
    if (!a.listas.has(cl)) a.listas.set(cl, datoLista);
    if (!d.listas.has(cl)) d.listas.set(cl, datoLista);
    if (!listasGlobal.has(cl)) listasGlobal.set(cl, datoLista);
    d.gruposPorCarrera[g.categoria_programa] = (d.gruposPorCarrera[g.categoria_programa] || 0) + 1;
    const km = dn + '|' + g.mes_calificacion;
    if (!asignPorDocMes.has(km)) asignPorDocMes.set(km, []);
    if (!asignPorDocMes.get(km).includes(a)) asignPorDocMes.get(km).push(a);
  });

  const sinAsignacion = new Map();
  (crudo || []).forEach((grupo) => {
    (grupo.filas || []).forEach((f) => {
      const nombre = (f.docente || '').trim();
      if (!nombre || esDocentePlaceholder_(nombre)) return;
      const fila = { ...f, mes_calificacion: grupo.mes_calificacion, categoria_programa: grupo.categoria_programa };
      const dn = normalizar(nombre);
      const d = docentes.get(dn);
      if (!d) {
        if (!sinAsignacion.has(dn)) sinAsignacion.set(dn, { nombre, n: 0, materias: new Set() });
        const s = sinAsignacion.get(dn);
        s.n += 1;
        if (f.materia) s.materias.add(f.materia);
        return;
      }
      d.filas.push(fila);
      const candidatas = asignPorDocMes.get(dn + '|' + grupo.mes_calificacion) || [];
      const claveResp = claveMateria_(f.materia);
      const asig =
        candidatas.find((a) => a.carrera === grupo.categoria_programa && calzaMateria_(claveResp, a.clave)) ||
        candidatas.find((a) => calzaMateria_(claveResp, a.clave));
      if (asig) asig.filas.push(fila);
      else {
        const m = (f.materia || '(sin materia)').trim();
        d.noAsignadas[m] = (d.noAsignadas[m] || 0) + 1;
      }
    });
  });

  // suma de una propiedad sobre listas únicas; null si ninguna tiene el dato
  const sumaListas = (listas, prop) => {
    let hay = false;
    let t = 0;
    listas.forEach((v) => { if (typeof v[prop] === 'number') { hay = true; t += v[prop]; } });
    return hay ? t : null;
  };

  const lista = Array.from(docentes.values()).map((d) => {
    const total = d.filas.length;
    const porPregunta = {};
    SECCION_DOCENTE.keys.forEach((k) => { porPregunta[k] = calcularPromedioClaves(d.filas, [k]); });
    const conComentario = d.filas.filter((f) => f.docente_comentarios);
    const longitudPromedio = conComentario.length
      ? Math.round(conComentario.reduce((s, f) => s + f.docente_comentarios.length, 0) / conComentario.length)
      : null;
    const porMateria = Array.from(d.asignaciones.values())
      .map((a) => ({
        carrera: a.carrera,
        materia: a.materia,
        esperadas: a.esperadas,
        asistentes: sumaListas(a.listas, 'asis'),
        estudiantesListas: sumaListas(a.listas, 'cant'),
        grupos: a.grupos,
        respuestas: a.filas.length,
        promedio: a.filas.length ? calcularPromedioClaves(a.filas, SECCION_DOCENTE.keys) : null,
      }))
      .sort((x, y) => (x.carrera + x.materia).localeCompare(y.carrera + y.materia, 'es'));
    const noAsignadas = Object.entries(d.noAsignadas).map(([materia, n]) => ({ materia, n })).sort((x, y) => y.n - x.n);
    const cuposEsperados = porMateria.reduce((s, m) => s + m.esperadas, 0);
    const asistentes = sumaListas(d.listas, 'asis');
    const estudiantesListas = sumaListas(d.listas, 'cant');
    // muestra de referencia: Asist. ≥1; si no hay dato de asistencia, cupos
    const muestra = asistentes ?? (cuposEsperados || null);
    return {
      nombre: d.nombre,
      areas: Object.keys(d.gruposPorCarrera).sort(),
      gruposPorCarrera: d.gruposPorCarrera,
      materiasDictadas: Array.from(new Set(porMateria.map((m) => m.materia))).sort(),
      porMateria,
      noAsignadas,
      respuestasNoAsignadas: noAsignadas.reduce((s, m) => s + m.n, 0),
      filas: d.filas,
      totalRespuestas: total,
      cuposEsperados: cuposEsperados || null,
      asistentes,
      estudiantesListas,
      muestra,
      muestraEsAsistencia: asistentes != null,
      cobertura: muestra ? total / muestra : null,
      // 2026-10-16: el promedio se calcula SIEMPRE que haya respuestas (antes
      // se ocultaba con < 5); la confiabilidad solo pone el aviso.
      promedioDocente: total > 0 ? calcularPromedioClaves(d.filas, SECCION_DOCENTE.keys) : null,
      porPregunta,
      comentarios: { conteo: conComentario.length, longitudPromedio },
      confiabilidad: confiabilidadDocente_(total, muestra),
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    docentes: lista,
    totalAsistentes: sumaListas(listasGlobal, 'asis'),
    sinAsignacion: Array.from(sinAsignacion.values())
      .map((s) => ({ nombre: s.nombre, n: s.n, materias: Array.from(s.materias).sort() }))
      .sort((a, b) => b.n - a.n),
  };
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

/** Filas de doc_base_de_grupos del recorte: el mes puntual, o en 'TODOS'
 *  solo los meses que ya tienen respuestas (la base trae meses futuros, ej.
 *  Noviembre, que no son parte del acumulado). Respeta el filtro global de
 *  Módulo 0 igual que el crudo. */
function baseDelRecorte_(baseGrupos, mesSeleccionado, incluirModulo0, mesesConRespuestas) {
  return (baseGrupos || []).filter((g) => {
    if (mesSeleccionado === 'TODOS' ? !mesesConRespuestas.includes(g.mes_calificacion) : g.mes_calificacion !== mesSeleccionado) return false;
    return incluirModulo0 || !esModulo0_(g.materia);
  });
}

const SECCION_VARIAS_CARRERAS = 'Varias carreras';
const COLOR_VARIAS_CARRERAS = '#94a3b8'; // gris: no es una carrera

/** Una sección por carrera (orden de CATEGORIAS_EVALUACION_DOCENTE, más
 *  cualquier otra que aparezca) + "Varias carreras" al final. Cada docente
 *  cae en UNA sola sección, según las carreras de sus grupos ASIGNADOS.
 *  - Mes puntual: "Varias carreras" = tiene grupos en 2+ carreras ese mes.
 *  - 'TODOS': los docentes rotan de carrera mes a mes (con la regla del mes
 *    puntual casi todos caían en "Varias carreras"), así que se ubica en su
 *    carrera PRINCIPAL = la que concentra al menos UMBRAL_CARRERA_PRINCIPAL
 *    de sus grupos asignados; si ninguna llega, va a "Varias carreras". En
 *    'TODOS' todas las secciones muestran la columna Carreras. */
const UMBRAL_CARRERA_PRINCIPAL = 0.6;

function carreraPrincipal_(d) {
  const total = Object.values(d.gruposPorCarrera).reduce((s, n) => s + n, 0);
  const top = Object.entries(d.gruposPorCarrera).sort((a, b) => b[1] - a[1])[0];
  return top && total && top[1] / total >= UMBRAL_CARRERA_PRINCIPAL ? top[0] : null;
}

function seccionesRanking_(docentes, modoTodos) {
  const porCarrera = new Map();
  const varias = [];
  docentes.forEach((d) => {
    const c = d.areas.length > 1 ? (modoTodos ? carreraPrincipal_(d) : null) : d.areas[0] || 'Sin carrera';
    if (!c) { varias.push(d); return; }
    if (!porCarrera.has(c)) porCarrera.set(c, []);
    porCarrera.get(c).push(d);
  });
  const orden = [...CATEGORIAS_EVALUACION_DOCENTE, ...Array.from(porCarrera.keys()).filter((c) => !CATEGORIAS_EVALUACION_DOCENTE.includes(c)).sort()];
  const secciones = orden
    .filter((c) => porCarrera.has(c))
    .map((c) => ({ titulo: c, color: COLOR_CATEGORIA[c] || '#5b7fff', docentes: porCarrera.get(c), mostrarCarreras: modoTodos }));
  if (varias.length) secciones.push({ titulo: SECCION_VARIAS_CARRERAS, color: COLOR_VARIAS_CARRERAS, docentes: varias, mostrarCarreras: true });
  return secciones;
}

/* ----------------------------------------------------------------------------
 *  UI del Ranking Docente -- rediseño 2026-10-14, a pedido del usuario: "se
 *  ve visualmente sucio, demasiado difícil de comprender, usa ventanas
 *  modales con botones". Estructura:
 *    1. Encabezado corto + botón "Cómo leer este panel" (modal con las reglas
 *       que antes eran párrafos largos).
 *    2. Mes evaluado + 4 indicadores (los de alertas abren su modal).
 *    3. Pestañas por carrera (una a la vez, en vez de acordeones apilados)
 *       + buscador + filtro.
 *    4. Tarjetas por docente; clic → ficha en modal tipo "hoja de perfil"
 *       (barras por pregunta vs. institucional + radar SVG + materias +
 *       distribución), con anterior/siguiente para recorrer la lista.
 * --------------------------------------------------------------------------*/

const TAB_TODAS = '__todas__';
const FILTROS_RANKING = [
  { key: 'todos', label: 'Todos' },
  { key: 'alertas', label: '⚠ Con materia no asignada' },
  { key: 'pocas', label: 'Muestra pequeña (< 5 resp.)' },
];

function iniciales_(nombre) {
  return (nombre || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

/** Color de una nota 1-5 (rojo → ámbar → verde), reusando colorNota_. */
function colorNota15_(v) {
  return typeof v === 'number' ? colorNota_(v - 1, 4) : '#64748b';
}

function fmtDec_(v, dec = 2) {
  return typeof v === 'number' ? comaDecimal_(v.toFixed(dec)) : '—';
}

/** Modal genérico (portal a body, Esc y clic afuera cierran). */
function ModalRanking({ titulo, subtitulo, onClose, ancho = 'max-w-3xl', acciones, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className={`w-full ${ancho} max-h-[92vh] flex flex-col rounded-2xl border border-ink-600 bg-ink-900 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-700">
          <div className="min-w-0">
            {subtitulo && <div className="text-[11px] uppercase tracking-wider text-slate-500">{subtitulo}</div>}
            <div className="text-base font-semibold text-slate-100">{titulo}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {acciones}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-ink-600 text-slate-400 hover:text-slate-100 hover:bg-ink-700"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** Tarjeta de indicador; si trae onClick se ve como botón. */
function KpiRanking({ etiqueta, valor, detalle, color = '#cbd5e1', onClick, alerta }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        'text-left rounded-xl border px-4 py-3 bg-ink-800/60 ' +
        (alerta ? 'border-amber-700/70 ' : 'border-ink-600 ') +
        (onClick ? 'hover:bg-ink-700/60 transition-colors cursor-pointer' : '')
      }
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{etiqueta}</div>
      <div className="text-2xl font-bold mt-0.5 tabular-nums" style={{ color }}>{valor}</div>
      {detalle && <div className="text-[11px] text-slate-400 mt-0.5">{detalle}{onClick && <span className="text-accent-400"> · ver detalle ›</span>}</div>}
    </Comp>
  );
}

function BarraProgreso({ valor, max, color }) {
  const pct = max > 0 ? Math.min(100, (valor / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: pct + '%', backgroundColor: color }} />
    </div>
  );
}

/** Texto de cobertura: "3 de 4 que asistieron (75%)" (o "de N cupos" si el
 *  grupo no tiene dato de asistencia). */
function textoCobertura_(d) {
  if (!d.muestra) return `${d.totalRespuestas} respuesta(s)`;
  const pct = comaDecimal_(((d.totalRespuestas / d.muestra) * 100).toFixed(0)) + '%';
  return `${d.totalRespuestas} de ${d.muestra} ${d.muestraEsAsistencia ? 'que asistieron' : 'cupos'} (${pct})`;
}

function BadgeConfiabilidad({ d }) {
  const cls = 'text-[10px] font-semibold rounded px-1.5 py-0.5 ';
  if (d.confiabilidad === 'sin') return <span className={cls + 'bg-ink-700 text-slate-400'}>Sin respuestas</span>;
  if (d.confiabilidad === 'representativa') {
    return <span className={cls + 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'} title={textoCobertura_(d)}>Muestra pequeña pero representativa</span>;
  }
  if (d.confiabilidad === 'pequena') return <span className={cls + 'bg-amber-950/60 text-amber-300 border border-amber-800/60'} title={textoCobertura_(d)}>Muestra pequeña</span>;
  if (d.confiabilidad === 'construccion') return <span className={cls + 'bg-amber-950/60 text-amber-300 border border-amber-800/60'} title={textoCobertura_(d)}>En construcción</span>;
  return null;
}

function ChipCarrera({ carrera }) {
  const c = COLOR_CATEGORIA[carrera] || '#94a3b8';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 bg-ink-700/70 text-slate-300">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
      {carrera}
    </span>
  );
}

/** Diferencia del promedio del docente vs. el institucional, en texto
 *  neutro con ▲/▼ (no rojo/verde: casi todos los promedios están entre 4 y
 *  5 y el color de la nota no distinguía nada). */
function DeltaInstitucional({ valor, institucional }) {
  if (typeof valor !== 'number' || typeof institucional !== 'number') return null;
  const delta = valor - institucional;
  if (Math.abs(delta) < 0.005) return <div className="text-[10px] text-slate-500 mt-1">= institucional</div>;
  return (
    <div className="text-[10px] text-slate-400 mt-1 tabular-nums" title={`Institucional: ${fmtDec_(institucional)}`}>
      {delta > 0 ? '▲ +' : '▼ −'}{fmtDec_(Math.abs(delta))} vs. inst.
    </div>
  );
}

function TarjetaDocente({ d, color, mostrarCarreras, promedioInstitucional, onAbrir }) {
  const pct = d.muestra ? (d.totalRespuestas / d.muestra) * 100 : null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="text-left rounded-xl border border-ink-600 bg-ink-800/50 hover:bg-ink-700/50 hover:border-ink-500 transition-colors p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold text-slate-100" style={{ backgroundColor: color + '33', boxShadow: `inset 0 0 0 1px ${color}99` }}>
          {iniciales_(d.nombre)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-100 truncate">{d.nombre}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {mostrarCarreras && d.areas.map((c) => <ChipCarrera key={c} carrera={c} />)}
            <ChipMaterias materias={d.materiasDictadas} />
          </div>
        </div>
        <div className="text-right shrink-0">
          {d.promedioDocente == null ? (
            <div className="text-xs text-slate-500 mt-1">—</div>
          ) : (
            <>
              <div className="text-xl font-bold leading-none text-slate-100 tabular-nums">{fmtDec_(d.promedioDocente)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">promedio /5</div>
              <DeltaInstitucional valor={d.promedioDocente} institucional={promedioInstitucional} />
            </>
          )}
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>
            <span className="text-slate-200 font-semibold">{d.totalRespuestas}</span> resp. de {d.muestra ?? '—'} {d.muestraEsAsistencia ? 'que asistieron' : 'cupos'}
          </span>
          <span className="text-slate-300 font-semibold tabular-nums">{pct == null ? '' : comaDecimal_(pct.toFixed(0)) + '%'}</span>
        </div>
        <BarraProgreso valor={d.totalRespuestas} max={d.muestra || 0} color="#64748b" />
      </div>
      {(d.respuestasNoAsignadas > 0 || d.confiabilidad !== 'confiable') && (
        <div className="flex flex-wrap gap-1.5">
          <BadgeConfiabilidad d={d} />
          {d.respuestasNoAsignadas > 0 && (
            <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-amber-950/60 text-amber-300 border border-amber-800/60">
              ⚠ {d.respuestasNoAsignadas} con materia no asignada
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function RankingDocente({ incluirModulo0 }) {
  const [crudo, setCrudo] = useState(null);
  const [baseGrupos, setBaseGrupos] = useState([]);
  const [mapaListas, setMapaListas] = useState(() => new Map()); // group_id -> { cant, asis, listaUrl }
  const [activosPorMes, setActivosPorMes] = useState({}); // doc_estudiantes_activos: mes -> estudiantes activos
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mesSeleccionado, setMesSeleccionado] = useState('TODOS');
  const [tab, setTab] = useState(TAB_TODAS);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [docenteAbierto, setDocenteAbierto] = useState(null); // nombre
  const [modal, setModal] = useState(null); // 'ayuda' | 'no_asignadas' | 'sin_asignacion'

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        // la base de grupos es OBLIGATORIA acá (2026-10-14): de ella salen
        // los docentes, sus materias asignadas y las Esperadas.
        // + Asist. ≥1 / Cant. est. listas por grupo (2026-10-16): la muestra
        // de referencia del docente son los que asistieron al menos a 1 clase.
        const [{ crudo }, base, listas, activos] = await Promise.all([
          fetchStatsYCrudo(),
          fetchGruposEvaluacionDocente(),
          fetchCantEstListasPorGrupo().catch(() => new Map()),
          fetchEstudiantesActivosMapa().catch(() => ({})),
        ]);
        if (vivo) { setCrudo(crudo); setBaseGrupos(base); setMapaListas(listas); setActivosPorMes(activos || {}); }
      } catch (e) {
        if (vivo) setError(e.message || String(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const mesesDisponibles = useMemo(() => mesesDisponiblesRanking_(crudo), [crudo]);
  // 2026-09-09: mismo filtro global de Módulo 0 que Grupos/Estadísticas.
  const crudoFiltrado = useMemo(() => {
    const porMes = mesSeleccionado === 'TODOS' ? crudo : (crudo || []).filter((g) => g.mes_calificacion === mesSeleccionado);
    return filtrarCrudoModulo0_(porMes, incluirModulo0);
  }, [crudo, mesSeleccionado, incluirModulo0]);
  const baseRecorte = useMemo(
    () => baseDelRecorte_(baseGrupos, mesSeleccionado, incluirModulo0, mesesDisponibles),
    [baseGrupos, mesSeleccionado, incluirModulo0, mesesDisponibles]
  );
  const { docentes, sinAsignacion, totalAsistentes } = useMemo(() => construirRankingDesdeBase_(crudoFiltrado, baseRecorte, mapaListas), [crudoFiltrado, baseRecorte, mapaListas]);
  const modoTodos = mesSeleccionado === 'TODOS';
  const secciones = useMemo(() => seccionesRanking_(docentes, modoTodos), [docentes, modoTodos]);

  // sección de cada docente (para color y para saber si mostrar carreras)
  const seccionDe = useMemo(() => {
    const m = new Map();
    secciones.forEach((s) => s.docentes.forEach((d) => m.set(d.nombre, s)));
    return m;
  }, [secciones]);

  const promedioInstitucional = useMemo(() => {
    const todas = (crudoFiltrado || []).flatMap((g) => g.filas || []);
    const porPregunta = {};
    SECCION_DOCENTE.keys.forEach((k) => { porPregunta[k] = calcularPromedioClaves(todas, [k]); });
    return { porPregunta, global: calcularPromedioClaves(todas, SECCION_DOCENTE.keys) };
  }, [crudoFiltrado]);

  // si cambia el mes y la pestaña ya no existe, volver a "Todas"
  const tabValida = tab === TAB_TODAS || secciones.some((s) => s.titulo === tab) ? tab : TAB_TODAS;
  const listaTab = tabValida === TAB_TODAS ? secciones.flatMap((s) => s.docentes) : secciones.find((s) => s.titulo === tabValida).docentes;
  const consulta = normalizar(busqueda);
  const lista = listaTab
    .filter((d) => !consulta || normalizar(d.nombre).includes(consulta) || d.materiasDictadas.some((m) => normalizar(m).includes(consulta)))
    .filter((d) => (filtro === 'alertas' ? d.respuestasNoAsignadas > 0 : filtro === 'pocas' ? d.totalRespuestas < N_MIN_DOCENTE_OCULTO : true))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const totalRespuestas = docentes.reduce((s, d) => s + d.totalRespuestas, 0);
  // Denominador del total general (2026-10-16, a pedido del usuario): los
  // ESTUDIANTES ACTIVOS del mes (doc_estudiantes_activos, el mismo dato de
  // Estadísticas), no la suma de asistentes. En 'TODOS' = suma de los meses
  // con respuestas. Si a algún mes le falta el dato, se usa la suma de
  // Asist. ≥1 como respaldo y se avisa cuál falta.
  const mesesDelRecorte = modoTodos ? mesesDisponibles : [mesSeleccionado];
  const mesesSinActivos = mesesDelRecorte.filter((m) => typeof activosPorMes[m] !== 'number');
  const totalActivos = mesesSinActivos.length ? null : mesesDelRecorte.reduce((s, m) => s + activosPorMes[m], 0);
  const totalEsperadas = totalActivos ?? totalAsistentes ?? docentes.reduce((s, d) => s + (d.cuposEsperados || 0), 0);
  const etiquetaEsperadas = totalActivos != null
    ? (modoTodos ? 'estudiantes activos (suma de los meses)' : `activos en ${mesSeleccionado}`)
    : totalAsistentes != null ? 'que asistieron (≥1 clase)' : 'cupos';
  const conNoAsignadas = docentes.filter((d) => d.respuestasNoAsignadas > 0);
  const totalNoAsignadas = conNoAsignadas.reduce((s, d) => s + d.respuestasNoAsignadas, 0);
  const totalSinAsignacion = sinAsignacion.reduce((s, x) => s + x.n, 0);
  const conPromedio = docentes.filter((d) => d.totalRespuestas > 0).length;

  const idxAbierto = lista.findIndex((d) => d.nombre === docenteAbierto);
  const docenteActivo = docenteAbierto ? docentes.find((d) => d.nombre === docenteAbierto) : null;

  const estiloPanel = estiloPanelSeccion_(COLOR_SECCION_RANKING);

  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>;
  if (error) {
    return <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* 1. Encabezado */}
      <div className="rounded-xl p-4 border flex flex-wrap items-center justify-between gap-3" style={estiloPanel}>
        <div>
          <p className="text-base font-semibold" style={{ color: COLOR_SECCION_RANKING }}>Ranking Docente</p>
          <p className="text-xs text-slate-400">Acompañamiento por docente: lo asignado en la base de grupos vs. lo que respondieron sus estudiantes.</p>
        </div>
        <button
          type="button"
          onClick={() => setModal('ayuda')}
          className="text-xs font-semibold rounded-lg px-3 py-2 border border-ink-600 text-slate-300 hover:bg-ink-700"
        >
          ⓘ Cómo leer este panel
        </button>
      </div>

      {/* 2. Mes + indicadores */}
      <div className="rounded-xl p-4 border space-y-4" style={estiloPanel}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Mes evaluado</span>
          {['TODOS', ...mesesDisponibles].map((mes) => {
            const color = mes === 'TODOS' ? COLOR_SECCION_RANKING : colorDeMes(mes);
            const activo = mesSeleccionado === mes;
            return (
              <button
                key={mes}
                type="button"
                onClick={() => setMesSeleccionado(mes)}
                className="text-sm rounded-full px-3 py-1 border transition-colors flex items-center gap-1.5"
                style={activo ? { backgroundColor: color + '26', borderColor: color, color: '#f1f5f9' } : { borderColor: '#2f3a4d', color: '#94a3b8' }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {mes === 'TODOS' ? 'Todos los meses' : mes}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiRanking etiqueta="Docentes asignados" valor={docentes.length} detalle={`${conPromedio} con al menos 1 respuesta`} />
          <KpiRanking
            etiqueta="Respuestas"
            valor={totalRespuestas}
            detalle={
              (totalEsperadas ? `de los ${totalEsperadas} ${etiquetaEsperadas} · ${comaDecimal_(((totalRespuestas / totalEsperadas) * 100).toFixed(1))}%` : 'sin dato de estudiantes')
              + (mesesSinActivos.length ? ` (falta cargar Estudiantes Activos de ${mesesSinActivos.join(', ')})` : '')
            }
          />
          <KpiRanking
            etiqueta="Promedio institucional"
            valor={fmtDec_(promedioInstitucional.global)}
            color={colorNota15_(promedioInstitucional.global)}
            detalle="bloque Docente, sobre 5"
          />
          <KpiRanking
            etiqueta="Revisar datos"
            valor={totalNoAsignadas + totalSinAsignacion}
            color={totalNoAsignadas + totalSinAsignacion ? '#fbbf24' : '#10b981'}
            alerta={totalNoAsignadas + totalSinAsignacion > 0}
            detalle={`${totalNoAsignadas} materia no asignada · ${totalSinAsignacion} docente sin grupos`}
            onClick={totalNoAsignadas + totalSinAsignacion ? () => setModal(totalNoAsignadas ? 'no_asignadas' : 'sin_asignacion') : undefined}
          />
        </div>
      </div>

      {/* 3. Pestañas por carrera + búsqueda + filtro */}
      <div className="rounded-xl border border-ink-600 bg-ink-900/40">
        <div className="flex flex-wrap gap-1 p-2 border-b border-ink-700">
          {[{ titulo: TAB_TODAS, color: COLOR_SECCION_RANKING, docentes }, ...secciones].map((s) => {
            const activo = tabValida === s.titulo;
            return (
              <button
                key={s.titulo}
                type="button"
                onClick={() => setTab(s.titulo)}
                className="text-sm font-semibold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2"
                style={activo ? { backgroundColor: s.color + '26', color: '#f1f5f9', boxShadow: `inset 0 -2px 0 ${s.color}` } : { color: '#94a3b8' }}
              >
                {s.titulo !== TAB_TODAS && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />}
                {s.titulo === TAB_TODAS ? 'Todas' : s.titulo}
                <span className="text-[11px] rounded-full px-1.5" style={{ backgroundColor: (activo ? s.color : '#4a5875') + '33' }}>
                  {s.docentes.length}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar docente o materia…"
            className="flex-1 min-w-[200px] text-sm rounded-lg bg-ink-800 border border-ink-600 px-3 py-1.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent-500"
          />
          <div className="flex rounded-lg border border-ink-600 overflow-hidden text-xs">
            {FILTROS_RANKING.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                className={'px-3 py-1.5 font-semibold ' + (filtro === f.key ? 'bg-accent-500 text-white' : 'text-slate-400 hover:bg-ink-800')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {tabValida === SECCION_VARIAS_CARRERAS && (
          <p className="px-3 -mt-1 pb-2 text-[11px] text-slate-500">
            {modoTodos
              ? `Docentes sin una carrera que concentre al menos el ${Math.round(UMBRAL_CARRERA_PRINCIPAL * 100)}% de sus grupos asignados.`
              : 'Docentes con grupos asignados en 2 o más carreras este mes.'}
          </p>
        )}

        {/* 4. Tarjetas */}
        <div className="p-3 pt-0">
          {lista.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-8">
              {docentes.length === 0 ? 'No hay grupos asignados en la base para este recorte.' : 'Ningún docente coincide con la búsqueda o el filtro.'}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {lista.map((d) => {
                const s = seccionDe.get(d.nombre);
                return (
                  <TarjetaDocente
                    key={d.nombre}
                    d={d}
                    color={s?.color || COLOR_SECCION_RANKING}
                    mostrarCarreras={!!s?.mostrarCarreras || tabValida === TAB_TODAS}
                    promedioInstitucional={promedioInstitucional.global}
                    onAbrir={() => setDocenteAbierto(d.nombre)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {docenteActivo && (
        <FichaDocenteModal
          docente={docenteActivo}
          color={seccionDe.get(docenteActivo.nombre)?.color || COLOR_SECCION_RANKING}
          promedioInstitucional={promedioInstitucional}
          mesSeleccionado={mesSeleccionado}
          onClose={() => setDocenteAbierto(null)}
          onAnterior={idxAbierto > 0 ? () => setDocenteAbierto(lista[idxAbierto - 1].nombre) : null}
          onSiguiente={idxAbierto >= 0 && idxAbierto < lista.length - 1 ? () => setDocenteAbierto(lista[idxAbierto + 1].nombre) : null}
          posicion={idxAbierto >= 0 ? `${idxAbierto + 1} de ${lista.length}` : null}
        />
      )}

      {modal === 'ayuda' && (
        <ModalRanking titulo="Cómo leer el Ranking Docente" subtitulo="Ayuda" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm text-slate-300">
            <p><b className="text-slate-100">Es un panel de acompañamiento, no una tabla de posiciones.</b> Cada docente se compara contra sí mismo y contra el promedio institucional, nunca contra sus compañeros. Por eso la lista va en orden alfabético.</p>
            <p><b className="text-slate-100">De dónde salen los docentes:</b> de la base de grupos (Tutor Calendario). Ahí están sus materias asignadas y las <i>Esperadas</i>, que son la suma de cupos activos de sus grupos. Un docente aparece aunque todavía no tenga respuestas.</p>
            <p><b className="text-slate-100">Respuestas:</b> cada respuesta cuenta para el docente que eligió el estudiante. Si el estudiante puso una materia que ese docente no tiene asignada ese mes, se marca <span className="text-amber-300">⚠ materia no asignada</span>, porque puede ser un error al responder. Igual cuenta para el promedio del docente, ya que el estudiante sí lo evaluó a él.</p>
            <p><b className="text-slate-100">Muestra de referencia:</b> los estudiantes que <b>asistieron al menos a una clase</b> (Asist. ≥1), no los cupos ni el listado. El % de respuesta se calcula contra ellos.</p>
            <p><b className="text-slate-100">Promedio:</b> es el promedio de las 6 preguntas del bloque Docente, sobre 5, y se muestra siempre que haya respuestas. Si la muestra es chica se avisa: <span className="text-emerald-300">"pequeña pero representativa"</span> cuando respondió al menos el {Math.round(COBERTURA_REPRESENTATIVA * 100)}% de los que asistieron, y <span className="text-amber-300">"muestra pequeña" / "en construcción"</span> cuando son pocas respuestas frente a los que asistieron. Con {N_MIN_DOCENTE_CONFIABLE} o más respuestas no lleva aviso.</p>
            <p><b className="text-slate-100">Pestañas por carrera:</b> en un mes puntual, la carrera es la de los grupos asignados ese mes; quien tiene grupos en 2 o más carreras va a "Varias carreras". En "Todos los meses" se usa la carrera principal, la que concentra al menos el {Math.round(UMBRAL_CARRERA_PRINCIPAL * 100)}% de sus grupos.</p>
            <p><b className="text-slate-100">Datos:</b> desde Agosto 2026, que son las respuestas que recolectamos nosotros. El filtro global de Módulo 0 también aplica acá.</p>
          </div>
        </ModalRanking>
      )}

      {(modal === 'no_asignadas' || modal === 'sin_asignacion') && (
        <ModalRanking
          titulo="Respuestas para revisar"
          subtitulo={modoTodos ? 'Todos los meses' : mesSeleccionado}
          ancho="max-w-4xl"
          onClose={() => setModal(null)}
        >
          <div className="flex rounded-lg border border-ink-600 overflow-hidden text-xs w-fit mb-4">
            <button type="button" onClick={() => setModal('no_asignadas')} className={'px-3 py-1.5 font-semibold ' + (modal === 'no_asignadas' ? 'bg-accent-500 text-white' : 'text-slate-400 hover:bg-ink-800')}>
              Materia no asignada ({totalNoAsignadas})
            </button>
            <button type="button" onClick={() => setModal('sin_asignacion')} className={'px-3 py-1.5 font-semibold ' + (modal === 'sin_asignacion' ? 'bg-accent-500 text-white' : 'text-slate-400 hover:bg-ink-800')}>
              Docente sin grupos ({totalSinAsignacion})
            </button>
          </div>
          {modal === 'no_asignadas' ? (
            <>
              <p className="text-xs text-slate-400 mb-3">El estudiante eligió al docente, pero con una materia que no está entre sus asignadas. Estas respuestas sí cuentan para el promedio del docente.</p>
              {conNoAsignadas.length === 0 ? <p className="text-xs text-slate-500">No hay casos.</p> : (
                <table className="text-xs w-full">
                  <thead><tr><Th>Docente</Th><Th>Materia que puso el estudiante</Th><Th right>Respuestas</Th><th /></tr></thead>
                  <tbody>
                    {conNoAsignadas.flatMap((d) => d.noAsignadas.map((m, i) => (
                      <tr key={d.nombre + m.materia} className="border-t border-ink-700">
                        <Td>{i === 0 ? <span className="font-semibold text-slate-200">{d.nombre}</span> : ''}</Td>
                        <Td><span className="text-amber-300">{m.materia}</span></Td>
                        <Td right>{m.n}</Td>
                        <td className="py-1.5 pr-3 text-right">
                          {i === 0 && (
                            <button type="button" className="text-accent-400 hover:underline" onClick={() => { setModal(null); setDocenteAbierto(d.nombre); }}>ver ficha ›</button>
                          )}
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3">El estudiante eligió un docente que no figura como Tutor Calendario de ningún grupo en este recorte. Puede ser un error al responder o un cambio de docente que no quedó en la base. Estas respuestas no entran al ranking.</p>
              {sinAsignacion.length === 0 ? <p className="text-xs text-slate-500">No hay casos.</p> : (
                <table className="text-xs w-full">
                  <thead><tr><Th>Docente</Th><Th right>Respuestas</Th><Th>Materias que pusieron</Th></tr></thead>
                  <tbody>
                    {sinAsignacion.map((s) => (
                      <tr key={s.nombre} className="border-t border-ink-700">
                        <Td><span className="font-semibold text-slate-200">{s.nombre}</span></Td>
                        <Td right>{s.n}</Td>
                        <td className="py-1.5 px-3 text-slate-400">{s.materias.join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </ModalRanking>
      )}
    </div>
  );
}

/** Indicador de cuántas materias tiene asignadas el docente en el recorte
 *  (1 / 2 / 3+), con los nombres al pasar el mouse. */
function ChipMaterias({ materias }) {
  const n = materias.length;
  // Neutro: el ámbar queda reservado para alertas (antes "3+ materias" se
  // leía como advertencia).
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-help bg-ink-700/70 text-slate-400"
      title={materias.join('\n') || 'Sin materias asignadas'}
    >
      {n === 0 ? 'sin materias' : n === 1 ? '1 materia' : `${n} materias`}
    </span>
  );
}

/** Barras por pregunta (escala 1-5) con marca del promedio institucional --
 *  inspirado en las "hojas de personaje": una barra por atributo. */
function BarrasPorPregunta({ docente, promedioInstitucional, color }) {
  return (
    <div className="space-y-3">
      {SECCION_DOCENTE.keys.map((k) => {
        const v = docente.porPregunta[k];
        const inst = promedioInstitucional.porPregunta[k];
        const delta = typeof v === 'number' && typeof inst === 'number' ? v - inst : null;
        const pos = (x) => Math.max(0, Math.min(100, ((x - 1) / 4) * 100));
        return (
          <div key={k}>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-slate-300">{ETIQUETA_CORTA[k] || k}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-semibold text-slate-100">{fmtDec_(v)}</span>
                {delta != null && (
                  <span className={'text-[11px] font-semibold ' + (delta >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {delta >= 0 ? '+' : '−'}{comaDecimal_(Math.abs(delta).toFixed(2))}
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-ink-700">
              {typeof v === 'number' && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pos(v) + '%', backgroundColor: color }} />}
              {typeof inst === 'number' && (
                <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-200" style={{ left: `calc(${pos(inst)}% - 1px)` }} title={`Institucional: ${fmtDec_(inst)}`} />
              )}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: color }} />Docente (escala 1 a 5)</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-slate-200" />Promedio institucional</span>
      </div>
    </div>
  );
}

/** Radar en SVG propio (el bundle de Plotly que usa la app es el cartesiano
 *  y no trae gráficos polares). La escala arranca en `min` (3 por defecto)
 *  porque casi todos los promedios están entre 4 y 5: en escala 0-5 todos
 *  los radares se verían iguales. */
function RadarDocente({ docente, promedioInstitucional, color }) {
  const keys = SECCION_DOCENTE.keys;
  const valores = keys.map((k) => docente.porPregunta[k]).concat(keys.map((k) => promedioInstitucional.porPregunta[k])).filter((v) => typeof v === 'number');
  const min = Math.min(3, Math.floor(Math.min(...valores, 5) * 2) / 2);
  const max = 5;
  const W = 340, H = 300, cx = W / 2, cy = H / 2 + 6, R = 105;
  const angulo = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
  const punto = (i, v) => {
    const r = typeof v === 'number' ? (Math.max(min, Math.min(max, v)) - min) / (max - min) * R : 0;
    return [cx + r * Math.cos(angulo(i)), cy + r * Math.sin(angulo(i))];
  };
  const poligono = (serie) => keys.map((k, i) => punto(i, serie[k]).join(',')).join(' ');
  const niveles = [];
  for (let n = min; n <= max + 1e-9; n += 0.5) niveles.push(Math.round(n * 10) / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-[380px] mx-auto" role="img" aria-label="Radar del docente vs. promedio institucional">
      {niveles.map((n) => (
        <polygon
          key={n}
          points={keys.map((_, i) => { const r = ((n - min) / (max - min)) * R; return [cx + r * Math.cos(angulo(i)), cy + r * Math.sin(angulo(i))].join(','); }).join(' ')}
          fill="none"
          stroke="#2f3a4d"
          strokeWidth={n === max ? 1.2 : 0.7}
        />
      ))}
      {keys.map((k, i) => {
        const [x, y] = [cx + R * Math.cos(angulo(i)), cy + R * Math.sin(angulo(i))];
        const [lx, ly] = [cx + (R + 22) * Math.cos(angulo(i)), cy + (R + 16) * Math.sin(angulo(i))];
        const ancla = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
        return (
          <g key={k}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#2f3a4d" strokeWidth="0.7" />
            <text x={lx} y={ly} textAnchor={ancla} dominantBaseline="middle" fontSize="10.5" fill="#cbd5e1">{ETIQUETA_CORTA[k] || k}</text>
          </g>
        );
      })}
      {niveles.map((n) => (
        <text key={'t' + n} x={cx + 3} y={cy - ((n - min) / (max - min)) * R} fontSize="8.5" fill="#64748b" dominantBaseline="middle">{comaDecimal_(n.toFixed(1))}</text>
      ))}
      <polygon points={poligono(promedioInstitucional.porPregunta)} fill="#94a3b8" fillOpacity="0.08" stroke="#cbd5e1" strokeWidth="1.4" strokeDasharray="4 3" />
      <polygon points={poligono(docente.porPregunta)} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2" />
      {keys.map((k, i) => typeof docente.porPregunta[k] === 'number' && (
        <circle key={'p' + k} cx={punto(i, docente.porPregunta[k])[0]} cy={punto(i, docente.porPregunta[k])[1]} r="3" fill={color} />
      ))}
    </svg>
  );
}

const TABS_FICHA = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'materias', label: 'Materias' },
  { key: 'distribucion', label: 'Distribución' },
];

function FichaDocenteModal({ docente, color, promedioInstitucional, mesSeleccionado, onClose, onAnterior, onSiguiente, posicion }) {
  const [tab, setTab] = useState('perfil');
  const etiquetaPeriodo = mesSeleccionado === 'TODOS' ? 'Todos los meses' : mesSeleccionado;
  const sinPromedio = docente.promedioDocente == null; // solo si NO hay respuestas
  const delta = !sinPromedio && typeof promedioInstitucional.global === 'number' ? docente.promedioDocente - promedioInstitucional.global : null;
  const muestraChica = ['pequena', 'construccion'].includes(docente.confiabilidad);

  // con flechas del teclado se recorre la lista
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft' && onAnterior) onAnterior();
      if (e.key === 'ArrowRight' && onSiguiente) onSiguiente();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnterior, onSiguiente]);

  const distribucion = useMemo(() => {
    const conteos = [0, 0, 0, 0, 0];
    docente.filas.forEach((f) => {
      const prom = calcularPromedioClaves([f], SECCION_DOCENTE.keys);
      if (typeof prom === 'number') conteos[Math.min(5, Math.max(1, Math.round(prom))) - 1] += 1;
    });
    return conteos;
  }, [docente]);
  const dataDistribucion = useMemo(() => [{
    type: 'bar', x: ['1', '2', '3', '4', '5'], y: distribucion,
    marker: { color }, text: distribucion.map(String), textposition: 'outside',
  }], [distribucion, color]);
  const layoutDistribucion = useMemo(() => ({
    height: 240, margin: { t: 16, r: 16, b: 40, l: 40 }, separators: ',.',
    xaxis: { title: 'Promedio de esa respuesta, redondeado (1-5)' }, yaxis: { title: 'Respuestas' },
  }), []);

  const botonNav = (fn, txt, label) => (
    <button
      type="button"
      onClick={fn || undefined}
      disabled={!fn}
      className="w-8 h-8 rounded-lg border border-ink-600 text-slate-300 hover:bg-ink-700 disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label={label}
      title={label}
    >
      {txt}
    </button>
  );

  return (
    <ModalRanking
      titulo={docente.nombre}
      subtitulo={`Ficha del docente · ${etiquetaPeriodo}${posicion ? ' · ' + posicion : ''}`}
      ancho="max-w-5xl"
      onClose={onClose}
      acciones={<>{botonNav(onAnterior, '‹', 'Docente anterior (←)')}{botonNav(onSiguiente, '›', 'Docente siguiente (→)')}</>}
    >
      {/* Identidad */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold" style={{ color, backgroundColor: color + '26', border: `1px solid ${color}66` }}>
          {iniciales_(docente.nombre)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {docente.areas.map((c) => <ChipCarrera key={c} carrera={c} />)}
            <ChipMaterias materias={docente.materiasDictadas} />
            <BadgeConfiabilidad d={docente} />
          </div>
          <p className="text-xs text-slate-500 mt-1.5 truncate">{docente.materiasDictadas.join(' · ')}</p>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiRanking
          etiqueta="Promedio docente"
          valor={sinPromedio ? '—' : fmtDec_(docente.promedioDocente)}
          color={sinPromedio ? '#64748b' : colorNota15_(docente.promedioDocente)}
          detalle={sinPromedio ? 'todavía sin respuestas' : delta == null ? 'sin promedio institucional' : `${delta >= 0 ? '+' : '−'}${comaDecimal_(Math.abs(delta).toFixed(2))} vs. institucional (${fmtDec_(promedioInstitucional.global)})${muestraChica ? ' · muestra pequeña' : ''}`}
        />
        <KpiRanking
          etiqueta="Respuestas"
          valor={docente.totalRespuestas}
          detalle={`${docente.muestra ? textoCobertura_(docente).replace(/^\d+ /, '') : 'sin dato de asistencia'}${docente.estudiantesListas != null ? ` · ${docente.estudiantesListas} en el listado` : ''}`}
        />
        <KpiRanking
          etiqueta="Materia no asignada"
          valor={docente.respuestasNoAsignadas}
          color={docente.respuestasNoAsignadas ? '#fbbf24' : '#10b981'}
          alerta={docente.respuestasNoAsignadas > 0}
          detalle={docente.respuestasNoAsignadas ? 'ver pestaña Materias' : 'todo calza con lo asignado'}
          onClick={docente.respuestasNoAsignadas ? () => setTab('materias') : undefined}
        />
        <KpiRanking
          etiqueta="Comentarios"
          valor={docente.comentarios.conteo}
          detalle={docente.comentarios.conteo ? `largo promedio ~${docente.comentarios.longitudPromedio} caracteres` : 'sin comentarios'}
        />
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-ink-700 mb-4">
        {TABS_FICHA.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={'text-sm font-semibold px-3 py-2 -mb-px border-b-2 transition-colors ' + (tab === t.key ? 'text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-300')}
            style={tab === t.key ? { borderColor: color } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'perfil' && (sinPromedio ? (
        <p className="text-sm text-slate-500 py-6 text-center">
          Todavía no hay respuestas para este docente. Revisa la pestaña Materias para ver lo asignado.
        </p>
      ) : (
        <>
        {docente.confiabilidad !== 'confiable' && (
          <div className={'mb-4 rounded-lg border px-3 py-2 text-sm ' + (docente.confiabilidad === 'representativa' ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-200' : 'border-amber-800/60 bg-amber-950/20 text-amber-200')}>
            {docente.confiabilidad === 'representativa'
              ? <>Muestra pequeña pero <b>representativa</b>: {textoCobertura_(docente)}. Respondió una buena parte de los que asistieron.</>
              : <>Muestra pequeña: {textoCobertura_(docente)}. Tómalo como referencia; con pocas respuestas los números pueden moverse bastante.</>}
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-xs text-slate-400 mb-3">Bloque Docente, pregunta por pregunta</p>
            <BarrasPorPregunta docente={docente} promedioInstitucional={promedioInstitucional} color={color} />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1 text-center">Perfil vs. institucional <span className="text-slate-600">(la escala empieza en 3 para que se noten las diferencias)</span></p>
            <RadarDocente docente={docente} promedioInstitucional={promedioInstitucional} color={color} />
            <div className="flex justify-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: color }} />{docente.nombre}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-slate-300" />Institucional</span>
            </div>
          </div>
        </div>
        </>
      ))}

      {tab === 'materias' && (
        <div className="overflow-x-auto">
          <p className="text-xs text-slate-400 mb-2">Materias asignadas en la base de grupos vs. lo que respondieron los estudiantes.</p>
          <table className="text-xs w-full whitespace-nowrap">
            <thead>
              <tr><Th>Materia</Th><Th>Carrera</Th><Th right>Grupos</Th><Th right>Est. listas</Th><Th right>Asist. ≥1</Th><Th right>Respuestas</Th><Th right>% de asist.</Th><Th right>Promedio</Th></tr>
            </thead>
            <tbody>
              {docente.porMateria.map((m) => (
                <tr key={m.carrera + m.materia} className="border-t border-ink-700">
                  <Td><span className="text-slate-200">{m.materia}</span></Td>
                  <Td><ChipCarrera carrera={m.carrera} /></Td>
                  <Td right>{m.grupos}</Td>
                  <Td right>{m.estudiantesListas ?? '—'}</Td>
                  <Td right><span className="font-semibold text-slate-200">{m.asistentes ?? '—'}</span></Td>
                  <Td right>{m.respuestas || <span className="text-slate-500">0</span>}</Td>
                  <Td right>{m.asistentes ? comaDecimal_(((m.respuestas / m.asistentes) * 100).toFixed(0)) + '%' : '—'}</Td>
                  <Td right>
                    {m.respuestas > 0
                      ? <span style={{ color: colorNota15_(m.promedio) }} className="font-semibold" title={m.respuestas < N_MIN_DOCENTE_OCULTO ? 'Muestra pequeña' : undefined}>{fmtDec_(m.promedio)}{m.respuestas < N_MIN_DOCENTE_OCULTO ? '*' : ''}</span>
                      : <span className="text-slate-500">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {docente.noAsignadas.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-800/60 bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-amber-300 mb-1">⚠ Respuestas con una materia que no tiene asignada</p>
              <p className="text-[11px] text-slate-400 mb-2">El estudiante pudo haber elegido mal la materia. Estas respuestas sí cuentan para el promedio del docente.</p>
              <table className="text-xs w-full">
                <tbody>
                  {docente.noAsignadas.map((m) => (
                    <tr key={m.materia} className="border-t border-amber-900/40">
                      <Td><span className="text-amber-200">{m.materia}</span></Td>
                      <Td right>{m.n} resp.</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'distribucion' && (docente.totalRespuestas === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">Todavía no hay respuestas para este docente.</p>
      ) : (
        <div>
          <p className="text-xs text-slate-400 mb-2">Cuántas respuestas dieron cada nota promedio. Sirve para detectar polarización, que el promedio solo no muestra.</p>
          <PlotlyChart data={dataDistribucion} layout={layoutDistribucion} style={{ width: '100%', height: 240 }} />
          <p className="text-[11px] text-slate-500 mt-2">
            {docente.comentarios.conteo > 0
              ? `${docente.comentarios.conteo} de ${docente.totalRespuestas} respuesta(s) incluyeron un comentario. El contenido no se muestra acá todavía: queda pendiente para una fase futura, con acceso restringido.`
              : 'Sin comentarios registrados todavía.'}
          </p>
        </div>
      ))}
    </ModalRanking>
  );
}
