-- =====================================================================
-- PORTAL DE MANTENIMIENTO — Esquema base
-- Ejecutar en: Supabase > SQL Editor > New query > Run
--
-- Este script SE PUEDE VOLVER A CORRER: empieza borrando lo que exista.
-- Si ya cargaste datos, vuelve a correr 02-datos.sql despues.
--
-- Acceso restringido al dominio @grupoabsa.com (ver funcion es_de_la_empresa).
-- =====================================================================

-- ---------- Limpieza (permite re-ejecutar sin errores) ----------
drop view  if exists v_top_activos_costo    cascade;
drop view  if exists v_cumplimiento_plan    cascade;
drop view  if exists v_gasto_mensual        cascade;
drop view  if exists v_preventivo_correctivo cascade;
drop view  if exists v_presupuesto_vs_real  cascade;

drop table if exists pendientes    cascade;
drop table if exists gastos        cascade;
drop table if exists ordenes       cascade;
drop table if exists plan_sucursal cascade;
drop table if exists planes        cascade;
drop table if exists activos       cascade;
drop table if exists proveedores   cascade;
drop table if exists categorias    cascade;
drop table if exists presupuestos  cascade;
drop table if exists perfiles      cascade;
drop table if exists sucursales    cascade;

drop function if exists mi_rol()           cascade;
drop function if exists es_de_la_empresa() cascade;

drop type if exists rol_usuario        cascade;
drop type if exists criticidad_activo  cascade;
drop type if exists estatus_pago       cascade;
drop type if exists unidad_pago        cascade;
drop type if exists estatus_orden      cascade;
drop type if exists frecuencia_plan    cascade;
drop type if exists tipo_mantenimiento cascade;

-- ---------- Tipos ----------
create type tipo_mantenimiento as enum
  ('preventivo','correctivo','remodelacion','insumo','viaticos','otro');

create type frecuencia_plan as enum
  ('mensual','bimestral','trimestral','cuatrimestral','semestral','anual','por_definir');

create type estatus_orden as enum
  ('programada','en_proceso','realizada','pospuesta','cancelada');

create type unidad_pago as enum ('compania','caja_chica','empleado');

create type estatus_pago as enum ('borrador','a_enviar','aprobado','pagado');

create type criticidad_activo as enum ('A','B','C');

create type rol_usuario as enum ('admin','coordinador','tecnico','consulta');

-- ---------- Sucursales ----------
create table sucursales (
  id            bigint generated always as identity primary key,
  codigo        text not null unique,
  nombre        text not null,
  ciudad        text,
  centro_costo  text,
  activa        boolean not null default true,
  alias         text[] not null default '{}',
  notas         text,
  creado_en     timestamptz not null default now()
);

-- ---------- Perfiles (enlazado con Supabase Auth) ----------
create table perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  rol          rol_usuario not null default 'consulta',
  sucursal_id  bigint references sucursales(id) on delete set null,
  creado_en    timestamptz not null default now()
);

-- ---------- Presupuesto anual por sucursal ----------
create table presupuestos (
  id                bigint generated always as identity primary key,
  sucursal_id       bigint not null references sucursales(id) on delete cascade,
  anio              int not null,
  monto_solicitado  numeric(14,2),
  monto_aprobado    numeric(14,2),
  notas             text,
  unique (sucursal_id, anio)
);

-- ---------- Categorias ----------
create table categorias (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  orden   int  not null default 0
);

-- ---------- Proveedores ----------
create table proveedores (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  servicio   text,
  es_fijo    boolean not null default false,
  contacto   text,
  telefono   text,
  notas      text,
  creado_en  timestamptz not null default now()
);

-- ---------- Activos ----------
create table activos (
  id                bigint generated always as identity primary key,
  sucursal_id       bigint not null references sucursales(id) on delete restrict,
  categoria_id      bigint references categorias(id) on delete set null,
  codigo            text,
  nombre            text not null,
  ubicacion         text,
  tipo              text,
  marca             text,
  modelo            text,
  serie             text,
  capacidad         text,
  criticidad        criticidad_activo not null default 'B',
  fecha_instalacion date,
  ultimo_servicio   date,
  activo            boolean not null default true,
  atributos         jsonb not null default '{}',
  notas             text,
  creado_en         timestamptz not null default now()
);
create index on activos (sucursal_id);
create index on activos (categoria_id);

