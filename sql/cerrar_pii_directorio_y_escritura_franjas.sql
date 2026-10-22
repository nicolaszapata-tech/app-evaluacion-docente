-- =============================================================================
--  Datos personales del directorio + escritura de franjas  (2026-10-22)
--  Proyecto Supabase: csdavuvgqkmvrmntnskz (compartido por varias apps)
--
--  La clave pública (anon) va dentro del formulario que reciben los
--  estudiantes, así que todo lo que anon puede leer lo puede leer cualquiera.
--
--  1) directutor_tutores_base_de_directorio: anon/authenticated ya NO ven
--     `identificacion` (cédula) ni `correo_personal`. Siguen viendo el resto
--     (docente, celular, correo institucional, materias...) porque lo usan
--     App Tutores y Nivelaciones. Quien necesita cédula/correo personal
--     (App Asistencia y Aprobación) los lee por su /api/directorio con
--     sesión verificada y clave de servicio. Las funciones SECURITY DEFINER
--     (Centro Docente) y las vistas no se afectan.
--     OJO: con permisos por columna, `select=*` con anon falla -- hay que
--     pedir columnas explícitas.
--  2) at_franja_sesion: anon/authenticated solo pueden LEER (antes la
--     policy era ALL: cualquiera podía modificar o borrar horarios).
--
--  Si se agrega una columna nueva al directorio que deba ser pública, hay
--  que darle grant select explícito a anon/authenticated.
-- =============================================================================

begin;
revoke all on public.directutor_tutores_base_de_directorio from anon, authenticated;
grant select (id, row_number, id_docente, nombres, apellidos, nombres_completos, linea, docente, celular,
              correo_institucional, carpeta_drive, docente_activo, carpeta_grabaciones, informe_de_reuniones,
              materia_1, materia_2, materia_3, materia_4, materia_5, materia_6, materia_7, materia_8, materia_9,
              materia_10, materia_11, materia_12, materia_13, materia_14, materia_15, materia_16, materia_17,
              materia_18, materia_19, materia_20, materia_21, materia_22, materia_23, materia_24, materia_25,
              actualizado_en)
  on public.directutor_tutores_base_de_directorio to anon, authenticated;

drop policy if exists at_franja_sesion_all on public.at_franja_sesion;
create policy at_franja_sesion_lectura on public.at_franja_sesion for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.at_franja_sesion from anon, authenticated;
commit;
