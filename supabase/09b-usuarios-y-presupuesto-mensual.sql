-- =====================================================================
-- PASO 2 de 2. Correr DESPUES de 09a-nuevo-rol.sql.
--
-- Que hace:
--  1. Migra perfiles con rol coordinador/tecnico -> usuario
--  2. Bloquea que cualquiera se autopromueva de rol (solo admin cambia roles)
--  3. Convierte presupuestos de anual a mensual (reparte el monto actual
--     entre 12 meses iguales)
--  4. Crea activos_cambios: activos ahora requieren aprobacion del admin
--  5. Ajusta permisos: sucursales, presupuestos y activos quedan
--     restringidos a admin; el resto (ordenes, gastos, proveedores,
--     categorias, planes) los puede gestionar admin o usuario
--  6. Elimina las vistas v_* que nunca se usaron desde el portal
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Migrar roles existentes
-- ---------------------------------------------------------------------
update perfiles set rol = 'usuario' where rol in ('coordinador', 'tecnico');

-- ---------------------------------------------------------------------
-- 2. Nadie puede cambiar su propio rol salvo un administrador
-- ---------------------------------------------------------------------
create or replace function bloquear_autopromocion()
returns trigger language plpgsql as $$
begin
  if new.rol <> old.rol and mi_rol() <> 'admin' then
    raise exception 'Solo un administrador puede cambiar el rol de un usuario.';
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_bloquear_rol on perfiles;
create trigger perfiles_bloquear_rol
  before update on perfiles
  for each row execute function bloquear_autopromocion();

-- ---------------------------------------------------------------------
-- 3. Presupuestos: de anual a mensual
-- ---------------------------------------------------------------------
alter table presupuestos add column if not exists mes int check (mes between 1 and 12);

-- Quitar la restriccion vieja ANTES de insertar: si no, las 12 filas
-- mensuales que comparten (sucursal_id, anio) chocan entre si porque
-- esa restriccion todavia no sabe que ahora existe "mes".
alter table presupuestos drop constraint if exists presupuestos_sucursal_id_anio_key;

insert into presupuestos (sucursal_id, anio, mes, monto_solicitado, monto_aprobado, notas)
select
  p.sucursal_id, p.anio, gs.mes,
  case when p.monto_solicitado is null then null else round(p.monto_solicitado / 12.0, 2) end,
  case when p.monto_aprobado   is null then null else round(p.monto_aprobado   / 12.0, 2) end,
  p.notas
from presupuestos p
cross join generate_series(1, 12) as gs(mes)
where p.mes is null;

delete from presupuestos where mes is null;

alter table presupuestos alter column mes set not null;
alter table presupuestos add constraint presupuestos_sucursal_anio_mes_key unique (sucursal_id, anio, mes);

-- ---------------------------------------------------------------------
-- 4. Activos: alta y modificacion quedan sujetas a aprobacion
-- ---------------------------------------------------------------------
create table if not exists activos_cambios (
  id               bigint generated always as identity primary key,
  activo_id        bigint references activos(id) on delete cascade,
  tipo             text not null check (tipo in ('alta', 'modificacion')),
  datos            jsonb not null,
  estatus          text not null default 'pendiente' check (estatus in ('pendiente', 'aprobado', 'rechazado')),
  solicitado_por   uuid references perfiles(id) on delete set null,
  solicitado_en    timestamptz not null default now(),
  resuelto_por     uuid references perfiles(id) on delete set null,
  resuelto_en      timestamptz,
  nota_resolucion  text
);

alter table activos_cambios enable row level security;

drop policy if exists "lectura empresa" on activos_cambios;
create policy "lectura empresa" on activos_cambios
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "usuario propone" on activos_cambios;
create policy "usuario propone" on activos_cambios
  for insert to authenticated
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario') and solicitado_por = auth.uid());

drop policy if exists "admin resuelve" on activos_cambios;
create policy "admin resuelve" on activos_cambios
  for update to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 5. Permisos: admin-only para dinero y sucursales; admin+usuario
--    para operacion (ordenes, gastos, catalogos)
-- ---------------------------------------------------------------------

-- sucursales: crear/cerrar solo admin
drop policy if exists "escritura gestion" on sucursales;
create policy "escritura gestion" on sucursales
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

-- presupuestos: solo admin cambia montos
drop policy if exists "escritura gestion" on presupuestos;
create policy "escritura gestion" on presupuestos
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

-- caja_chica: solo admin
drop policy if exists "escritura gestion" on caja_chica;
create policy "escritura gestion" on caja_chica
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

-- activos: alta/edicion directa solo admin (usuario pasa por activos_cambios)
drop policy if exists "escritura gestion" on activos;
create policy "escritura gestion" on activos
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

-- operacion diaria: admin o usuario
do $$
declare t text;
begin
  foreach t in array array['categorias','proveedores','planes','plan_sucursal','ordenes','gastos']
  loop
    execute format('drop policy if exists "escritura gestion" on %I', t);
    execute format(
      'create policy "escritura gestion" on %I for all to authenticated
         using (es_de_la_empresa() and mi_rol() in (''admin'',''usuario''))
         with check (es_de_la_empresa() and mi_rol() in (''admin'',''usuario''))', t);
  end loop;
end $$;

-- el rol tecnico desaparece; su policy especial ya no aplica
drop policy if exists "tecnico cierra ordenes" on ordenes;

-- ---------------------------------------------------------------------
-- 6. Vistas nunca usadas por el portal (quedaron mal con el mes)
-- ---------------------------------------------------------------------
drop view if exists v_top_activos_costo;
drop view if exists v_cumplimiento_plan;
drop view if exists v_gasto_mensual;
drop view if exists v_preventivo_correctivo;
drop view if exists v_presupuesto_vs_real;

commit;

-- Verifica que todo quedo bien:
select 'perfiles' as tabla, rol, count(*) from perfiles group by rol
union all
select 'presupuestos filas totales', null, count(*) from presupuestos;
