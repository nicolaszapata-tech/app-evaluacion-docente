import { useEffect, useState } from 'react';
import {
  CATEGORIAS_EVALUACION_DOCENTE,
  fetchMesesActivosMapa,
  fetchMesesDisponibles,
  fetchStatsEvaluacionDocente,
  slug,
  togglearMesActivo,
} from '../lib/evaluacionDocente.js';

export default function EvaluacionDocentePanel() {
  const [meses, setMeses] = useState([]);
  const [activos, setActivos] = useState({});
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(null);

  async function recargar() {
    try {
      const [mesesData, activosData] = await Promise.all([fetchMesesDisponibles(), fetchMesesActivosMapa()]);
      setMeses(mesesData.sort());
      setActivos(activosData);
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  useEffect(() => {
    (async () => {
      await recargar();
      setCargando(false);
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

  async function onCargarStats() {
    setError(null);
    try {
      setStats(await fetchStatsEvaluacionDocente());
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  function copiarLink(url, id) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1500);
    });
  }

  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-slate-50">Evaluación Docente</h1>
        <p className="text-sm text-slate-400 mt-1">
          Links de evaluación por categoría + mes, y el switch de qué meses están abiertos para responder.
        </p>
      </div>

      {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>}

      <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
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

      <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">Links por categoría + mes</h2>
        <div className="space-y-2">
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

      <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Participación</h2>
          <button
            type="button"
            onClick={onCargarStats}
            className="text-xs text-slate-300 border border-ink-600 rounded-md px-2.5 py-1.5 hover:bg-ink-700 transition-colors"
          >
            Cargar
          </button>
        </div>
        {stats && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="text-left font-medium py-1 pr-3">Categoría</th>
                  <th className="text-left font-medium py-1 pr-3">Mes</th>
                  <th className="text-right font-medium py-1 pr-3">Respuestas</th>
                  <th className="text-right font-medium py-1 pr-3">Cupos activos</th>
                  <th className="text-right font-medium py-1">Participación</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {stats.map((s) => (
                  <tr key={`${s.categoria_programa}-${s.mes_calificacion}`} className="border-t border-ink-700">
                    <td className="py-1.5 pr-3">{s.categoria_programa}</td>
                    <td className="py-1.5 pr-3">{s.mes_calificacion}</td>
                    <td className="py-1.5 pr-3 text-right">{s.respuestas_count}</td>
                    <td className="py-1.5 pr-3 text-right">{s.cupos_activos}</td>
                    <td className="py-1.5 text-right">{s.participacion_pct == null ? '—' : `${s.participacion_pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
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
