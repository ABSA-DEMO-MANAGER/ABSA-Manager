-- =====================================================================
-- MANTENIMIENTO — Solicitudes (paso 2 del rediseno del modulo).
--
-- Etapa de "intake" separada de la orden de trabajo: el responsable de
-- sucursal reporta una necesidad; Mantenimiento la revisa, confirma
-- categoria/prioridad y, si aplica, la convierte en una orden (tabla
-- `ordenes`, que no cambia de estructura en este paso). No existia
-- ningun concepto de "solicitud" separado de "orden" antes de esto.
--
-- Folio automatico "SOL-000001" igual que el patron ya usado en
-- Flotas (flota_folio_gasolina). Fotos de evidencia en tabla aparte
-- (solicitudes_fotos), subidas forzosamente con camara desde la app
-- (misma politica ya establecida para todo el portal).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 39-mantenimiento-bitacora.sql)
-- =====================================================================

begin;

create table if not exists solicitudes (
  id                   bigint generated always as identity primary key,
  folio                text unique,
  sucursal_id          bigint not null references sucursales(id) on delete restrict,
  categoria_id         bigint references categorias(id) on delete set null,
  activo_id            bigint references activos(id) on delete set null,
  ubicacion            text,
  descripcion          text not null,
  impacto              text,
  personas_afectadas   text,
  riesgo               boolean not null default false,
  prioridad_sugerida    text check (prioridad_sugerida in ('P1', 'P2', 'P3', 'P4')),
  prioridad_confirmada  text check (prioridad_confirmada in ('P1', 'P2', 'P3', 'P4')),
  estatus              text not null default 'nueva'
                        check (estatus in ('nueva', 'en_revision', 'informacion_requerida',
                                           'aceptada', 'convertida', 'rechazada', 'duplicada')),
  motivo_rechazo       text,
  duplicada_de_id      bigint references solicitudes(id) on delete set null,
  orden_id             bigint references ordenes(id) on delete set null,
  solicitado_por       uuid references perfiles(id) on delete set null,
  revisado_por         uuid references perfiles(id) on delete set null,
  revisado_en          timestamptz,
  creado_en            timestamptz not null default now()
);

create index if not exists solicitudes_sucursal on solicitudes (sucursal_id, creado_en desc);
create index if not exists solicitudes_estatus on solicitudes (estatus);

create table if not exists solicitudes_fotos (
  id            bigint generated always as identity primary key,
  solicitud_id  bigint not null references solicitudes(id) on delete cascade,
  archivo_path  text not null,
  creado_en     timestamptz not null default now()
);

create index if not exists solicitudes_fotos_solicitud on solicitudes_fotos (solicitud_id);

-- folio automatico legible: SOL-000001, SOL-000002...
create sequence if not exists solicitudes_folio_seq;
create or replace function solicitudes_folio()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'SOL-' || lpad(nextval('solicitudes_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists solicitudes_folio on solicitudes;
create trigger solicitudes_folio before insert on solicitudes
  for each row execute function solicitudes_folio();

alter table solicitudes enable row level security;
alter table solicitudes_fotos enable row level security;

drop policy if exists "lectura empresa" on solicitudes;
create policy "lectura empresa" on solicitudes
  for select to authenticated using (es_de_la_empresa());

-- Cualquiera con acceso de operacion (admin o usuario) puede levantar
-- una solicitud, pero solo para su propia sucursal (salvo admin, que
-- puede hacerlo por cualquiera) -- asi un responsable de sucursal no
-- reporta a nombre de otra sede.
drop policy if exists "crear solicitud" on solicitudes;
create policy "crear solicitud" on solicitudes
  for insert to authenticated
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario') and solicitado_por = auth.uid()
              and (mi_rol() = 'admin'
                   or sucursal_id = (select sucursal_id from perfiles where id = auth.uid())));

-- Revision/triage/conversion a orden: mismo nivel que ya opera
-- ordenes/gastos (admin y usuario).
drop policy if exists "revisar solicitud" on solicitudes;
create policy "revisar solicitud" on solicitudes
  for update to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'))
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

drop policy if exists "lectura empresa" on solicitudes_fotos;
create policy "lectura empresa" on solicitudes_fotos
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "agregar foto" on solicitudes_fotos;
create policy "agregar foto" on solicitudes_fotos
  for insert to authenticated
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

-- La bitacora (paso 1) tambien cubre Solicitudes.
alter table mantenimiento_bitacora drop constraint if exists mantenimiento_bitacora_entidad_check;
alter table mantenimiento_bitacora add constraint mantenimiento_bitacora_entidad_check
  check (entidad in ('orden', 'gasto', 'solicitud'));

create or replace function mantenimiento_registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entidad text;
begin
  v_entidad := case tg_table_name
    when 'ordenes' then 'orden'
    when 'gastos' then 'gasto'
    when 'solicitudes' then 'solicitud'
    else tg_table_name
  end;

  if tg_op = 'INSERT' then
    insert into mantenimiento_bitacora (entidad, entidad_id, accion, despues, hecho_por)
    values (v_entidad, new.id, 'alta', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into mantenimiento_bitacora (entidad, entidad_id, accion, antes, despues, hecho_por)
    values (v_entidad, new.id, 'edicion', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into mantenimiento_bitacora (entidad, entidad_id, accion, antes, hecho_por)
    values (v_entidad, old.id, 'baja', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists solicitudes_bitacora on solicitudes;
create trigger solicitudes_bitacora
  after insert or update or delete on solicitudes
  for each row execute function mantenimiento_registrar_bitacora();

-- Para poder restringir "una solicitud solo para tu propia sucursal"
-- hace falta poder asignarle una sucursal a cada usuario -- hoy
-- Usuarios.jsx solo administra el rol. listar_usuarios() no regresaba
-- sucursal_id; cambia el tipo de retorno asi que hay que tirar la
-- funcion antes de recrearla (CREATE OR REPLACE no deja cambiar
-- columnas de salida).
drop function if exists listar_usuarios();
create function listar_usuarios()
returns table (id uuid, nombre text, rol rol_usuario, sucursal_id bigint, email text, creado_en timestamptz)
language sql security definer set search_path = public, auth
as $$
  select p.id, p.nombre, p.rol, p.sucursal_id, u.email, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  where mi_rol() = 'admin'
  order by p.creado_en;
$$;

grant execute on function listar_usuarios() to authenticated;

commit;
