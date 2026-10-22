-- =============================================================================
--  Cierre de lectura pública de tablas que solo usa el panel staff  (2026-10-22)
--  Proyecto Supabase: csdavuvgqkmvrmntnskz (Calidad Académica)
--
--  El panel ya no lee Supabase desde el navegador: lo hace /api/datos en el
--  servidor (clave secreta, sesión verificada). Estas tablas no las usa
--  ninguna otra app, así que se les quita todo acceso a anon/authenticated.
--  n8n y /api/datos usan la clave secreta (no les afecta RLS ni estos grants).
--
--  NO se tocaron (las leen otras apps desde el navegador con la clave
--  pública): directutor_tutores_base_de_directorio, asap_seguimiento_grupo,
--  grupos_combinados, doc_alertas_cierre. doc_base_de_grupos y
--  doc_meses_activos siguen públicas porque las necesita el formulario del
--  estudiante.
-- =============================================================================

drop policy if exists "Lectura publica estudiantes activos" on public.doc_estudiantes_activos;
drop policy if exists "lectura_publica" on public.doc_historico_enero_julio_2026;
revoke select, insert, update, delete
  on public.doc_estudiantes_activos, public.doc_historico_enero_julio_2026, public.doc_analisis_cualitativo
  from anon, authenticated;
