-- =====================================================================
-- FLOTAS — datos laborales del conductor asignado (tipo de prestación,
-- puesto, jefe directo, departamento) + historial: cada vez que cambia
-- el conductor de una unidad, se guarda un registro del conductor
-- saliente con sus datos completos.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Nuevos datos del conductor asignado
-- ---------------------------------------------------------------------
alter table flota_vehiculos
  add column if not exists tipo_prestacion text,
  add column if not exists puesto          text,
  add column if not exists jefe_directo    text,
  add column if not exists departamento    text;

-- ---------------------------------------------------------------------
-- 2. Historial de conductores por unidad
-- ---------------------------------------------------------------------
create table if not exists flota_conductor_historial (
  id                  bigint generated always as identity primary key,
  vehiculo_id         bigint not null references flota_vehiculos(id) on delete cascade,
  conductor_nombre    text,
  conductor_telefono  text,
  conductor_correo    text,
  conductor_licencia  text,
  tipo_prestacion     text,
  puesto              text,
  jefe_directo        text,
  departamento        text,
  hasta               timestamptz not null default now(),  -- cuándo dejó de ser el conductor
  creado_en           timestamptz not null default now()
);

alter table flota_conductor_historial enable row level security;

drop policy if exists "lectura aprobados" on flota_conductor_historial;
create policy "lectura aprobados" on flota_conductor_historial
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_conductor_historial;
create policy "admin escribe" on flota_conductor_historial
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- al cambiar el conductor de una unidad, archiva los datos del anterior
create or replace function flota_registrar_cambio_conductor()
returns trigger language plpgsql as $$
begin
  if coalesce(old.conductor_nombre, '') <> '' and
     coalesce(old.conductor_nombre, '') is distinct from coalesce(new.conductor_nombre, '') then
    insert into flota_conductor_historial (
      vehiculo_id, conductor_nombre, conductor_telefono, conductor_correo, conductor_licencia,
      tipo_prestacion, puesto, jefe_directo, departamento
    ) values (
      old.id, old.conductor_nombre, old.conductor_telefono, old.conductor_correo, old.conductor_licencia,
      old.tipo_prestacion, old.puesto, old.jefe_directo, old.departamento
    );
  end if;
  return new;
end;
$$;

drop trigger if exists flota_vehiculos_cambio_conductor on flota_vehiculos;
create trigger flota_vehiculos_cambio_conductor
  before update on flota_vehiculos
  for each row execute function flota_registrar_cambio_conductor();

commit;
