-- =====================================================================
-- FLOTAS — ciudades propias del modulo.
--
-- Flotas ya no usa la lista de "sucursales" de Mantenimiento para
-- ubicar una unidad: tiene vendedores/gente en ciudades donde no hay
-- oficina. Se crea una lista de ciudades propia de Flotas, editable
-- por el admin de Flotas, sin tocar Mantenimiento.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create table if not exists flota_ciudades (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);

alter table flota_ciudades enable row level security;

drop policy if exists "lectura aprobados" on flota_ciudades;
create policy "lectura aprobados" on flota_ciudades
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_ciudades;
create policy "admin escribe" on flota_ciudades
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- Semilla: las ciudades que ya se usaban (venian de sucursales) + las nuevas
insert into flota_ciudades (nombre, activa) values
  ('Guadalajara', true),
  ('Hermosillo', true),
  ('Chihuahua', true),
  ('Ciudad Juárez', true),
  ('León', true),
  ('Aguascalientes', true),
  ('Monterrey', false),
  ('Culiacán', true),
  ('Colima', true),
  ('Ciudad Obregón', true),
  ('Cananea', true),
  ('Nacozari', true),
  ('Zacatecas', true)
on conflict (nombre) do nothing;

-- Nueva referencia de ubicacion en las unidades
alter table flota_vehiculos
  add column if not exists ciudad_id bigint references flota_ciudades(id) on delete set null;

-- Migrar lo que ya estaba: sucursal_id -> ciudad_id por nombre de ciudad
update flota_vehiculos v
set ciudad_id = c.id
from sucursales s
join flota_ciudades c on c.nombre = s.ciudad
where v.ciudad_id is null and v.sucursal_id = s.id;

-- (se deja la columna sucursal_id como esta; Flotas ya no la usa)

commit;
