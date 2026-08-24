import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Combobox from '../components/Combobox.jsx';
import {
  categoriaDeSlug,
  enviarEvaluacionDocente,
  fetchMesActivo,
  fetchMesesDisponibles,
  fetchOpcionesFormulario,
  mesDeSlug,
  sanitizarCedula,
} from '../lib/evaluacionDocente.js';

/** Preguntas literales del Google Form de referencia (Evaluación docente-
 *  INGENIERÍA DE SISTEMAS, releído 2026-08-24), reusadas para todas las
 *  categorías -- el cuestionario es el mismo, solo cambia materia/docente. */
const PREGUNTAS_PLATAFORMA = [
  { key: 'plataforma_acceso_recursos', texto: '¿Pude entrar sin inconvenientes a la plataforma y encontré los recursos que necesitaba para comprender las lecciones del curso?' },
  { key: 'plataforma_disponibilidad', texto: '¿La disponibilidad y el funcionamiento de la plataforma es adecuado con rapidez y de fácil comprensión propiciando mi aprendizaje?' },
];
const PREGUNTAS_DOCENTE = [
  { key: 'docente_comunicacion', texto: '¿El docente tiene habilidades comunicativas y me realiza buena retroalimentación y críticas de forma constructiva?' },
  { key: 'docente_creatividad', texto: '¿El docente desarrolló su clase de forma creativa, interesante y usó como herramienta la Plataforma, propiciando mi interés en la clase?' },
  { key: 'docente_preparacion', texto: '¿La preparación de las clases, las explicaciones y la actitud del docente fueron acordes a la enseñanza del curso y permitieron mi aprendizaje?' },
  { key: 'docente_estrategias_pedagogicas', texto: '¿El docente utiliza estrategias pedagógicas y didácticas como: el análisis de casos, experiencias profesionales, casos exitosos, aprendizaje basado en problemas y aprendizaje basado en proyectos?' },
  { key: 'docente_participacion', texto: '¿Pude participar en diferentes tipos de actividades (individuales, grupales y en plataforma) para desarrollar mis competencias?' },
  { key: 'docente_dominio', texto: '¿Considera que el docente tiene el dominio y la experiencia para la enseñanza de la asignatura?' },
];
const PREGUNTAS_CONTENIDOS = [
  { key: 'contenidos_ruta_aprendizaje', texto: '¿Fue clara la ruta de aprendizaje desarrollada en la materia?' },
  { key: 'contenidos_utilidad', texto: '¿Los contenidos programáticos de la asignatura me resultaron útiles, prácticos y comprensibles?' },
  { key: 'contenidos_informacion_clara', texto: '¿Encontraste información clara, suficiente e importante sobre la materia, el plan de trabajo y los criterios de evaluación?' },
  { key: 'contenidos_material', texto: '¿El material de trabajo de clase (actividades, quices, presentaciones y lecciones docente) y los contenidos en plataforma (videos, lecturas, refuerzos y evaluaciones) contienen los recursos acordes y coherentes para la comprensión y enseñanza del curso?' },
  { key: 'contenidos_estrategias_evaluacion', texto: '¿Siento que las estrategias implementadas para mi evaluación son adecuadas para el desarrollo de mis destrezas, resolución de problemas y son relevantes para mi vida?' },
];

const ESTADOS = { CARGANDO: 'cargando', CERRADO: 'cerrado', NO_ENCONTRADO: 'no_encontrado', LISTO: 'listo', ENVIADO: 'enviado' };
const LIKERT_VALORES = [1, 2, 3, 4, 5];
const NPS_VALORES = Array.from({ length: 11 }, (_, i) => i);

