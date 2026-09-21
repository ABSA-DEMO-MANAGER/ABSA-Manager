-- =====================================================================
-- FLOTAS — completa el catalogo de la unidad para la carga masiva real
-- (inventario de Grupo ABSA) y agrega las ciudades que faltaban.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

alter table flota_vehiculos
  add column if not exists area           text,
  add column if not exists origen_placa   text,
  add column if not exists version        text,
  add column if not exists costo_poliza   numeric(12, 2);

insert into flota_ciudades (nombre, activa) values
  ('Ciudad de México', true),
  ('Nogales', true),
  ('Tijuana', true)
on conflict (nombre) do nothing;

commit;
