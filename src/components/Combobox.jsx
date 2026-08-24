import { useMemo, useRef, useState } from 'react';
import { normalizar } from '../lib/normalizar.js';

/** Input de texto libre + desplegable de sugerencias: escribir filtra en vivo
 *  (el valor que se escribe YA es el filtro, no hace falta elegir una
 *  opción), y also se puede hacer clic en una sugerencia para completarlo
 *  exacto. (Copiado de APP_GRUPOS_ACTIVOS/src/components/Combobox.jsx.) */
export default function Combobox({ value, onChange, options, placeholder }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  const sugerencias = useMemo(() => {
    const q = normalizar(value);
    const lista = q ? options.filter((o) => normalizar(o).includes(q)) : options;
    return lista.slice(0, 8);
  }, [options, value]);

  return (
    <div className="relative" ref={contenedorRef}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
        <IconoBuscar />
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        className="w-full bg-ink-800 border border-ink-600 rounded-full pl-8 pr-8 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-colors"
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-ink-700"
        >
          ×
        </button>
      )}
      {abierto && sugerencias.length > 0 && (
        <ul className="absolute z-20 mt-1.5 w-full max-h-56 overflow-y-auto rounded-lg border border-ink-600 bg-ink-800 shadow-lg shadow-black/30 py-1">
          {sugerencias.map((op) => (
            <li key={op}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(op);
                  setAbierto(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-accent-500/15 hover:text-accent-300 transition-colors"
              >
                {op}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconoBuscar() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 16l-3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
