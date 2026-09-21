-- =====================================================================
-- FLOTAS — permite precargar datos de RH (puesto, telefono, licencia,
-- departamento, jefe directo, tipo de prestacion) para CUALQUIER
-- persona de la empresa, tenga o no una unidad asignada. Antes esta
-- info solo vivia en flota_vehiculos, asi que alguien sin camioneta
-- (administrativos, gerentes, etc.) no tenia donde guardarla.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 31-flotas-precarga-usuarios.sql)
-- =====================================================================

begin;

alter table flota_perfiles
  add column if not exists telefono         text,
  add column if not exists licencia         text,
  add column if not exists licencia_vence   date,
  add column if not exists puesto           text,
  add column if not exists departamento     text,
  add column if not exists jefe_directo     text,
  add column if not exists tipo_prestacion  text;

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

    if v_pre.id is not null then
      -- Datos de RH: siempre se copian al perfil (sin pisar lo que un
      -- admin ya haya editado a mano).
      update flota_perfiles set
        telefono        = coalesce(telefono, v_pre.telefono),
        licencia        = coalesce(licencia, v_pre.licencia),
        licencia_vence  = coalesce(licencia_vence, v_pre.licencia_vence),
        puesto          = coalesce(puesto, v_pre.puesto),
        departamento    = coalesce(departamento, v_pre.departamento),
        jefe_directo    = coalesce(jefe_directo, v_pre.jefe_directo),
        tipo_prestacion = coalesce(tipo_prestacion, v_pre.tipo_prestacion)
      where flota_perfiles.perfil_id = auth.uid();

      -- La unidad (si trae una) solo se vincula si nadie mas la tiene ya.
      if v_pre.vehiculo_id is not null then
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
      end if;

      delete from flota_precarga where id = v_pre.id;
    end if;
  end if;

  return query
    select fp.perfil_id, fp.rol, fp.vehiculo_asignado_id, fp.supervisor_id
    from flota_perfiles fp where fp.perfil_id = auth.uid();
end;
$$;

commit;