export default function EvaluacionDocenteForm() {
  const { categoriaSlug, mesSlug } = useParams();
  const categoria = categoriaDeSlug(categoriaSlug);

  const [estado, setEstado] = useState(ESTADOS.CARGANDO);
  const [mes, setMes] = useState(null);
  const [opciones, setOpciones] = useState({ materias: [], docentes: [], grupos: [] });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const [cedula, setCedula] = useState('');
  const [correo, setCorreo] = useState('');
  const [materia, setMateria] = useState('');
  const [docente, setDocente] = useState('');
  const [respuestas, setRespuestas] = useState({});
  const [nps, setNps] = useState('');
  const [comentarioGeneral, setComentarioGeneral] = useState('');

  useEffect(() => {
    (async () => {
      if (!categoria) { setEstado(ESTADOS.NO_ENCONTRADO); return; }
      try {
        const meses = await fetchMesesDisponibles();
        const mesResuelto = mesDeSlug(mesSlug, meses);
        if (!mesResuelto) { setEstado(ESTADOS.NO_ENCONTRADO); return; }
        setMes(mesResuelto);

        const activo = await fetchMesActivo(mesResuelto);
        if (!activo) { setEstado(ESTADOS.CERRADO); return; }

        const datos = await fetchOpcionesFormulario(categoria, mesResuelto);
        setOpciones(datos);
        setEstado(ESTADOS.LISTO);
      } catch (e) {
        setError(e.message || String(e));
        setEstado(ESTADOS.NO_ENCONTRADO);
      }
    })();
  }, [categoria, mesSlug]);

  const groupId = useMemo(() => {
    const g = opciones.grupos.find((x) => x.subject_name === materia && x.tutor_calendario === docente);
    return g?.group_id || null;
  }, [opciones.grupos, materia, docente]);

  function setRespuesta(key, valor) {
    setRespuestas((prev) => ({ ...prev, [key]: valor }));
  }

  function validar() {
    const cedulaLimpia = sanitizarCedula(cedula);
    if (!cedulaLimpia) return 'Falta tu número de identificación.';
    if (!opciones.materias.includes(materia)) return 'Selecciona la materia de la lista.';
    if (!opciones.docentes.includes(docente)) return 'Selecciona el docente de la lista.';
    const todasLasPreguntas = [...PREGUNTAS_PLATAFORMA, ...PREGUNTAS_DOCENTE, ...PREGUNTAS_CONTENIDOS];
    for (const p of todasLasPreguntas) {
      if (!respuestas[p.key]) return 'Faltan preguntas por responder.';
    }
    if (!respuestas.plataforma_comentarios?.trim()) return 'Falta el comentario sobre la plataforma.';
    if (!respuestas.docente_comentarios?.trim()) return 'Falta el comentario sobre el docente.';
    if (!respuestas.contenidos_comentarios?.trim()) return 'Falta el comentario sobre la asignatura.';
    if (nps === '') return 'Falta la pregunta de recomendación (0 a 10).';
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const mensaje = validar();
    if (mensaje) { setError(mensaje); return; }

    setEnviando(true);
    try {
      await enviarEvaluacionDocente({
        identidad: {
          cedula: sanitizarCedula(cedula),
          correo: correo.trim() || null,
          categoria_programa: categoria,
          mes_calificacion: mes,
        },
        respuestas: {
          categoria_programa: categoria,
          mes_calificacion: mes,
          group_id: groupId,
          materia,
          docente,
          ...respuestas,
          nps_recomendaria: Number(nps),
          comentario_general: comentarioGeneral.trim() || null,
        },
      });
      setEstado(ESTADOS.ENVIADO);
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally {
      setEnviando(false);
    }
  }

  if (estado === ESTADOS.CARGANDO) return <Centrado>Cargando…</Centrado>;
  if (estado === ESTADOS.NO_ENCONTRADO) {
    return <Centrado>Este link de evaluación no es válido. Verifica la URL con el área de calidad académica.</Centrado>;
  }
  if (estado === ESTADOS.CERRADO) {
    return <Centrado>Esta evaluación no está disponible por ahora. Intenta más tarde o consulta con el área de calidad académica.</Centrado>;
  }
  if (estado === ESTADOS.ENVIADO) {
    return <Centrado>¡Gracias por responder la evaluación! Tu respuesta quedó registrada.</Centrado>;
  }

  return (
    <div className="min-h-screen bg-ink-950 text-slate-100 px-4 py-8">
      <form onSubmit={onSubmit} className="max-w-xl mx-auto space-y-8">
        <header>
          <h1 className="text-lg font-semibold text-slate-50">Evaluación docente — {categoria}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {mes}. Estimado estudiante, la evaluación nos permite observar cómo estamos y qué podemos mejorar. Los campos marcados con * son obligatorios.
          </p>
        </header>

        <Seccion titulo="Tus datos">
          <Campo etiqueta="Número de identificación (cédula) *">
            <input
              type="text"
              inputMode="numeric"
              value={cedula}
              onChange={(e) => setCedula(sanitizarCedula(e.target.value))}
              className={inputClase}
              placeholder="Solo números"
            />
          </Campo>
          <Campo etiqueta="Correo institucional (opcional)">
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className={inputClase}
              placeholder="nombre@lanuevaamerica.edu.co"
            />
          </Campo>
        </Seccion>

        <Seccion titulo="Materia y docente a evaluar">
          <Campo etiqueta="Asignatura a evaluar *">
            <Combobox value={materia} onChange={setMateria} options={opciones.materias} placeholder="Escribe para buscar la materia" />
          </Campo>
          <Campo etiqueta="Docente a evaluar *">
            <Combobox value={docente} onChange={setDocente} options={opciones.docentes} placeholder="Escribe para buscar el docente" />
          </Campo>
        </Seccion>

        <Seccion titulo="Evaluación de plataforma" descripcion="Marca del 1 al 5, siendo 1 Muy malo y 5 Excelente.">
          {PREGUNTAS_PLATAFORMA.map((p) => (
            <Likert key={p.key} texto={p.texto} valor={respuestas[p.key]} onChange={(v) => setRespuesta(p.key, v)} />
          ))}
          <Campo etiqueta="Comentarios adicionales o sugerencias de mejora acerca de la PLATAFORMA (LMS) *">
            <textarea value={respuestas.plataforma_comentarios || ''} onChange={(e) => setRespuesta('plataforma_comentarios', e.target.value)} className={inputClase} rows={3} />
          </Campo>
        </Seccion>

        <Seccion titulo="Evaluación docente" descripcion="Marca del 1 al 5, siendo 1 Muy malo y 5 Excelente.">
          {PREGUNTAS_DOCENTE.map((p) => (
            <Likert key={p.key} texto={p.texto} valor={respuestas[p.key]} onChange={(v) => setRespuesta(p.key, v)} />
          ))}
          <Campo etiqueta="Comentarios adicionales o sugerencias de mejora acerca del PROFESOR *">
            <textarea value={respuestas.docente_comentarios || ''} onChange={(e) => setRespuesta('docente_comentarios', e.target.value)} className={inputClase} rows={3} />
          </Campo>
        </Seccion>

        <Seccion titulo="Evaluación de contenidos" descripcion="Marca del 1 al 5, siendo 1 Muy malo y 5 Excelente.">
          {PREGUNTAS_CONTENIDOS.map((p) => (
            <Likert key={p.key} texto={p.texto} valor={respuestas[p.key]} onChange={(v) => setRespuesta(p.key, v)} />
          ))}
          <Campo etiqueta="Comentarios adicionales o sugerencias de mejora acerca de la ASIGNATURA *">
            <textarea value={respuestas.contenidos_comentarios || ''} onChange={(e) => setRespuesta('contenidos_comentarios', e.target.value)} className={inputClase} rows={3} />
          </Campo>
        </Seccion>

        <Seccion titulo="Evaluación general">
          <Campo etiqueta="En una escala del 0 al 10, siendo 0 no lo recomendaría en lo absoluto y 10 lo recomendaría sin dudarlo, ¿qué tanto recomendarías a un amigo o colega que esté interesado en iniciar sus estudios profesionales, estudiar en la Nueva América? *">
            <Escala valores={NPS_VALORES} valor={nps} onChange={setNps} />
          </Campo>
          <Campo etiqueta="¿Tienes algún comentario adicional? (opcional)">
            <textarea value={comentarioGeneral} onChange={(e) => setComentarioGeneral(e.target.value)} className={inputClase} rows={3} />
          </Campo>
        </Seccion>

        {error && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-white font-medium rounded-md py-2.5 transition-colors"
        >
          {enviando ? 'Enviando…' : 'Enviar evaluación'}
        </button>
      </form>
    </div>
  );
}

const inputClase =
  'w-full bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-colors';

function Centrado({ children }) {
  return (
    <div className="min-h-screen bg-ink-950 text-slate-100 flex items-center justify-center px-6">
      <p className="max-w-sm text-center text-sm text-slate-300">{children}</p>
    </div>
  );
}

function Seccion({ titulo, descripcion, children }) {
  return (
    <section className="bg-ink-900 border border-ink-700 rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">{titulo}</h2>
        {descripcion && <p className="text-xs text-slate-400 mt-0.5">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

function Campo({ etiqueta, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-slate-300">{etiqueta}</span>
      {children}
    </label>
  );
}

function Escala({ valores, valor, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {valores.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          className={
            'w-8 h-8 rounded-md text-xs font-medium border transition-colors ' +
            (String(valor) === String(n)
              ? 'bg-accent-500 border-accent-500 text-white'
              : 'bg-ink-800 border-ink-600 text-slate-300 hover:border-ink-500')
          }
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Likert({ texto, valor, onChange }) {
  return (
    <div>
      <p className="text-xs text-slate-300 mb-1.5">{texto}</p>
      <Escala valores={LIKERT_VALORES} valor={valor} onChange={(v) => onChange(Number(v))} />
    </div>
  );
}
