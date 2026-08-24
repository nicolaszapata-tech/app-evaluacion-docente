import { useEffect, useState } from 'react';
import {
  CATEGORIAS_EVALUACION_DOCENTE,
  fetchGruposEvaluacionDocente,
  fetchMesesActivosMapa,
  fetchMesesDisponibles,
  fetchStatsEvaluacionDocente,
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
      <NavLateral vista={vista} onCambiarVista={setVista} />

      <div className="min-w-0">
        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>
        )}
        {vista === VISTAS.TABLA ? <TablaGrupos /> : <Estadisticas />}
      </div>

      <div className="space-y-6">
        <EvaluacionesActivas meses={meses} activos={activos} onToggle={onToggle} />
        <LinksPorCategoriaYMes meses={meses} />
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

function Estadisticas() {
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setStats(await fetchStatsEvaluacionDocente());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const maxParticipacion = Math.max(1, ...(stats || []).map((s) => s.participacion_pct || 0));

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Participación por categoría y mes</h2>
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

      {stats && (
        <div className="space-y-2.5">
          {stats.map((s) => (
            <div key={`${s.categoria_programa}-${s.mes_calificacion}`} className="bg-ink-800 border border-ink-600 rounded-md px-3 py-2.5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-200">{s.categoria_programa} · {s.mes_calificacion}</span>
                <span className="text-slate-400">
                  {s.respuestas_count} respuesta{s.respuestas_count === 1 ? '' : 's'}
                  {' · '}
                  {s.cupos_activos} cupo{s.cupos_activos === 1 ? '' : 's'}
                  {s.participacion_pct != null && <> · <span className="text-accent-300 font-medium">{s.participacion_pct}%</span></>}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
                <div
                  className="h-full bg-accent-500"
                  style={{ width: `${Math.min(100, ((s.participacion_pct || 0) / maxParticipacion) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
            <Switch activo={!!activos[mes]} onClick={() => onToggle(mes)} />
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
      onClick={onClick}
      className={
        'relative w-10 h-5.5 rounded-full transition-colors ' + (activo ? 'bg-accent-500' : 'bg-ink-600')
      }
    >
      <span
        className={
          'absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform ' +
          (activo ? 'translate-x-[19px]' : 'translate-x-0.5')
        }
      />
    </button>
  );
}
