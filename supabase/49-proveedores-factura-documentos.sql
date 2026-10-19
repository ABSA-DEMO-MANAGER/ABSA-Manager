-- =====================================================================
-- PROVEEDORES — ¿factura? + repositorio de documentos (CFDI, contratos,
-- etc.). El historial de cotizaciones y servicios NO necesita tabla
-- nueva: ya existe cotizaciones.proveedor_id, ordenes.proveedor_id y
-- gastos.proveedor_id -- la pantalla de detalle del proveedor
-- (ProveedorDetalle.jsx) simplemente los consulta filtrando por ese
-- proveedor.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

alter table proveedores add column if not exists factura boolean;

create table if not exists proveedores_documentos (
  id            bigint generated always as identity primary key,
  proveedor_id  bigint not null references proveedores(id) on delete cascade,
  tipo          text not null default 'otro' check (tipo in ('cfdi', 'contrato', 'identificacion', 'otro')),
  descripcion   text,
  archivo_path  text not null,
  creado_por    uuid references perfiles(id) on delete set null,
  creado_en     timestamptz not null default now()
);

create index if not exists proveedores_documentos_proveedor on proveedores_documentos (proveedor_id);

alter table proveedores_documentos enable row level security;

drop policy if exists "lectura empresa" on proveedores_documentos;
create policy "lectura empresa" on proveedores_documentos
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "gestionar documento" on proveedores_documentos;
create policy "gestionar documento" on proveedores_documentos
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'))
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

commit;
