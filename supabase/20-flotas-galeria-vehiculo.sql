-- =====================================================================
-- FLOTAS — galeria de estado del vehiculo (reemplaza inspecciones).
--
-- Cambio de enfoque: en vez de guardar el historial de TODAS las
-- inspecciones, cada unidad tiene UNA galeria con su estado actual
-- (fotos tipo checklist). Al reasignar/desasignar se toman fotos
-- nuevas, se comparan contra la galeria actual y, al aceptar, las
-- fotos anteriores se borran y las nuevas quedan como galeria.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- Ya no se usa el historial de inspecciones con fotos
drop table if exists flota_inspeccion_fotos;
drop table if exists flota_inspecciones;

create table if not exists flota_vehiculo_fotos (
  id            bigint generated always as identity primary key,
  vehiculo_id   bigint not null references flota_vehiculos(id) on delete cascade,
  punto         text not null,     -- 'Puertas delante', 'Puertas detras', 'Espejos', 'Interiores', 'Otras'
  archivo_path  text not null,     -- ruta en el bucket 'mantenimiento'
  creado_en     timestamptz not null default now()
);

create index if not exists flota_vehiculo_fotos_vehiculo on flota_vehiculo_fotos (vehiculo_id);

alter table flota_vehiculo_fotos enable row level security;

drop policy if exists "lectura aprobados" on flota_vehiculo_fotos;
create policy "lectura aprobados" on flota_vehiculo_fotos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_vehiculo_fotos;
create policy "admin escribe" on flota_vehiculo_fotos
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

commit;
