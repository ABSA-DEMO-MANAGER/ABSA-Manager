-- =====================================================================
-- FLOTAS — fase A de la reestructura de roles:
--   Usuario -> Gerente -> Director -> Administrador General
--
-- - Se agrega el rol 'director' (el 'admin' existente pasa a mostrarse
--   como "Administrador General" en la app, sin cambiar el valor en
--   la base para no romper nada de lo ya construido).
-- - Cada perfil de Flotas puede tener un 'supervisor_id' (su gerente,
--   o el director de su gerente). Con eso se arma el "equipo" de cada
--   gerente/director de forma automatica (recursivo, sin limite de
--   niveles).
-- - La visibilidad de unidades, costos, tickets y siniestros se
--   ajusta con RLS segun el rol:
--     * usuario: solo su propia unidad
--     * gerente / director: su unidad (si tienen) + las de su equipo
--     * admin: todo
-- - Bitacora: cualquier alta/edicion/baja de una unidad queda
--   registrada (antes/despues) en flota_bitacora.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Rol 'director' + jerarquia (supervisor_id)
-- ---------------------------------------------------------------------
alter table flota_perfiles drop constraint if exists flota_perfiles_rol_check;
alter table flota_perfiles add constraint flota_perfiles_rol_check
  check (rol in ('admin', 'director', 'gerente', 'usuario', 'pendiente'));

alter table flota_perfiles
  add column if not exists supervisor_id uuid references perfiles(id) on delete set null;

-- equipo (directo + indirecto) de una persona, recursivo
create or replace function flota_equipo_de(jefe uuid)
returns table (perfil_id uuid)
language sql stable security definer set search_path = public
as $$
  with recursive equipo as (
    select fp.perfil_id from flota_perfiles fp where fp.supervisor_id = jefe
    union all
    select fp.perfil_id from flota_perfiles fp
    join equipo e on fp.supervisor_id = e.perfil_id
  )
  select perfil_id from equipo;
$$;

-- unidades que la persona actual puede ver: la suya + las de su equipo (o todas si es admin)
create or replace function flota_vehiculos_visibles()
returns table (id bigint)
language sql stable security definer set search_path = public
as $$
  select v.id from flota_vehiculos v
  where flota_mi_rol() = 'admin'
     or v.id = (select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid())
     or exists (
          select 1 from flota_perfiles fp
          where fp.vehiculo_asignado_id = v.id
            and fp.perfil_id in (select perfil_id from flota_equipo_de(auth.uid()))
        );
$$;

-- se agrega supervisor_id a la lista de usuarios para poder asignarlo
create or replace function flota_listar_usuarios()
returns table (id uuid, nombre text, rol text, email text, supervisor_id uuid, creado_en timestamptz)
language sql security definer set search_path = public, auth
as $$
  select p.id, p.nombre, coalesce(fp.rol, 'pendiente'), u.email, fp.supervisor_id, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  left join flota_perfiles fp on fp.perfil_id = p.id
  where flota_mi_rol() = 'admin'
  order by p.creado_en;
$$;

-- ---------------------------------------------------------------------
-- 2. Visibilidad por rol + equipo en cada tabla de Flotas
-- ---------------------------------------------------------------------
drop policy if exists "propio o admin lee" on flota_perfiles;
create policy "propio o admin lee" on flota_perfiles
  for select to authenticated
  using (es_de_la_empresa() and (
    perfil_id = auth.uid()
    or flota_mi_rol() = 'admin'
    or perfil_id in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "lectura aprobados" on flota_vehiculos;
create policy "lectura segun equipo" on flota_vehiculos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
         and id in (select id from flota_vehiculos_visibles()));

drop policy if exists "lectura aprobados" on flota_documentos;
create policy "lectura segun equipo" on flota_documentos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
         and vehiculo_id in (select id from flota_vehiculos_visibles()));

drop policy if exists "lectura aprobados" on flota_servicios;
create policy "lectura segun equipo" on flota_servicios
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
         and vehiculo_id in (select id from flota_vehiculos_visibles()));

drop policy if exists "lectura aprobados" on flota_gastos;
create policy "lectura segun equipo" on flota_gastos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
         and vehiculo_id in (select id from flota_vehiculos_visibles()));

drop policy if exists "crear gasto" on flota_gastos;
create policy "crear gasto" on flota_gastos
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
              and registrado_por = auth.uid());

drop policy if exists "lectura propios o admin" on flota_tickets;
create policy "lectura segun equipo" on flota_tickets
  for select to authenticated
  using (es_de_la_empresa() and (
    flota_mi_rol() = 'admin'
    or solicitado_por = auth.uid()
    or solicitado_por in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "crear ticket" on flota_tickets;
create policy "crear ticket" on flota_tickets
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
              and solicitado_por = auth.uid() and estatus = 'abierto');

drop policy if exists "lectura propios o admin" on flota_siniestros;
create policy "lectura segun equipo" on flota_siniestros
  for select to authenticated
  using (es_de_la_empresa() and (
    flota_mi_rol() = 'admin'
    or reportado_por = auth.uid()
    or reportado_por in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "reportar siniestro" on flota_siniestros;
create policy "reportar siniestro" on flota_siniestros
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
              and reportado_por = auth.uid() and estatus = 'reportado');

drop policy if exists "lectura aprobados" on flota_ciudades;
create policy "lectura aprobados" on flota_ciudades
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario'));

drop policy if exists "lectura aprobados" on flota_presupuesto;
create policy "lectura aprobados" on flota_presupuesto
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario'));

-- Storage (fotos de galeria / comprobantes): tambien puede subir un director
drop policy if exists "mantenimiento escritura" on storage.objects;
create policy "mantenimiento escritura" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mantenimiento' and es_de_la_empresa()
              and (mi_rol() in ('admin', 'usuario') or flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')));

-- ---------------------------------------------------------------------
-- 3. Bitacora: alta/edicion/baja de unidades
-- ---------------------------------------------------------------------
create table if not exists flota_bitacora (
  id           bigint generated always as identity primary key,
  vehiculo_id  bigint references flota_vehiculos(id) on delete set null,
  accion       text not null check (accion in ('alta', 'edicion', 'baja')),
  antes        jsonb,
  despues      jsonb,
  hecho_por    uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now()
);

create index if not exists flota_bitacora_vehiculo on flota_bitacora (vehiculo_id, creado_en desc);

alter table flota_bitacora enable row level security;

drop policy if exists "lectura segun equipo" on flota_bitacora;
create policy "lectura segun equipo" on flota_bitacora
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente')
         and (vehiculo_id is null or vehiculo_id in (select id from flota_vehiculos_visibles())));

create or replace function flota_registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into flota_bitacora (vehiculo_id, accion, despues, hecho_por)
    values (new.id, 'alta', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into flota_bitacora (vehiculo_id, accion, antes, despues, hecho_por)
    values (new.id, 'edicion', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into flota_bitacora (vehiculo_id, accion, antes, hecho_por)
    values (old.id, 'baja', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists flota_vehiculos_bitacora on flota_vehiculos;
create trigger flota_vehiculos_bitacora
  after insert or update or delete on flota_vehiculos
  for each row execute function flota_registrar_bitacora();

commit;
