-- =====================================================================
-- FLOTAS — fase 1: mismo login que Mantenimiento (mismo Supabase),
-- rol propio de Flotas (admin/gerente/usuario/pendiente), Unidades
-- (inventario de vehiculos) con sus documentos y vencimientos.
--
-- Fuera de alcance en esta fase (se agrega despues):
--   tickets, siniestros, costos, combustible, informes, carga CSV.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Rol de Flotas — independiente del rol de Mantenimiento.
--    Una persona puede ser admin en un portal y nada en el otro.
-- ---------------------------------------------------------------------
create table if not exists flota_perfiles (
  perfil_id             uuid primary key references perfiles(id) on delete cascade,
  rol                   text not null default 'pendiente'
                        check (rol in ('admin', 'gerente', 'usuario', 'pendiente')),
  vehiculo_asignado_id  bigint,   -- fk se agrega tras crear flota_vehiculos
  creado_en             timestamptz not null default now()
);

create or replace function flota_mi_rol()
returns text
language sql stable security definer set search_path = public
as $$ select rol from flota_perfiles where perfil_id = auth.uid() $$;

-- ---------------------------------------------------------------------
-- 2. Unidades (vehiculos)
-- ---------------------------------------------------------------------
create table if not exists flota_vehiculos (
  id                  bigint generated always as identity primary key,
  codigo              text,                      -- no. economico (ECO-001)
  sucursal_id         bigint references sucursales(id) on delete set null,
  marca               text,
  modelo              text,
  anio                int,
  tipo                text,                      -- Pickup, Sedan, Van...
  motor               text,
  color               text,
  placas              text,
  vin                 text,
  propiedad           text not null default 'propio' check (propiedad in ('propio', 'arrendado')),
  estado              text not null default 'activo' check (estado in ('activo', 'en_mantenimiento', 'inactivo')),
  km                  numeric(10, 1) not null default 0,
  valor               numeric(14, 2),
  conductor_nombre    text,
  conductor_telefono  text,
  conductor_correo    text,
  conductor_licencia  text,
  licencia_vence      date,
  proximo_servicio_km    numeric(10, 1),
  proximo_servicio_fecha date,
  foto_path           text,
  notas               text,
  creado_en           timestamptz not null default now()
);

alter table flota_perfiles
  add constraint flota_perfiles_vehiculo_fk
  foreign key (vehiculo_asignado_id) references flota_vehiculos(id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. Documentos por unidad (tarjeta de circulacion, poliza, verificacion...)
-- ---------------------------------------------------------------------
create table if not exists flota_documentos (
  id           bigint generated always as identity primary key,
  vehiculo_id  bigint not null references flota_vehiculos(id) on delete cascade,
  tipo         text not null,      -- 'Poliza de seguro', 'Verificacion vehicular'...
  referencia   text,
  emision      date,
  vence        date,
  monto        numeric(12, 2),
  archivo_path text
);

-- ---------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------
alter table flota_perfiles  enable row level security;
alter table flota_vehiculos enable row level security;
alter table flota_documentos enable row level security;

-- flota_perfiles: uno ve el suyo; admin ve y edita todos; nadie se autopromueve
drop policy if exists "propio o admin lee" on flota_perfiles;
create policy "propio o admin lee" on flota_perfiles
  for select to authenticated
  using (es_de_la_empresa() and (perfil_id = auth.uid() or flota_mi_rol() = 'admin'));

drop policy if exists "alta propia" on flota_perfiles;
create policy "alta propia" on flota_perfiles
  for insert to authenticated
  with check (es_de_la_empresa() and perfil_id = auth.uid());

-- admin puede dar de alta a CUALQUIERA (para asignar roles a quien no ha entrado)
drop policy if exists "admin da de alta" on flota_perfiles;
create policy "admin da de alta" on flota_perfiles
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

drop policy if exists "admin edita" on flota_perfiles;
create policy "admin edita" on flota_perfiles
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

create or replace function flota_bloquear_autopromocion()
returns trigger language plpgsql as $$
begin
  if new.rol <> old.rol and flota_mi_rol() <> 'admin' then
    raise exception 'Solo un administrador de Flotas puede cambiar el rol.';
  end if;
  return new;
end;
$$;

drop trigger if exists flota_perfiles_bloquear_rol on flota_perfiles;
create trigger flota_perfiles_bloquear_rol
  before update on flota_perfiles
  for each row execute function flota_bloquear_autopromocion();

-- vehiculos y documentos: lectura para cualquier rol aprobado; escritura solo admin
drop policy if exists "lectura aprobados" on flota_vehiculos;
create policy "lectura aprobados" on flota_vehiculos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_vehiculos;
create policy "admin escribe" on flota_vehiculos
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

drop policy if exists "lectura aprobados" on flota_documentos;
create policy "lectura aprobados" on flota_documentos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_documentos;
create policy "admin escribe" on flota_documentos
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 5. Lista de usuarios para el admin de Flotas (correo vive en auth.users,
--    protegido — se expone solo si quien llama ya es admin de Flotas).
--    Incluye a TODOS los de la empresa, aunque nunca hayan entrado a
--    Flotas, para poder asignarles rol de una vez.
-- ---------------------------------------------------------------------
create or replace function flota_listar_usuarios()
returns table (id uuid, nombre text, rol text, email text, creado_en timestamptz)
language sql security definer set search_path = public, auth
as $$
  select p.id, p.nombre, coalesce(fp.rol, 'pendiente'), u.email, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  left join flota_perfiles fp on fp.perfil_id = p.id
  where flota_mi_rol() = 'admin'
  order by p.creado_en;
$$;

grant execute on function flota_listar_usuarios() to authenticated;

commit;
