-- =====================================================================
-- FLOTAS — kilometraje desde tickets/gasolina, archivo opcional al
-- cerrar, e historial de tickets visible por unidad.
--
-- - flota_tickets gana "kilometraje" (opcional, cualquier categoria,
--   no solo gasolina) y "archivo_cierre_path" + quien/cuando lo cerro.
-- - flota_gasolina_solicitudes gana "archivo_cierre_path" (aparte de
--   la foto que ya trae el chofer al pedirla).
-- - El cambio de kilometraje en si ya queda registrado solo: la
--   bitacora de flota_vehiculos (flota_registrar_bitacora, migracion
--   23) guarda un before/after de TODAS las columnas en cada UPDATE,
--   kilometraje incluido -- no hace falta una tabla nueva para eso.
-- - Quien tiene una unidad asignada ahora puede ver el historial
--   COMPLETO de tickets/solicitudes de esa unidad (antes solo veia
--   los que el mismo habia levantado).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

alter table flota_tickets
  add column if not exists kilometraje numeric,
  add column if not exists archivo_cierre_path text,
  add column if not exists resuelto_por uuid references perfiles(id) on delete set null,
  add column if not exists resuelto_en timestamptz;

alter table flota_gasolina_solicitudes
  add column if not exists archivo_cierre_path text;

drop policy if exists "lectura unidad propia" on flota_tickets;
create policy "lectura unidad propia" on flota_tickets
  for select to authenticated
  using (es_de_la_empresa() and vehiculo_id = (select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid()));

drop policy if exists "lectura unidad propia" on flota_gasolina_solicitudes;
create policy "lectura unidad propia" on flota_gasolina_solicitudes
  for select to authenticated
  using (es_de_la_empresa() and vehiculo_id = (select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid()));

commit;
