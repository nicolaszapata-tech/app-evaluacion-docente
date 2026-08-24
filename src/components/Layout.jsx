export default function Layout({ children, sesion, onCerrarSesion }) {
  return (
    <div className="min-h-screen bg-ink-950 text-slate-100">
      <header className="border-b border-ink-700 bg-ink-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-accent-500 flex items-center justify-center text-sm font-semibold text-white">
              ED
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-slate-100">Evaluación Docente</div>
              <div className="text-xs text-slate-400 -mt-0.5">Calidad Académica HE</div>
            </div>
          </div>
          {sesion && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 hidden sm:inline">{sesion.email}</span>
              <button
                type="button"
                onClick={onCerrarSesion}
                className="text-xs text-slate-400 hover:text-slate-100 border border-ink-600 rounded-md px-2.5 py-1.5 hover:bg-ink-800 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-[1800px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
