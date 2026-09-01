import { useEffect, useMemo, useState } from 'react';
import Combobox from '../components/Combobox.jsx';
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
  formatearFechaDDMMYYYY,
  fetchMesesActivosMapa,
  fetchMesesDisponibles,
  fetchStatsYCrudo,
  icWilson,
  matrizCorrelacion,
  MES_HISTORICO_ENERO_JULIO,
  MESES_ES,
  NPS_2025_FIJO,
  PREGUNTAS_LIKERT_KEYS,
  RESPUESTAS_SATISFACCION_2026_FIJO,
  resumenDeFilas,
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

  useEffect(() => {
    (async () => {
      try {
        const [mesesData, activosData] = await Promise.all([fetchMesesDisponibles(), fetchMesesActivosMapa()]);
        setMeses(mesesData.sort());
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
    <div className={
      'grid grid-cols-1 gap-6 items-start ' +
      (mostrarRailDerecho ? 'lg:grid-cols-[180px_1fr_360px]' : 'lg:grid-cols-[180px_1fr]')
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
        {vista === VISTAS.TABLA && <TablaGrupos meses={meses} activos={activos} />}
        {vista === VISTAS.ESTADISTICAS && <Estadisticas meses={meses} />}
        {vista === VISTAS.RANKING && <RankingDocente />}
      </div>
    </div>
  );
}

function NavLateral({ vista, onCambiarVista }) {
  const items = [
    { id: VISTAS.TABLA, label: 'Grupos', icono: '☰' },
    { id: VISTAS.ESTADISTICAS, label: 'Estadísticas', icono: '📊' },
    { id: VISTAS.RANKING, label: 'Ranking Docente', icono: '🏅' },
  ];
  return (
    <nav className="flex lg:flex-col gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onCambiarVista(item.id)}
          className={
            'flex items-center gap-2 text-sm rounded-md px-3 py-2 text-left transition-colors border ' +
            (vista === item.id
              ? 'bg-accent-500/15 border-accent-500 text-accent-300'
              : 'bg-ink-900 border-ink-700 text-slate-300 hover:bg-ink-800')
          }
        >
          <span>{item.icono}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function TablaGrupos({ meses, activos }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mesesElegidos, setMesesElegidos] = useState(() => new Set(meses.filter((m) => activos[m])));
  const [categoriasElegidas, setCategoriasElegidas] = useState(() => new Set(CATEGORIAS_EVALUACION_DOCENTE));
  const [materiaTexto, setMateriaTexto] = useState('');
  const [tutorTexto, setTutorTexto] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setFilas(await fetchGruposEvaluacionDocente());
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  function toggleEnSet(set, setSet, valor) {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(valor)) next.delete(valor);
      else next.add(valor);
      return next;
    });
  }

  const materias = useMemo(
    () => Array.from(new Set(filas.map((f) => f.materia).filter(Boolean))).sort(),
    [filas]
  );
  const tutores = useMemo(
    () => Array.from(new Set(filas.map((f) => f.tutor_calendario).filter(Boolean))).sort(),
    [filas]
  );

  const materiaQ = normalizar(materiaTexto);
  const tutorQ = normalizar(tutorTexto);
  const filasFiltradas = filas.filter((f) => {
    if (mesesElegidos.size && !mesesElegidos.has(f.mes_calificacion)) return false;
    if (categoriasElegidas.size && !categoriasElegidas.has(f.categoria_programa)) return false;
    if (materiaQ && !normalizar(f.materia).includes(materiaQ)) return false;
    if (tutorQ && !normalizar(f.tutor_calendario).includes(tutorQ)) return false;
    return true;
  });

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Grupos con evaluación docente</h2>
        <p className="text-xs text-slate-400 mt-0.5">{filasFiltradas.length} de {filas.length} grupo(s)</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
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

        <div>
          <p className="text-xs text-slate-400 mb-1.5">Categoría de programa</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS_EVALUACION_DOCENTE.map((categoria) => (
              <ChipFiltro
                key={categoria}
                activo={categoriasElegidas.has(categoria)}
                onClick={() => toggleEnSet(categoriasElegidas, setCategoriasElegidas, categoria)}
              >
                {categoria}
              </ChipFiltro>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-1.5">Materia</p>
          <Combobox value={materiaTexto} onChange={setMateriaTexto} options={materias} placeholder="Escribir o elegir materia" />
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-1.5">Tutor</p>
          <Combobox value={tutorTexto} onChange={setTutorTexto} options={tutores} placeholder="Escribir o elegir tutor" />
        </div>
      </div>

      {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>}
      {cargando ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="text-slate-400">
              <tr>
                <Th>ID Grupo (Mapeo)</Th>
                <Th>Mes de calificación</Th>
                <Th>Group ID</Th>
                <Th>Section ID</Th>
                <Th>categoria_programa</Th>
                <Th>Materia</Th>
                <Th>Horario</Th>
                <Th>Fecha calendario Inicio</Th>
                <Th>Fecha calendario Fin</Th>
                <Th>Tutor Calendario</Th>
                <Th right>Cupos Activos</Th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {filasFiltradas.map((f) => (
                <tr key={f.group_id} className="border-t border-ink-700 hover:bg-ink-800/60">
                  <Td>{f.id_grupo_mapeo}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colorDeMes(f.mes_calificacion) }} />
                      {f.mes_calificacion}
                    </span>
                  </Td>
                  <Td>{f.group_id}</Td>
                  <Td>{f.section_id}</Td>
                  <Td>{f.categoria_programa}</Td>
                  <Td>{f.materia}</Td>
                  <Td>{f.horario}</Td>
                  <Td>{formatearFechaDDMMYYYY(f.fecha_calendario_inicio)}</Td>
                  <Td>{formatearFechaDDMMYYYY(f.fecha_calendario_fin)}</Td>
                  <Td>{f.tutor_calendario}</Td>
                  <Td right>{f.cupos_activos ?? '—'}</Td>
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

function Estadisticas({ meses }) {
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
  // importación fija -- no vive en base_de_grupos_evaluacion_docente ni
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

  const porCategoria = esHistorico
    ? (crudoHistorico || [])
    : (crudo || []).filter((d) => d.mes_calificacion === mesElegido);
  const filasGlobal = porCategoria.flatMap((d) => d.filas);
  const global = { categoria_programa: 'Todas', resumen: resumenDeFilas(filasGlobal) };
  const seriesActivas = porCategoria.filter((d) => categoriasActivas.has(d.categoria_programa));
  // El histórico no tiene cupos_activos (no viene de base_de_grupos_evaluacion_docente),
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
          <NpsComparativo2025vs2026 crudo={crudo} />
          <TablaNpsMensual2026
            crudo={crudo}
            estudiantesActivosMapa={estudiantesActivosMapa}
            mesSincronizando={mesSincronizando}
            onSincronizarEstudiantesActivos={sincronizarEstudiantesActivos}
          />

          <SeccionSatisfaccion
            titulo="Satisfacción Docente"
            seccion={SECCION_DOCENTE}
            promedios2025={SATISFACCION_DOCENTE_2025_PROMEDIO}
            datosFijo2026={SATISFACCION_DOCENTE_2026_FIJO}
            crudo={crudo}
            estudiantesActivosMapa={estudiantesActivosMapa}
          />
          <SeccionSatisfaccion
            titulo="Satisfacción Contenidos"
            seccion={SECCION_CONTENIDOS}
            promedios2025={SATISFACCION_CONTENIDOS_2025_PROMEDIO}
            datosFijo2026={SATISFACCION_CONTENIDOS_2026_FIJO}
            crudo={crudo}
            estudiantesActivosMapa={estudiantesActivosMapa}
          />
          <SeccionSatisfaccion
            titulo="Satisfacción Plataforma"
            seccion={SECCION_PLATAFORMA}
            promedios2025={SATISFACCION_PLATAFORMA_2025_PROMEDIO}
            datosFijo2026={SATISFACCION_PLATAFORMA_2026_FIJO}
            crudo={crudo}
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
function construirRankingDocentes_(crudo) {
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
    return {
      nombre: d.nombre,
      areas: Array.from(d.areas).sort(),
      materias: Array.from(d.materias).sort(),
      filas: d.filas,
      totalRespuestas: total,
      promedioDocente,
      porPregunta,
      comentarios: { conteo: conComentario.length, longitudPromedio },
      confiabilidad,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function RankingDocente() {
  const [crudo, setCrudo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const { crudo } = await fetchStatsYCrudo();
        if (vivo) setCrudo(crudo);
      } catch (e) {
        if (vivo) setError(e.message || String(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const docentes = useMemo(() => construirRankingDocentes_(crudo), [crudo]);
  const visibles = useMemo(() => docentes.filter((d) => d.confiabilidad !== 'oculto'), [docentes]);
  const ocultosCount = docentes.length - visibles.length;
  const promedioInstitucional = useMemo(() => {
    const todas = (crudo || []).flatMap((g) => g.filas || []);
    const porPregunta = {};
    SECCION_DOCENTE.keys.forEach((k) => { porPregunta[k] = calcularPromedioClaves(todas, [k]); });
    return porPregunta;
  }, [crudo]);

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
          Panel de acompañamiento, no una tabla de posiciones: cada docente se compara contra sí mismo y contra el promedio institucional, nunca contra sus compañeros. Datos desde Agosto 2026 (las respuestas que nosotros mismos recolectamos). Con menos de {N_MIN_DOCENTE_OCULTO} respuestas acumuladas un docente todavía no aparece acá{ocultosCount > 0 ? ` (${ocultosCount} en ese caso ahora mismo)` : ''}; entre {N_MIN_DOCENTE_OCULTO} y {N_MIN_DOCENTE_CONFIABLE} se marca "⚠ muestra en construcción".
        </p>
      </div>

      <div className="rounded-md border overflow-x-auto" style={estiloPanel}>
        <table className="text-xs w-full whitespace-nowrap border-collapse">
          <thead>
            <tr>
              <Th>Docente</Th>
              <Th>Área(s)</Th>
              <Th right>Respuestas</Th>
              <Th right>Promedio Docente</Th>
              <th className="py-1.5 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-slate-500">Todavía no hay docentes con suficientes respuestas acumuladas.</td></tr>
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
        />
      )}
    </div>
  );
}

function FichaDocente({ docente, promedioInstitucional, enConstruccion }) {
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
          <p className="text-xs text-slate-400">{docente.areas.join(' · ')} · {docente.totalRespuestas} respuesta(s)</p>
        </div>
        {enConstruccion && (
          <span className="text-[11px] font-medium text-amber-300 bg-amber-950/40 border border-amber-800 rounded px-2 py-1">
            ⚠ Muestra en construcción -- menos de {N_MIN_DOCENTE_CONFIABLE} respuestas acumuladas, estos números todavía pueden moverse mucho con cada respuesta nueva.
          </span>
        )}
      </div>

      <div className="bg-ink-800 border border-ink-600 rounded-md p-3">
        <p className="text-xs text-slate-300 mb-2">Bloque Docente, pregunta por pregunta -- vs. promedio institucional del mismo período</p>
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
