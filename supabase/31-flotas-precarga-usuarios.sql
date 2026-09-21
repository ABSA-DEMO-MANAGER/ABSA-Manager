-- =====================================================================
-- FLOTAS — precarga de usuarios: permite dar de alta el nombre, unidad
-- y datos de RH de un empleado ANTES de que tenga cuenta en el portal
-- (la mayoria del inventario real no se ha registrado nunca). Cuando
-- esa persona entra por primera vez con su correo, el sistema la
-- vincula automaticamente a su unidad sin que un admin tenga que
-- hacerlo a mano.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create table if not exists flota_precarga (
  id               bigint generated always as identity primary key,
  correo           text not null unique,
  nombre           text,
  vehiculo_id      bigint references flota_vehiculos(id) on delete set null,
  telefono         text,
  licencia         text,
  licencia_vence   date,
  puesto           text,
  departamento     text,
  area             text,
  jefe_directo     text,
  tipo_prestacion  text,
  creado_en        timestamptz not null default now()
);

alter table flota_precarga enable row level security;

drop policy if exists "admin gestiona precarga" on flota_precarga;
create policy "admin gestiona precarga" on flota_precarga
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- Reemplaza el alta manual de flota_perfiles que hacia el cliente en
-- useFlotaPerfil.js. Crea la fila si hace falta y, si el correo de la
-- persona coincide con una precarga pendiente, la vincula a su unidad
-- de una vez -- todo en un solo viaje al servidor.
create or replace function flota_alta_perfil()
returns table (perfil_id uuid, rol text, vehiculo_asignado_id bigint, supervisor_id uuid)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text;
  v_pre    flota_precarga%rowtype;
begin
  select email into v_email from auth.users where id = auth.uid();

  insert into flota_perfiles (perfil_id) values (auth.uid())
  on conflict (perfil_id) do nothing;

  if v_email is not null then
    select * into v_pre from flota_precarga where lower(correo) = lower(v_email) limit 1;

    if v_pre.id is not null and v_pre.vehiculo_id is not null then
      begin
        update flota_perfiles set
          rol = case when rol = 'pendiente' then 'usuario' else rol end,
          vehiculo_asignado_id = coalesce(vehiculo_asignado_id, v_pre.vehiculo_id)
        where flota_perfiles.perfil_id = auth.uid();
      exception when unique_violation then
        null; -- la unidad ya se asigno a alguien mas mientras tanto; se deja pendiente
      end;

      update flota_vehiculos set conductor_correo = lower(v_email)
      where id = v_pre.vehiculo_id and (conductor_correo is null or lower(conductor_correo) = lower(v_email));

      delete from flota_precarga where id = v_pre.id;
    end if;
  end if;

  return query
    select fp.perfil_id, fp.rol, fp.vehiculo_asignado_id, fp.supervisor_id
    from flota_perfiles fp where fp.perfil_id = auth.uid();
end;
$$;

grant execute on function flota_alta_perfil() to authenticated;

commit;
