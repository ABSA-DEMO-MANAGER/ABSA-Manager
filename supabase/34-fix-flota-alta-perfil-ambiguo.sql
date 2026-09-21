-- =====================================================================
-- FLOTAS — arregla flota_alta_perfil(): "column reference is ambiguous".
--
-- La funcion declara RETURNS TABLE (perfil_id, rol, vehiculo_asignado_id,
-- supervisor_id) y esos mismos nombres son columnas de flota_perfiles.
-- En PL/pgSQL eso vuelve ambiguo cualquier uso de esos nombres sin
-- calificar dentro del cuerpo (p.ej. en los UPDATE). Se agrega la
-- directiva "#variable_conflict use_column" para que, ante esa
-- ambiguedad, siempre gane la columna de la tabla (que es lo que
-- realmente se queria).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create or replace function flota_alta_perfil()
returns table (perfil_id uuid, rol text, vehiculo_asignado_id bigint, supervisor_id uuid)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
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
      update flota_perfiles set
        telefono        = coalesce(telefono, v_pre.telefono),
        licencia        = coalesce(licencia, v_pre.licencia),
        licencia_vence  = coalesce(licencia_vence, v_pre.licencia_vence),
        puesto          = coalesce(puesto, v_pre.puesto),
        departamento    = coalesce(departamento, v_pre.departamento),
        jefe_directo    = coalesce(jefe_directo, v_pre.jefe_directo),
        tipo_prestacion = coalesce(tipo_prestacion, v_pre.tipo_prestacion)
      where flota_perfiles.perfil_id = auth.uid();

      if v_pre.vehiculo_id is not null then
        begin
          update flota_perfiles set
            rol = case when rol = 'pendiente' then 'usuario' else rol end,
            vehiculo_asignado_id = coalesce(vehiculo_asignado_id, v_pre.vehiculo_id)
          where flota_perfiles.perfil_id = auth.uid();
        exception when unique_violation then
          null;
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
