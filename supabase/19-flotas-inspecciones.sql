-- =====================================================================
-- FLOTAS — inspecciones con fotos (entrega / devolucion de unidad).
--
-- Cada vez que se asigna, reasigna o desasigna un conductor se registra
-- una inspeccion con fotos tipo checklist (puertas delante, puertas
-- detras, espejos, interiores, etc.) para comparar como se entrego vs
-- como se devolvio la unidad. Las fotos viven en el bucket privado
-- 'mantenimiento' (mismas politicas de storage que Mantenimiento).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create table if not exists flota_inspecciones (
  id                bigint generated always as identity primary key,
  vehiculo_id       bigint not null references flota_vehiculos(id) on delete cascade,
  tipo              text not null check (tipo in ('entrega', 'devolucion')),
  conductor_nombre  text,          -- a quien se entrego / de quien se recibio
  km                numeric(10, 1),
  notas             text,
  historial_id      bigint references flota_conductor_historial(id) on delete set null,
  registrado_por    uuid references perfiles(id) on delete set null,
  creado_en         timestamptz not null default now()
);

create table if not exists flota_inspeccion_fotos (
  id             bigint generated always as identity primary key,
  inspeccion_id  bigint not null references flota_inspecciones(id) on delete cascade,
  punto          text not null,    -- 'Puertas delante', 'Puertas detras', 'Espejos', 'Interiores'...
  archivo_path   text not null,    -- ruta en el bucket 'mantenimiento'
  creado_en      timestamptz not null default now()
);

alter table flota_inspecciones      enable row level security;
alter table flota_inspeccion_fotos  enable row level security;

drop policy if exists "lectura aprobados" on flota_inspecciones;
create policy "lectura aprobados" on flota_inspecciones
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_inspecciones;
create policy "admin escribe" on flota_inspecciones
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

drop policy if exists "lectura aprobados" on flota_inspeccion_fotos;
create policy "lectura aprobados" on flota_inspeccion_fotos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_inspeccion_fotos;
create policy "admin escribe" on flota_inspeccion_fotos
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

commit;
