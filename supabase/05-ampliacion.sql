-- =====================================================================
-- AMPLIACIÓN: caja chica, criticidad/duración en órdenes, comprobantes
-- con archivo, foto de activos, y migración de Pendientes → Órdenes.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- Seguro de re-ejecutar salvo la sección de migración de pendientes
-- (usa "if not exists" / revisa antes de correr dos veces).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Caja chica — fondo único de la empresa (no por sucursal)
-- ---------------------------------------------------------------------
create table if not exists caja_chica (
  id              bigint generated always as identity primary key,
  anio            int not null unique,
  monto_asignado  numeric(14,2) not null default 0,
  notas           text
);

alter table caja_chica enable row level security;

drop policy if exists "lectura empresa" on caja_chica;
create policy "lectura empresa" on caja_chica
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "escritura gestion" on caja_chica;
create policy "escritura gestion" on caja_chica
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin','coordinador'))
  with check (es_de_la_empresa() and mi_rol() in ('admin','coordinador'));

insert into caja_chica (anio, monto_asignado)
values (2026, 0)
on conflict (anio) do nothing;

-- ---------------------------------------------------------------------
-- 2. Órdenes: criticidad, categoría y duración del mantenimiento
--    (impacto se unifica con criticidad: un solo campo)
-- ---------------------------------------------------------------------
alter table ordenes add column if not exists criticidad criticidad_activo;
alter table ordenes add column if not exists categoria_id bigint references categorias(id) on delete set null;
alter table ordenes add column if not exists duracion_estimada_horas numeric(6,1);
alter table ordenes add column if not exists duracion_real_horas numeric(6,1);

-- ---------------------------------------------------------------------
-- 3. Gastos: comprobantes como archivo (cotización y factura/recibo)
-- ---------------------------------------------------------------------
alter table gastos add column if not exists comprobante_cotizacion_path text;
alter table gastos add column if not exists comprobante_gasto_path text;

-- Regla de negocio: todo gasto preventivo o correctivo DEBE nacer de una
-- orden de trabajo. Viaticos/insumos/remodelacion/otro siguen libres.
-- NOT VALID = no revisa el historico ya cargado, solo aplica de aqui en
-- adelante (el historico de Excel no tenia ordenes formales).
alter table gastos drop constraint if exists gastos_mantenimiento_requiere_orden;
alter table gastos
  add constraint gastos_mantenimiento_requiere_orden
  check (tipo not in ('preventivo','correctivo') or orden_id is not null)
  not valid;

-- ---------------------------------------------------------------------
-- 4. Activos: foto
-- ---------------------------------------------------------------------
alter table activos add column if not exists foto_path text;

-- ---------------------------------------------------------------------
-- 5. Almacenamiento de archivos (Supabase Storage)
--    Bucket privado: solo gente autenticada del dominio puede leer/escribir.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mantenimiento', 'mantenimiento', false)
on conflict (id) do nothing;

drop policy if exists "mantenimiento lectura" on storage.objects;
create policy "mantenimiento lectura" on storage.objects
  for select to authenticated
  using (bucket_id = 'mantenimiento' and es_de_la_empresa());

drop policy if exists "mantenimiento escritura" on storage.objects;
create policy "mantenimiento escritura" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mantenimiento' and es_de_la_empresa());

drop policy if exists "mantenimiento actualiza" on storage.objects;
create policy "mantenimiento actualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'mantenimiento' and es_de_la_empresa());

drop policy if exists "mantenimiento borra" on storage.objects;
create policy "mantenimiento borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mantenimiento' and es_de_la_empresa()
         and mi_rol() in ('admin','coordinador'));

-- ---------------------------------------------------------------------
-- 6. Migrar "Pendientes" (requerimientos informales) a Órdenes.
--    El módulo Pendientes desaparece; esto se vuelve parte del Plan
--    de Mantenimiento como órdenes correctivas sin programar.
--    No se borra la tabla original — se archiva por si hace falta
--    consultar el dato crudo despues.
-- ---------------------------------------------------------------------
insert into ordenes (sucursal_id, tipo, titulo, descripcion, estatus, costo_estimado)
select
  p.sucursal_id,
  'correctivo'::tipo_mantenimiento,
  p.concepto,
  p.descripcion,
  'programada'::estatus_orden,
  coalesce(p.costo_max, p.costo_min)
from pendientes p
where p.estatus <> 'cerrado'
  and p.sucursal_id is not null
  and not exists (
    -- evita duplicar si este script se corre mas de una vez
    select 1 from ordenes o
    where o.sucursal_id = p.sucursal_id and o.titulo = p.concepto and o.plan_id is null
  );

alter table pendientes rename to pendientes_archivo;

commit;

-- Verifica cuantas ordenes se crearon a partir de pendientes:
select count(*) as ordenes_migradas from ordenes where plan_id is null and activo_id is null;
