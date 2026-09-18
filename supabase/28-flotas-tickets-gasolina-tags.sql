-- =====================================================================
-- FLOTAS — simplificacion:
--  1. Las solicitudes de gasolina admiten un tercer motivo: 'tag'
--     (antes solo 'viaje' o 'extra'). Un tag no necesita kilometraje
--     ni foto de odometro, y se pide un monto en pesos en vez de
--     litros — se relajan esas columnas a opcionales.
--  2. Con esto, "solicitar gasolina" y "solicitar tag" se piden desde
--     el modulo de Tickets (categoria del ticket), en vez de tener un
--     modulo aparte de Gasolina.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

alter table flota_gasolina_solicitudes
  alter column kilometraje drop not null,
  alter column foto_km_path drop not null;

alter table flota_gasolina_solicitudes
  add column if not exists monto_solicitado numeric(10, 2);

alter table flota_gasolina_solicitudes drop constraint if exists flota_gasolina_solicitudes_motivo_check;
alter table flota_gasolina_solicitudes add constraint flota_gasolina_solicitudes_motivo_check
  check (motivo in ('viaje', 'extra', 'tag'));

commit;
