import { useEffect, useRef, useState } from 'react';
import { cargarPlotly } from '../lib/plotly.js';

const LAYOUT_BASE = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#cbd5e1', family: 'Inter, system-ui, sans-serif', size: 11 },
  margin: { t: 24, r: 16, b: 40, l: 48 },
  legend: { orientation: 'h', y: -0.15 },
  colorway: ['#5b7fff', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa'],
  xaxis: { gridcolor: '#232b3a', zerolinecolor: '#2f3a4d' },
  yaxis: { gridcolor: '#232b3a', zerolinecolor: '#2f3a4d' },
};

const CONFIG_BASE = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
};

/** Wrapper delgado sobre Plotly.react -- soporta tema oscuro (ver
 *  LAYOUT_BASE), y limpia el gráfico al desmontar (Plotly.purge). */
export default function PlotlyChart({ data, layout, config, style, className }) {
  const contenedorRef = useRef(null);
  const [plotly, setPlotly] = useState(null);

  useEffect(() => {
    let activo = true;
    cargarPlotly().then((mod) => { if (activo) setPlotly(mod); });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (!plotly || !contenedorRef.current) return;
    plotly.react(
      contenedorRef.current,
      data,
      { ...LAYOUT_BASE, ...layout },
      { ...CONFIG_BASE, ...config }
    );
  }, [plotly, data, layout, config]);

  useEffect(() => {
    const nodo = contenedorRef.current;
    return () => { if (nodo && plotly) plotly.purge(nodo); };
  }, [plotly]);

  if (!plotly) {
    return <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>Cargando gráfico…</div>;
  }
  return <div ref={contenedorRef} className={className} style={style} />;
}
