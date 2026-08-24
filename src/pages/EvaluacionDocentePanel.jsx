import { useEffect, useState } from 'react';
import {
  CATEGORIAS_EVALUACION_DOCENTE,
  fetchDetalleEvaluacionDocente,
  fetchGruposEvaluacionDocente,
  fetchMesesActivosMapa,
  fetchMesesDisponibles,
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
        {vista === VISTAS.TABLA ? <TablaGrupos /> : <Estadisticas meses={meses} />}
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

function TablaGrupos() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

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

  const q = busqueda.trim().toLowerCase();
  const filasFiltradas = q
    ? filas.filter((f) => Object.values(f).some((v) => String(v ?? '').toLowerCase().includes(q)))
    : filas;

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Grupos con evaluación docente</h2>
          <p className="text-xs text-slate-400 mt-0.5">{filasFiltradas.length} de {filas.length} grupo(s)</p>
        </div>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar…"
          className="w-48 bg-ink-800 border border-ink-600 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
        />
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
                <Th>subject_name</Th>
                <Th>Horario</Th>
                <Th>Sección</Th>
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
                  <Td>{f.mes_calificacion}</Td>
                  <Td>{f.group_id}</Td>
                  <Td>{f.section_id}</Td>
                  <Td>{f.categoria_programa}</Td>
                  <Td>{f.materia}</Td>
                  <Td>{f.subject_name}</Td>
                  <Td>{f.horario}</Td>
                  <Td>{f.seccion}</Td>
                  <Td>{f.fecha_calendario_inicio}</Td>
                  <Td>{f.fecha_calendario_fin}</Td>
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

const COLOR_CATEGORIA = {
  Administración: '#5b7fff',
  Contabilidad: '#f59e0b',
  Ingeniería: '#10b981',
  Marketing: '#f43f5e',
};

function Estadisticas({ meses }) {
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mesElegido, setMesElegido] = useState(null);
  const [categoriasActivas, setCategoriasActivas] = useState(() => new Set());

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { detalle: d } = await fetchDetalleEvaluacionDocente();
      setDetalle(d);
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

  const detalleDelMes = (detalle || []).filter((d) => d.mes_calificacion === mesElegido);
  const global = detalleDelMes.find((d) => d.categoria_programa === 'Todas');
  const porCategoria = detalleDelMes.filter((d) => d.categoria_programa !== 'Todas');
  const seriesActivas = porCategoria.filter((d) => categoriasActivas.has(d.categoria_programa));

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
              {meses.map((mes) => (
                <button
                  key={mes}
                  type="button"
                  onClick={() => elegirMes(mes)}
                  className={
                    'text-sm rounded-md px-3 py-1.5 border transition-colors ' +
                    (mesElegido === mes
                      ? 'bg-accent-500/15 border-accent-500 text-accent-300'
                      : 'bg-ink-800 border-ink-600 text-slate-300 hover:border-ink-500')
                  }
                >
                  {mes}
                </button>
              ))}
            </div>
          </div>

          {!mesElegido && <p className="text-xs text-slate-400">Selecciona un mes para ver el detalle.</p>}

          {mesElegido && (
            <>
              <div>
                <p className="text-xs text-slate-400 mb-2">Categorías a comparar (clic para superponer en el histograma)</p>
                <div className="flex flex-wrap gap-2">
                  {porCategoria.map((d) => {
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
                        <span className="text-xs opacity-70">({d.respuestas})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {seriesActivas.length === 0 ? (
                <p className="text-xs text-slate-400">Elige al menos una categoría para ver el histograma.</p>
              ) : (
                <Histograma series={seriesActivas} />
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                {global && <TarjetaResumen titulo="Global (todas las categorías)" color="#94a3b8" resumen={global} />}
                {seriesActivas.map((d) => (
                  <TarjetaResumen
                    key={d.categoria_programa}
                    titulo={d.categoria_programa}
                    color={COLOR_CATEGORIA[d.categoria_programa] || '#5b7fff'}
                    resumen={d}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Histograma({ series }) {
  return (
    <div className="bg-ink-800 border border-ink-600 rounded-md p-4 space-y-3 overflow-x-auto">
      <div className="min-w-[560px]">
        {PREGUNTAS_LIKERT.map((p) => (
          <div key={p.key} className="mb-3">
            <p className="text-xs text-slate-300 mb-1">{p.label}</p>
            <div className="space-y-1">
              {series.map((s) => {
                const valor = s.preguntas[p.key];
                const color = COLOR_CATEGORIA[s.categoria_programa] || '#5b7fff';
                return (
                  <div key={s.categoria_programa} className="flex items-center gap-2">
                    <div className="flex-1 h-3.5 rounded bg-ink-700 overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{ width: `${((valor || 0) / 5) * 100}%`, backgroundColor: color }}
                        title={`${s.categoria_programa}: ${valor ?? '—'} / 5`}
                      />
                    </div>
                    <span className="w-8 text-right text-[11px] text-slate-400 shrink-0">{valor ?? '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Escala 1 a 5. Cada barra es el promedio de esa pregunta para la categoría de su color.</p>
    </div>
  );
}

function TarjetaResumen({ titulo, color, resumen }) {
  return (
    <div className="bg-ink-800 border border-ink-600 rounded-md p-3">
      <div className="flex items-center gap-1.5 text-sm text-slate-200 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {titulo}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-slate-100">{resumen.promedio_general ?? '—'}</div>
          <div className="text-[11px] text-slate-400">Promedio /5</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100">{resumen.promedio_nps ?? '—'}</div>
          <div className="text-[11px] text-slate-400">NPS /10</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100">{resumen.respuestas}</div>
          <div className="text-[11px] text-slate-400">Respuestas</div>
        </div>
      </div>
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
            <span className="text-sm text-slate-200">{mes}</span>
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
        {meses.flatMap((mes) =>
          CATEGORIAS_EVALUACION_DOCENTE.map((categoria) => {
            const url = `${window.location.origin}/evaluar/${slug(categoria)}/${slug(mes)}`;
            const id = `${categoria}-${mes}`;
            return (
              <div key={id} className="flex items-center justify-between gap-3 bg-ink-800 border border-ink-600 rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-slate-200">{categoria} · {mes}</div>
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
          })
        )}
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
