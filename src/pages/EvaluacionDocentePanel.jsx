import { useEffect, useMemo, useState } from 'react';
import Combobox from '../components/Combobox.jsx';
import PlotlyChart from '../components/PlotlyChart.jsx';
import { normalizar } from '../lib/normalizar.js';
import {
  CATEGORIAS_EVALUACION_DOCENTE,
  colorDeMes,
  fetchGruposEvaluacionDocente,
  formatearFechaDDMMYYYY,
  fetchMesesActivosMapa,
  fetchMesesDisponibles,
  fetchStatsYCrudo,
  icWilson,
  matrizCorrelacion,
  PREGUNTAS_LIKERT_KEYS,
  resumenDeFilas,
  slug,
  togglearMesActivo,
} from '../lib/evaluacionDocente.js';

const VISTAS = { TABLA: 'tabla', ESTADISTICAS: 'estadisticas' };

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_360px] gap-6 items-start">
      {/* Orden en pantallas angostas: Nav -> switches/links -> contenido
          principal (que puede ser una tabla larga) -- así los switches
          nunca quedan escondidos abajo de todo al hacer scroll. En pantallas
          grandes (lg+) vuelve al orden Nav | Contenido | Rail derecho. */}
      <div className="order-1">
        <NavLateral vista={vista} onCambiarVista={setVista} />
      </div>

      <div className="order-2 lg:order-3 space-y-6">
        <EvaluacionesActivas meses={meses} activos={activos} onToggle={onToggle} />
        <LinksPorCategoriaYMes meses={meses} />
      </div>

      <div className="order-3 lg:order-2 min-w-0">
        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>
        )}
        {vista === VISTAS.TABLA ? <TablaGrupos meses={meses} activos={activos} /> : <Estadisticas meses={meses} />}
      </div>
    </div>
  );
}

function NavLateral({ vista, onCambiarVista }) {
  const items = [
    { id: VISTAS.TABLA, label: 'Grupos', icono: '☰' },
    { id: VISTAS.ESTADISTICAS, label: 'Estadísticas', icono: '📊' },
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

/** Mínimo de respuestas combinadas para que una matriz de correlación
 *  diga algo real -- con menos de esto, cualquier r es ruido de muestra
 *  chica (más estricto que N_MINIMO_CONFIABLE porque acá se cruzan pares
 *  de variables, no una sola). */
const N_MINIMO_CORRELACION = 10;

function Estadisticas({ meses }) {
  const [crudo, setCrudo] = useState(null);
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mesElegido, setMesElegido] = useState(null);
  const [categoriasActivas, setCategoriasActivas] = useState(() => new Set());

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { stats: s, crudo: c } = await fetchStatsYCrudo();
      setStats(s);
      setCrudo(c);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function elegirMes(mes) {
    setMesElegido(mes);
    setCategoriasActivas(new Set());
  }

  function toggleCategoria(categoria) {
    setCategoriasActivas((prev) => {
      const next = new Set(prev);
      if (next.has(categoria)) next.delete(categoria);
      else next.add(categoria);
      return next;
    });
  }

  const porCategoria = (crudo || []).filter((d) => d.mes_calificacion === mesElegido);
  const filasGlobal = porCategoria.flatMap((d) => d.filas);
  const global = { categoria_programa: 'Todas', resumen: resumenDeFilas(filasGlobal) };
  const seriesActivas = porCategoria.filter((d) => categoriasActivas.has(d.categoria_programa));
  const statsDelMes = (stats || []).filter((s) => s.mes_calificacion === mesElegido);

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
          <div>
            <p className="text-xs text-slate-400 mb-2">Mes</p>
            <div className="flex flex-wrap gap-2">
              {meses.map((mes) => {
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
