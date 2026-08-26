/** Carga diferida de Plotly (solo el bundle cartesiano, ~350-400KB gzip) --
 *  se descarga recién cuando alguien entra a la vista Estadísticas, no en
 *  el bundle principal (que carga el formulario público del estudiante).
 *  Memoizado: la segunda vez que se pide, devuelve la misma promesa/módulo
 *  ya resuelto en vez de volver a importar. */
let promesaPlotly = null;

export function cargarPlotly() {
  if (!promesaPlotly) {
    promesaPlotly = import('plotly.js-cartesian-dist-min').then((mod) => mod.default || mod);
  }
  return promesaPlotly;
}
