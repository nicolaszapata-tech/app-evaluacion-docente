import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  const [grupoId, setGrupoId] = useState(''); // group_id de la clase elegida
  const [confirmando, setConfirmando] = useState(false);
  const refClase = useRef(null);
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

  // 2026-10-16: el estudiante elige SU CLASE (un grupo exacto: materia +
  // docente + horario + fechas) en un solo paso -- ver SelectorClase. Reemplaza
  // los dos campos materia/docente (2026-10-15 el docente ya dependía de la
  // materia, pero con dos grupos de la misma materia igual podía elegir el
  // docente equivocado). materia/docente/group_id salen del grupo elegido.
  const grupoSel = useMemo(() => opciones.grupos.find((g) => g.group_id === grupoId) || null, [opciones.grupos, grupoId]);
  const materia = grupoSel?.subject_name || '';
  const docente = grupoSel?.tutor_calendario || '';
  const groupId = grupoSel?.group_id || null;

  function setRespuesta(key, valor) {
    setRespuestas((prev) => ({ ...prev, [key]: valor }));
  }

  function validar() {
    const cedulaLimpia = sanitizarCedula(cedula);
    if (!cedulaLimpia) return 'Falta tu número de identificación.';
    if (!grupoSel) return 'Elige la clase (materia y docente) que vas a evaluar.';
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

  function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const mensaje = validar();
    if (mensaje) { setError(mensaje); return; }
    setConfirmando(true); // 2026-10-16: confirmación antes de registrar
  }

  function cambiarClase() {
    setConfirmando(false);
    setGrupoId('');
    refClase.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function enviar() {
    setError(null);
    setEnviando(true);
    try {
      await enviarEvaluacionDocente({
        identidad: {
          cedula: sanitizarCedula(cedula),
          correo: correo.trim() || null,
          categoria_programa: categoria,
          mes_calificacion: mes,
          group_id: groupId,
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
      setConfirmando(false);
      setEstado(ESTADOS.ENVIADO);
    } catch (e2) {
      setConfirmando(false);
      // 23505 = violación del índice único (cedula, group_id) -- ya se
      // envió una evaluación para esta cédula y esta materia/grupo.
      if (e2?.code === '23505') {
        setError('Ya registramos una evaluación tuya para esta materia. Si crees que es un error, contacta al área de calidad académica.');
      } else {
        setError(e2.message || String(e2));
      }
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

        <div ref={refClase}>
          <Seccion
            titulo="Tu clase"
            descripcion="Elige la clase que vas a evaluar: la materia con el docente que te la dictó."
          >
            <SelectorClase grupos={opciones.grupos} valor={grupoId} onChange={setGrupoId} />
          </Seccion>
        </div>

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
      {confirmando && grupoSel && (
        <ConfirmarEnvio
          grupo={grupoSel}
          enviando={enviando}
          onConfirmar={enviar}
          onCambiar={cambiarClase}
          onCerrar={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}

const inputClase =
  'w-full bg-ink-800 border border-ink-600 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-colors';

/** Fecha 'YYYY-MM-DD' -> 'DD/MM'. */
function ddmm_(iso) {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : '';
}

/** Hoy en Bogotá como 'YYYY-MM-DD' (para marcar clases que aún no inician). */
function hoyBogotaForm_() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function normalizarBusqueda_(t) {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Datos de la clase con etiqueta + valor, MISMO tamaño y buen contraste
 *  (2026-10-16, a pedido del usuario: el horario se veía muy gris y difícil
 *  de entender). Se usa en la tarjeta, en "Vas a evaluar" y en la
 *  confirmación, para que se lea igual en las tres. */
/** Horario en palabras (2026-10-16, a pedido del usuario: los estudiantes no
 *  entienden las siglas "LMV 6pm", "MJ 6pm S 8am"). Una línea por bloque de
 *  días, con hora de inicio y fin. Los valores salen de at_franja_sesion
 *  (app de Tutores y Materias, misma Supabase): todas las sesiones duran
 *  1 h 45 min. Si llega un código que no está acá, se intenta leer
 *  "Día H am/pm"; si tampoco, se muestra el código tal cual. */
const HORARIOS_DESCRIPTIVOS = {
  'LMV 6pm': ['Lunes, miércoles y viernes de 6:00 a 7:45 p. m.'],
  'LMV 8pm': ['Lunes, miércoles y viernes de 8:00 a 9:45 p. m.'],
  'MJ 6pm S 8am': ['Martes y jueves de 6:00 a 7:45 p. m.', 'Sábados de 8:00 a 9:45 a. m.'],
  'MJ 8pm S 10am': ['Martes y jueves de 8:00 a 9:45 p. m.', 'Sábados de 10:00 a 11:45 a. m.'],
};

function horarioDescriptivo_(codigo) {
  if (!codigo) return [];
  const limpio = String(codigo).trim().replace(/\s+/g, ' ');
  if (HORARIOS_DESCRIPTIVOS[limpio]) return HORARIOS_DESCRIPTIVOS[limpio];
  // "Miércoles 8 pm" -> "Miércoles desde las 8:00 p. m."
  const m = limpio.match(/^([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{1,2})\s*(am|pm)$/i);
  if (m) return [`${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} desde las ${m[2]}:00 ${m[3].toLowerCase() === 'am' ? 'a. m.' : 'p. m.'}`];
  return [limpio];
}

function DatosClase({ g, sinDocente }) {
  const fechas = g.fecha_calendario_inicio ? `del ${ddmm_(g.fecha_calendario_inicio)} al ${ddmm_(g.fecha_calendario_fin)}` : null;
  const horario = horarioDescriptivo_(g.horario);
  const filas = [
    sinDocente ? null : ['Docente', [g.tutor_calendario]],
    ['Horario', horario],
    ['Fechas', fechas ? [fechas] : []],
  ].filter((x) => x && x[1].length && x[1][0]);
  return (
    <div className="mt-1.5 space-y-1 text-sm">
      {filas.map(([etiqueta, lineas]) => (
        <div key={etiqueta} className="flex gap-2">
          <span className="w-16 shrink-0 text-slate-400">{etiqueta}</span>
          <span className="text-slate-100 font-medium space-y-0.5">
            {lineas.map((l) => <span key={l} className="block">{l}</span>)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Tu clase" en UN paso (2026-10-16, a pedido del usuario): cada tarjeta es
 *  un grupo exacto de doc_base_de_grupos (materia + docente + horario +
 *  fechas). Reemplaza los dos campos sueltos materia/docente: así el
 *  estudiante no puede armar una combinación que no existe, y el horario y
 *  las fechas le ayudan a reconocer SU grupo cuando hay dos de la misma
 *  materia con distinto docente. */
function SelectorClase({ grupos, valor, onChange }) {
  const [busqueda, setBusqueda] = useState('');
  const hoy = hoyBogotaForm_();
  const lista = useMemo(() => {
    const q = normalizarBusqueda_(busqueda);
    return grupos
      .filter((g) => g.group_id && g.subject_name && g.tutor_calendario)
      .filter((g) => !q || normalizarBusqueda_(`${g.subject_name} ${g.tutor_calendario} ${g.horario || ''} ${horarioDescriptivo_(g.horario).join(' ')}`).includes(q))
      .map((g) => ({ ...g, porIniciar: !!g.fecha_calendario_inicio && String(g.fecha_calendario_inicio).slice(0, 10) > hoy }))
      .sort((a, b) => (a.porIniciar - b.porIniciar) || a.subject_name.localeCompare(b.subject_name, 'es') || a.tutor_calendario.localeCompare(b.tutor_calendario, 'es'));
  }, [grupos, busqueda, hoy]);
  const elegido = grupos.find((g) => g.group_id === valor) || null;

  if (elegido) {
    return (
      <div className="rounded-lg border-2 border-accent-500 bg-accent-500/10 p-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-accent-400 mb-0.5">✓ Vas a evaluar</div>
          <div className="text-base font-semibold text-slate-50">{elegido.subject_name}</div>
          <DatosClase g={elegido} />
        </div>
        <button
          type="button"
          onClick={() => onChange('')}
          className="shrink-0 text-xs font-semibold rounded-md px-2.5 py-1.5 border border-ink-600 text-slate-300 hover:bg-ink-800"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Busca por materia o por docente…"
        className={inputClase}
      />
      <p className="text-sm leading-snug text-sky-200">
        Toca tu clase. Si ves dos de la misma materia, fíjate en el <b>docente</b> y en el <b>horario</b> en que viste la clase (los días y la hora).
      </p>
      <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
        {lista.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No encontramos clases con esa búsqueda.</p>}
        {lista.map((g) => (
          <button
            key={g.group_id}
            type="button"
            onClick={() => onChange(g.group_id)}
            className={
              'w-full text-left rounded-lg border px-3 py-2 transition-colors ' +
              (g.porIniciar ? 'border-ink-700 bg-ink-900/60 opacity-70 hover:opacity-100 ' : 'border-ink-600 bg-ink-800 hover:border-accent-500 hover:bg-ink-700/70 ')
            }
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-base font-semibold text-slate-50">{g.subject_name}</span>
              {g.porIniciar && <span className="shrink-0 text-xs font-medium text-amber-300">aún no inicia</span>}
            </div>
            <DatosClase g={g} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Confirmación antes de enviar (2026-10-16). */
function ConfirmarEnvio({ grupo, enviando, onConfirmar, onCambiar, onCerrar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={enviando ? undefined : onCerrar}>
      <div className="w-full max-w-md rounded-2xl border border-ink-600 bg-ink-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Antes de enviar, confirma tu clase</p>
        <p className="text-sm text-slate-200">Vas a evaluar a</p>
        <p className="text-lg font-semibold text-slate-50 leading-tight">{grupo.tutor_calendario}</p>
        <p className="text-sm text-slate-200 mt-1">en <b className="text-slate-50">{grupo.subject_name}</b></p>
        <DatosClase g={grupo} sinDocente />
        <p className="text-sm text-slate-300 mt-3">¿Es correcto? Si no es tu docente o tu materia, cámbiala antes de enviar.</p>
        <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onCambiar}
            disabled={enviando}
            className="flex-1 rounded-md border border-ink-600 py-2.5 text-sm font-medium text-slate-200 hover:bg-ink-800 disabled:opacity-50"
          >
            No, cambiar mi clase
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={enviando}
            className="flex-1 rounded-md bg-accent-500 hover:bg-accent-400 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Sí, enviar evaluación'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-slate-300">{etiqueta}</span>
      {ayuda && <span className="block text-[11px] leading-snug text-sky-300/90">{ayuda}</span>}
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
