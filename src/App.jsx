import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Login from './components/Login.jsx';
import EvaluacionDocenteForm from './pages/EvaluacionDocenteForm.jsx';
import { obtenerSesion, cerrarSesion } from './lib/auth.js';

// El panel se descarga aparte, solo después de una sesión válida: quien
// abre el link del formulario (o cambia la URL) no recibe ese código.
const EvaluacionDocentePanel = lazy(() => import('./pages/EvaluacionDocentePanel.jsx'));

export default function App() {
  return (
    <Routes>
      {/* Pública -- el formulario del estudiante NO pasa por el login. */}
      <Route path="/evaluar/:categoriaSlug/:mesSlug" element={<EvaluacionDocenteForm />} />
      <Route path="/*" element={<Panel />} />
    </Routes>
  );
}

const Cargando = () => (
  <div className="min-h-screen bg-ink-950 text-slate-400 flex items-center justify-center text-sm">Cargando…</div>
);

/** 2026-10-22: la sesión la confirma el SERVIDOR (cookie HttpOnly, ver
 *  api/_lib/sesion.js). Sin sesión válida solo se ve el login, y aunque
 *  alguien forzara el panel en el navegador, /api/datos y /api/panel le
 *  responden 403. */
function Panel() {
  const [sesion, setSesion] = useState(undefined); // undefined = verificando

  useEffect(() => {
    let vivo = true;
    obtenerSesion().then((s) => { if (vivo) setSesion(s); });
    return () => { vivo = false; };
  }, []);

  if (sesion === undefined) return <Cargando />;
  if (!sesion) return <Login onLogin={setSesion} />;

  return (
    <Layout sesion={sesion} onCerrarSesion={async () => { await cerrarSesion(); setSesion(null); }}>
      <Suspense fallback={<Cargando />}>
        <EvaluacionDocentePanel />
      </Suspense>
    </Layout>
  );
}
