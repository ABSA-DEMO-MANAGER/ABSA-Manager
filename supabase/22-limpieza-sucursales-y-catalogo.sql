-- =====================================================================
-- LIMPIEZA — ajustes:
--  1. Las "ubicaciones" dejan de ser una lista propia de Limpieza y
--     pasan a ser las MISMAS sucursales de Mantenimiento (siempre en
--     sync — si se da de alta o se cierra una sucursal, se refleja
--     solo en Limpieza sin capturar nada aparte).
--  2. Catalogo de insumos: se agregan marca, descripcion, uso y
--     piezas por unidad (ej. "paquete con 12 piezas").
--  3. Movimientos: campo opcional de quien retiro fisicamente el
--     insumo (puede ser distinto de quien lo captura), para dar mas
--     trazabilidad y ayudar a controlar fugas / robo hormiga.
--
-- Nota: esto vacia limpieza_stock y limpieza_movimientos (eran datos
-- de prueba del modulo, recien creado). No afecta ubicaciones,
-- insumos ni ningun otro modulo.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Ubicaciones = sucursales de Mantenimiento
-- ---------------------------------------------------------------------
truncate table limpieza_movimientos, limpieza_stock;

alter table limpieza_stock drop constraint if exists limpieza_stock_ubicacion_id_fkey;
alter table limpieza_movimientos drop constraint if exists limpieza_movimientos_ubicacion_id_fkey;

alter table limpieza_stock rename column ubicacion_id to sucursal_id;
alter table limpieza_movimientos rename column ubicacion_id to sucursal_id;

alter table limpieza_stock
  add constraint limpieza_stock_sucursal_id_fkey
  foreign key (sucursal_id) references sucursales(id) on delete cascade;

alter table limpieza_movimientos
  add constraint limpieza_movimientos_sucursal_id_fkey
  foreign key (sucursal_id) references sucursales(id) on delete cascade;

drop table if exists limpieza_ubicaciones cascade;

-- el trigger de stock usa NEW.ubicacion_id; se actualiza a NEW.sucursal_id
create or replace function limpieza_aplicar_movimiento()
returns trigger language plpgsql as $$
declare
  delta numeric(10, 2) := case when new.tipo = 'entrada' then new.cantidad else -new.cantidad end;
begin
  insert into limpieza_stock (sucursal_id, insumo_id, cantidad_actual)
  values (new.sucursal_id, new.insumo_id, delta)
  on conflict (sucursal_id, insumo_id) do update
    set cantidad_actual = limpieza_stock.cantidad_actual + delta,
        actualizado_en = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Catalogo de insumos: marca, descripcion, uso, piezas por unidad
-- ---------------------------------------------------------------------
alter table limpieza_insumos
  add column if not exists marca              text,
  add column if not exists descripcion        text,
  add column if not exists uso                text,
  add column if not exists piezas_por_unidad  numeric(10, 2);

-- ---------------------------------------------------------------------
-- 3. Movimientos: quien retiro fisicamente el insumo (trazabilidad)
-- ---------------------------------------------------------------------
alter table limpieza_movimientos
  add column if not exists retirado_por_nombre text;

commit;
