-- =====================================================================
-- SUCURSALES — responsable local, contacto y horario de cada sede
-- (punto 2 de la recomendacion para el Plan de Trabajo de 90 dias).
--
-- Es informacion de directorio (quien atiende en esa sede, telefono,
-- horario de operacion) -- no es un usuario del portal, por eso son
-- campos de texto libre y no una referencia a perfiles.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

alter table sucursales
  add column if not exists responsable_nombre text,
  add column if not exists responsable_telefono text,
  add column if not exists responsable_email text,
  add column if not exists horario text;

commit;
