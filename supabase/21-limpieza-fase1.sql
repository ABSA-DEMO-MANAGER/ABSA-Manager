-- =====================================================================
-- LIMPIEZA — fase 1: mismo login que Mantenimiento/Flotas (mismo
-- Supabase), rol propio (admin/usuario/consulta/pendiente), catalogo
-- de insumos, ubicaciones/almacenes, inventario por ubicacion y
-- movimientos (entradas/salidas) para planear la compra.
--
-- Fuera de alcance en esta fase (se agrega despues si se necesita):
--   ordenes de compra formales, costos por ubicacion/mes, carga CSV.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Rol de Limpieza — independiente de Mantenimiento y de Flotas.
-- ---------------------------------------------------------------------
create table if not exists limpieza_perfiles (
  perfil_id  uuid primary key references perfiles(id) on delete cascade,
  rol        text not null default 'pendiente'
             check (rol in ('admin', 'usuario', 'consulta', 'pendiente')),
  creado_en  timestamptz not null default now()
);

create or replace function limpieza_mi_rol()
returns text
language sql stable security definer set search_path = public
as $$ select rol from limpieza_perfiles where perfil_id = auth.uid() $$;

alter table limpieza_perfiles enable row level security;

drop policy if exists "propio o admin lee" on limpieza_perfiles;
create policy "propio o admin lee" on limpieza_perfiles
  for select to authenticated
  using (es_de_la_empresa() and (perfil_id = auth.uid() or limpieza_mi_rol() = 'admin'));

drop policy if exists "alta propia" on limpieza_perfiles;
create policy "alta propia" on limpieza_perfiles
  for insert to authenticated
  with check (es_de_la_empresa() and perfil_id = auth.uid());

drop policy if exists "admin da de alta" on limpieza_perfiles;
create policy "admin da de alta" on limpieza_perfiles
  for insert to authenticated
  with check (es_de_la_empresa() and limpieza_mi_rol() = 'admin');

drop policy if exists "admin edita" on limpieza_perfiles;
create policy "admin edita" on limpieza_perfiles
  for update to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() = 'admin')
  with check (es_de_la_empresa() and limpieza_mi_rol() = 'admin');

create or replace function limpieza_bloquear_autopromocion()
returns trigger language plpgsql as $$
begin
  if new.rol <> old.rol and limpieza_mi_rol() <> 'admin' then
    raise exception 'Solo un administrador de Limpieza puede cambiar el rol.';
  end if;
  return new;
end;
$$;

drop trigger if exists limpieza_perfiles_bloquear_rol on limpieza_perfiles;
create trigger limpieza_perfiles_bloquear_rol
  before update on limpieza_perfiles
  for each row execute function limpieza_bloquear_autopromocion();

create or replace function limpieza_listar_usuarios()
returns table (id uuid, nombre text, rol text, email text, creado_en timestamptz)
language sql security definer set search_path = public, auth
as $$
  select p.id, p.nombre, coalesce(lp.rol, 'pendiente'), u.email, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  left join limpieza_perfiles lp on lp.perfil_id = p.id
  where limpieza_mi_rol() = 'admin'
  order by p.creado_en;
$$;

grant execute on function limpieza_listar_usuarios() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Ubicaciones / almacenes. Puede o no coincidir con una sucursal de
--    Mantenimiento (ej. una bodega central no es una sucursal).
-- ---------------------------------------------------------------------
create table if not exists limpieza_ubicaciones (
  id                     bigint generated always as identity primary key,
  nombre                 text not null,
  tipo                   text not null default 'sucursal'
                         check (tipo in ('sucursal', 'almacen_central', 'otro')),
  sucursal_id            bigint references sucursales(id) on delete set null,
  direccion              text,
  responsable_nombre     text,
  responsable_telefono   text,
  activa                 boolean not null default true,
  creado_en              timestamptz not null default now()
);

alter table limpieza_ubicaciones enable row level security;

drop policy if exists "lectura aprobados" on limpieza_ubicaciones;
create policy "lectura aprobados" on limpieza_ubicaciones
  for select to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() in ('admin', 'usuario', 'consulta'));

drop policy if exists "admin escribe" on limpieza_ubicaciones;
create policy "admin escribe" on limpieza_ubicaciones
  for all to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() = 'admin')
  with check (es_de_la_empresa() and limpieza_mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 3. Catalogo de insumos de limpieza
-- ---------------------------------------------------------------------
create table if not exists limpieza_insumos (
  id                     bigint generated always as identity primary key,
  nombre                 text not null,
  categoria              text,        -- Papel, Quimicos, Bolsas, Equipo, Otro...
  unidad_medida          text not null default 'pieza',
  costo_referencia       numeric(12, 2),
  proveedor_id           bigint references proveedores(id) on delete set null,
  stock_minimo_default   numeric(10, 2) not null default 0,
  activo                 boolean not null default true,
  creado_en              timestamptz not null default now()
);

alter table limpieza_insumos enable row level security;

drop policy if exists "lectura aprobados" on limpieza_insumos;
create policy "lectura aprobados" on limpieza_insumos
  for select to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() in ('admin', 'usuario', 'consulta'));

