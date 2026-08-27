-- =====================================================================
-- Proveedores: alta libre (admin o usuario), pero EDITAR uno existente
-- queda sujeto a aprobacion del admin — mismo patron que activos_cambios.
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create table if not exists proveedores_cambios (
  id               bigint generated always as identity primary key,
  proveedor_id     bigint not null references proveedores(id) on delete cascade,
  datos            jsonb not null,
  estatus          text not null default 'pendiente' check (estatus in ('pendiente', 'aprobado', 'rechazado')),
  solicitado_por   uuid references perfiles(id) on delete set null,
  solicitado_en    timestamptz not null default now(),
  resuelto_por     uuid references perfiles(id) on delete set null,
  resuelto_en      timestamptz,
  nota_resolucion  text
);

alter table proveedores_cambios enable row level security;

drop policy if exists "lectura empresa" on proveedores_cambios;
create policy "lectura empresa" on proveedores_cambios
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "usuario propone" on proveedores_cambios;
create policy "usuario propone" on proveedores_cambios
  for insert to authenticated
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario') and solicitado_por = auth.uid());

drop policy if exists "admin resuelve" on proveedores_cambios;
create policy "admin resuelve" on proveedores_cambios
  for update to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

-- Alta libre (admin o usuario) pero editar/borrar solo admin directo.
drop policy if exists "escritura gestion" on proveedores;

create policy "alta libre proveedor" on proveedores
  for insert to authenticated
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

create policy "admin edita proveedor" on proveedores
  for update to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

create policy "admin borra proveedor" on proveedores
  for delete to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin');

commit;