-- ---------- Planes (tareas tipo) ----------
create table planes (
  id               bigint generated always as identity primary key,
  categoria_id     bigint references categorias(id) on delete set null,
  nombre           text not null,
  descripcion      text,
  frecuencia       frecuencia_plan not null default 'anual',
  servicio         text,
  costo_estimado   numeric(12,2),
  requiere_formato boolean not null default false,
  activo           boolean not null default true
);

create table plan_sucursal (
  id           bigint generated always as identity primary key,
  plan_id      bigint not null references planes(id) on delete cascade,
  sucursal_id  bigint not null references sucursales(id) on delete cascade,
  cantidad     int,
  unique (plan_id, sucursal_id)
);

-- ---------- Ordenes de trabajo ----------
create table ordenes (
  id               bigint generated always as identity primary key,
  folio            text unique,
  sucursal_id      bigint not null references sucursales(id) on delete restrict,
  activo_id        bigint references activos(id) on delete set null,
  plan_id          bigint references planes(id) on delete set null,
  proveedor_id     bigint references proveedores(id) on delete set null,
  tipo             tipo_mantenimiento not null default 'preventivo',
  titulo           text not null,
  descripcion      text,
  prioridad        text,
  fecha_programada date,
  fecha_realizada  date,
  estatus          estatus_orden not null default 'programada',
  costo_estimado   numeric(12,2),
  notas            text,
  creado_por       uuid references perfiles(id) on delete set null,
  creado_en        timestamptz not null default now()
);
create index on ordenes (sucursal_id);
create index on ordenes (fecha_programada);
create index on ordenes (estatus);

-- ---------- Gastos ----------
create table gastos (
  id                bigint generated always as identity primary key,
  fecha             date not null,
  sucursal_id       bigint not null references sucursales(id) on delete restrict,
  orden_id          bigint references ordenes(id) on delete set null,
  proveedor_id      bigint references proveedores(id) on delete set null,
  concepto          text not null,
  tipo              tipo_mantenimiento not null,
  unidad_pago       unidad_pago not null default 'compania',
  estatus_pago      estatus_pago not null default 'borrador',
  cotizaciones      int not null default 0,
  monto             numeric(12,2) not null,
  factura           text,
  requiere_revision boolean not null default false,
  nota_revision     text,
  creado_por        uuid references perfiles(id) on delete set null,
  creado_en         timestamptz not null default now()
);
create index on gastos (sucursal_id);
create index on gastos (fecha);
create index on gastos (tipo);

-- ---------- Pendientes ----------
create table pendientes (
  id           bigint generated always as identity primary key,
  sucursal_id  bigint references sucursales(id) on delete set null,
  concepto     text not null,
  descripcion  text,
  costo_min    numeric(12,2),
  costo_max    numeric(12,2),
  prioridad    text,
  estatus      text not null default 'abierto',
  creado_en    timestamptz not null default now()
);

-- =====================================================================
-- VISTAS  (security_invoker: respetan el RLS de quien consulta)
-- =====================================================================
create view v_presupuesto_vs_real with (security_invoker = on) as
select
  s.id as sucursal_id, s.codigo, s.nombre, s.activa, p.anio,
  coalesce(p.monto_aprobado, 0) as presupuesto,
  coalesce(sum(g.monto) filter (where g.monto > 0), 0) as ejercido,
  coalesce(p.monto_aprobado, 0)
    - coalesce(sum(g.monto) filter (where g.monto > 0), 0) as disponible
from sucursales s
left join presupuestos p on p.sucursal_id = s.id
left join gastos g on g.sucursal_id = s.id
                  and extract(year from g.fecha) = p.anio
