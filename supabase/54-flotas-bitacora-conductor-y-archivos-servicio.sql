-- =====================================================================
-- FLOTAS — el conductor ve la bitacora de su propia unidad, y los
-- servicios admiten archivos adjuntos (factura, fotos, etc.).
--
-- 1) flota_bitacora solo la podian leer admin/director/gerente. Para
--    mostrarla en "Mi unidad" (el conductor), se agrega que tambien
--    pueda leerla quien tiene esa unidad asignada en flota_perfiles.
--
-- 2) flota_servicios no tenia forma de adjuntar nada (factura del
--    taller, fotos del trabajo). Se agrega una tabla aparte
--    (flota_servicio_archivos) en vez de una sola columna, para poder
--    subir mas de un archivo por servicio.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

drop policy if exists "lectura segun equipo" on flota_bitacora;
create policy "lectura segun equipo" on flota_bitacora
  for select to authenticated
  using (
    es_de_la_empresa() and (
      (flota_mi_rol() in ('admin', 'director', 'gerente')
       and (vehiculo_id is null or vehiculo_id in (select id from flota_vehiculos_visibles())))
      or vehiculo_id in (select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid())
    )
  );

create table if not exists flota_servicio_archivos (
  id            bigint generated always as identity primary key,
  servicio_id   bigint not null references flota_servicios(id) on delete cascade,
  archivo_path  text not null,
  creado_por    uuid references perfiles(id) on delete set null,
  creado_en     timestamptz not null default now()
);

create index if not exists flota_servicio_archivos_servicio on flota_servicio_archivos (servicio_id);

alter table flota_servicio_archivos enable row level security;

drop policy if exists "lectura aprobados" on flota_servicio_archivos;
create policy "lectura aprobados" on flota_servicio_archivos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_servicio_archivos;
create policy "admin escribe" on flota_servicio_archivos
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

commit;
