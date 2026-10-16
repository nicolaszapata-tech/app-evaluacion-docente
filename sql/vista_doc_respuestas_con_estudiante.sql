-- =============================================================================
--  Vista: doc_respuestas_con_estudiante            (2026-10-15)
--  Proyecto Supabase: csdavuvgqkmvrmntnskz (Calidad Académica)
--
--  Para qué: buscar la respuesta de un estudiante sin tener que cruzar a mano
--  doc_estudiantes (cédula, correo) con doc_respuestas_consolidada (respuestas).
--  Cada fila = UNA respuesta, con la cédula y el correo del estudiante al lado
--  y el grupo al que quedó amarrada (si calzó con alguno).
--
--  Cómo usarla: Table Editor -> doc_respuestas_con_estudiante -> Filter ->
--  cedula = 1050607291   (o correo = s.espinoza1@lanuevaamerica.edu.co)
--
--  Seguridad (trae datos personales):
--   - security_invoker = true: la vista respeta los permisos/RLS de las tablas
--     de base (anon no tiene SELECT sobre ellas, así que tampoco ve la vista).
--   - además se le quita todo permiso a anon y authenticated, para que NUNCA
--     quede expuesta por la API pública. Solo la ve el dueño (Table Editor /
--     SQL Editor) y el service role.
-- =============================================================================

create or replace view public.doc_respuestas_con_estudiante
with (security_invoker = true) as
select
  r.creado_en                     as fecha_respuesta,
  e.cedula,
  e.correo,
  r.categoria_programa,
  r.mes_calificacion,
  r.materia,
  r.docente                        as docente_elegido,
  g.id_grupo_mapeo,
  g.tutor_calendario               as tutor_del_grupo,
  (r.group_id is not null)         as calza_con_un_grupo,   -- false = eligió un docente que no dicta esa materia ("errada")
  r.plataforma_acceso_recursos,
  r.plataforma_disponibilidad,
  r.plataforma_comentarios,
  r.docente_comunicacion,
  r.docente_creatividad,
  r.docente_preparacion,
  r.docente_estrategias_pedagogicas,
  r.docente_participacion,
  r.docente_dominio,
  r.docente_comentarios,
  r.contenidos_ruta_aprendizaje,
  r.contenidos_utilidad,
  r.contenidos_informacion_clara,
  r.contenidos_material,
  r.contenidos_estrategias_evaluacion,
  r.contenidos_comentarios,
  r.nps_recomendaria,
  r.comentario_general,
  r.group_id,
  r.id                             as respuesta_id,
  r.estudiante_id
from public.doc_respuestas_consolidada r
left join public.doc_estudiantes e on e.id = r.estudiante_id
left join lateral (
  select b.id_grupo_mapeo, b.tutor_calendario
  from public.doc_base_de_grupos b
  where b.group_id = r.group_id
  limit 1
) g on true;

revoke all on public.doc_respuestas_con_estudiante from anon, authenticated;

comment on view public.doc_respuestas_con_estudiante is
  'Una fila por respuesta de la encuesta docente con cédula y correo del estudiante (doc_estudiantes) y el grupo al que quedó amarrada. SOLO lectura del dueño: sin permisos para anon/authenticated (trae datos personales). Creada 2026-10-15 para poder buscar la respuesta de un estudiante por cédula o correo desde el Table Editor.';

-- -----------------------------------------------------------------------------
--  Consultas de ejemplo (SQL Editor):
--
--  Todas las respuestas de un estudiante:
--    select * from doc_respuestas_con_estudiante where cedula = '1050607291' order by fecha_respuesta;
--
--  Por correo:
--    select * from doc_respuestas_con_estudiante where correo ilike 's.espinoza1@%';
--
--  Respuestas "erradas" (docente que no dicta esa materia) de un mes:
--    select fecha_respuesta, cedula, correo, materia, docente_elegido
--    from doc_respuestas_con_estudiante
--    where mes_calificacion = 'Septiembre' and not calza_con_un_grupo
--    order by materia, fecha_respuesta;
--
--  Estudiantes que respondieron más de una vez la misma materia:
--    select cedula, correo, materia, mes_calificacion, count(*)
--    from doc_respuestas_con_estudiante
--    group by 1, 2, 3, 4 having count(*) > 1 order by 5 desc;
-- -----------------------------------------------------------------------------