drop policy if exists "admin escribe" on limpieza_insumos;
create policy "admin escribe" on limpieza_insumos
  for all to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() = 'admin')
  with check (es_de_la_empresa() and limpieza_mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 4. Inventario actual (existencia por ubicacion x insumo).
--    Se actualiza SOLO via los movimientos (ver mas abajo) para que
--    siempre cuadre con el kardex de entradas/salidas.
-- ---------------------------------------------------------------------
create table if not exists limpieza_stock (
  id               bigint generated always as identity primary key,
  ubicacion_id     bigint not null references limpieza_ubicaciones(id) on delete cascade,
  insumo_id        bigint not null references limpieza_insumos(id) on delete cascade,
  cantidad_actual  numeric(10, 2) not null default 0,
  stock_minimo     numeric(10, 2),   -- null = usa el minimo por defecto del insumo
  actualizado_en   timestamptz not null default now(),
  unique (ubicacion_id, insumo_id)
);

alter table limpieza_stock enable row level security;

drop policy if exists "lectura aprobados" on limpieza_stock;
create policy "lectura aprobados" on limpieza_stock
  for select to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() in ('admin', 'usuario', 'consulta'));

drop policy if exists "admin o usuario escribe" on limpieza_stock;
create policy "admin o usuario escribe" on limpieza_stock
  for all to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() in ('admin', 'usuario'))
  with check (es_de_la_empresa() and limpieza_mi_rol() in ('admin', 'usuario'));

-- ---------------------------------------------------------------------
-- 5. Movimientos (kardex): cada entrada o salida de insumo por
--    ubicacion. Es un registro inmutable — para corregir un error se
--    registra un movimiento contrario, no se edita ni se borra.
--    De aqui sale tanto el consumo (salidas) como la planeacion de
--    compra (consumo promedio vs. existencia vs. minimo).
-- ---------------------------------------------------------------------
create table if not exists limpieza_movimientos (
  id               bigint generated always as identity primary key,
  ubicacion_id     bigint not null references limpieza_ubicaciones(id) on delete cascade,
  insumo_id        bigint not null references limpieza_insumos(id) on delete cascade,
  tipo             text not null check (tipo in ('entrada', 'salida')),
  cantidad         numeric(10, 2) not null check (cantidad > 0),
  costo_unitario   numeric(12, 2),   -- opcional; tipicamente se captura en entradas (compras)
  motivo           text,
  fecha            date not null default current_date,
  registrado_por   uuid references perfiles(id) on delete set null,
  creado_en        timestamptz not null default now()
);

create index if not exists limpieza_movimientos_ubicacion_insumo on limpieza_movimientos (ubicacion_id, insumo_id);

alter table limpieza_movimientos enable row level security;

drop policy if exists "lectura aprobados" on limpieza_movimientos;
create policy "lectura aprobados" on limpieza_movimientos
  for select to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() in ('admin', 'usuario', 'consulta'));

drop policy if exists "crear movimiento" on limpieza_movimientos;
create policy "crear movimiento" on limpieza_movimientos
  for insert to authenticated
  with check (es_de_la_empresa() and limpieza_mi_rol() in ('admin', 'usuario')
              and registrado_por = auth.uid());

drop policy if exists "admin borra movimiento" on limpieza_movimientos;
create policy "admin borra movimiento" on limpieza_movimientos
  for delete to authenticated
  using (es_de_la_empresa() and limpieza_mi_rol() = 'admin');

-- cada movimiento actualiza (o crea) la existencia en limpieza_stock
create or replace function limpieza_aplicar_movimiento()
returns trigger language plpgsql as $$
declare
  delta numeric(10, 2) := case when new.tipo = 'entrada' then new.cantidad else -new.cantidad end;
begin
  insert into limpieza_stock (ubicacion_id, insumo_id, cantidad_actual)
  values (new.ubicacion_id, new.insumo_id, delta)
  on conflict (ubicacion_id, insumo_id) do update
    set cantidad_actual = limpieza_stock.cantidad_actual + delta,
        actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists limpieza_movimientos_aplica_stock on limpieza_movimientos;
create trigger limpieza_movimientos_aplica_stock
  after insert on limpieza_movimientos
  for each row execute function limpieza_aplicar_movimiento();

commit;