group by s.id, s.codigo, s.nombre, s.activa, p.anio, p.monto_aprobado;

create view v_preventivo_correctivo with (security_invoker = on) as
select date_trunc('month', g.fecha)::date as mes, g.tipo,
       count(*) as movimientos, sum(g.monto) as monto
from gastos g group by 1, 2;

create view v_gasto_mensual with (security_invoker = on) as
select date_trunc('month', g.fecha)::date as mes, s.codigo, s.nombre as sucursal,
       count(*) as movimientos, sum(g.monto) as monto
from gastos g join sucursales s on s.id = g.sucursal_id
group by 1, 2, 3;

create view v_cumplimiento_plan with (security_invoker = on) as
select s.id as sucursal_id, s.codigo, s.nombre as sucursal,
  count(*) filter (where o.estatus = 'realizada')                  as realizadas,
  count(*) filter (where o.estatus in ('programada','en_proceso')) as pendientes,
  count(*) filter (where o.estatus = 'pospuesta')                  as pospuestas,
  count(*) as total,
  round(100.0 * count(*) filter (where o.estatus = 'realizada')
        / nullif(count(*), 0), 1) as pct_cumplimiento
from sucursales s
left join ordenes o on o.sucursal_id = s.id and o.tipo = 'preventivo'
group by s.id, s.codigo, s.nombre;

create view v_top_activos_costo with (security_invoker = on) as
select a.id, a.nombre, a.codigo, s.codigo as sucursal,
       count(distinct o.id) as ordenes,
       coalesce(sum(g.monto), 0) as gasto_acumulado
from activos a
join sucursales s on s.id = a.sucursal_id
left join ordenes o on o.activo_id = a.id
left join gastos  g on g.orden_id = o.id
group by a.id, a.nombre, a.codigo, s.codigo;

-- =====================================================================
-- SEGURIDAD
-- =====================================================================

-- Solo correos @grupoabsa.com. Cambia el dominio aqui si algun dia hace falta.
create or replace function es_de_la_empresa()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@grupoabsa.com'
$$;

create or replace function mi_rol()
returns rol_usuario
language sql stable security definer set search_path = public
as $$ select rol from perfiles where id = auth.uid() $$;

alter table perfiles      enable row level security;
alter table sucursales    enable row level security;
alter table presupuestos  enable row level security;
alter table categorias    enable row level security;
alter table proveedores   enable row level security;
alter table activos       enable row level security;
alter table planes        enable row level security;
alter table plan_sucursal enable row level security;
alter table ordenes       enable row level security;
alter table gastos        enable row level security;
alter table pendientes    enable row level security;

-- Perfiles: cada quien crea y edita el suyo; todos los de la empresa se ven entre si
create policy "perfiles lectura" on perfiles
  for select to authenticated using (es_de_la_empresa());
create policy "perfiles alta propia" on perfiles
  for insert to authenticated with check (id = auth.uid() and es_de_la_empresa());
create policy "perfiles edicion propia" on perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Lectura y escritura sobre las tablas de negocio
do $$
declare t text;
begin
  foreach t in array array['sucursales','presupuestos','categorias','proveedores',
                           'activos','planes','plan_sucursal','ordenes','gastos','pendientes']
  loop
    execute format(
      'create policy "lectura empresa" on %I for select to authenticated
         using (es_de_la_empresa())', t);

    execute format(
      'create policy "escritura gestion" on %I for all to authenticated
         using (es_de_la_empresa() and mi_rol() in (''admin'',''coordinador''))
         with check (es_de_la_empresa() and mi_rol() in (''admin'',''coordinador''))', t);
  end loop;
end $$;

-- El tecnico puede cerrar ordenes desde el celular
create policy "tecnico cierra ordenes" on ordenes
  for update to authenticated
  using (es_de_la_empresa() and mi_rol() = 'tecnico')
  with check (es_de_la_empresa() and mi_rol() = 'tecnico');

-- ---------------------------------------------------------------------
-- Listo. Ahora corre 02-datos.sql
-- ---------------------------------------------------------------------
