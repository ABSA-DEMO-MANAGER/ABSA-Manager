-- =====================================================================
-- FLOTAS — el admin propone, el usuario acepta y llena sus datos.
--
-- Antes, al "Asignar conductor" el ADMIN capturaba telefono, licencia,
-- puesto, departamento, tipo de prestacion, fotos del estado y
-- kilometraje. Ahora el admin solo elige a la persona (y su gerente);
-- se crea una PROPUESTA pendiente, se le avisa por correo, y es esa
-- persona quien entra a "Mi unidad", acepta y llena su propia
-- informacion (incluidas las fotos de como recibe la unidad).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

alter table flota_perfiles
  add column if not exists vehiculo_propuesto_id bigint references flota_vehiculos(id) on delete set null;

alter table flota_vehiculos
  add column if not exists propuesta_perfil_id uuid references perfiles(id) on delete set null;

-- Quien tiene una unidad PROPUESTA (todavia sin aceptar) tambien debe
-- poder verla, para decidir si acepta -- antes solo se veian las ya
-- asignadas.
create or replace function flota_vehiculos_visibles()
returns table (id bigint)
language sql stable security definer set search_path = public
as $$
  select v.id from flota_vehiculos v
  where flota_mi_rol() = 'admin'
     or v.id = (select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid())
     or v.id = (select vehiculo_propuesto_id from flota_perfiles where perfil_id = auth.uid())
     or exists (
          select 1 from flota_perfiles fp
          where fp.vehiculo_asignado_id = v.id
            and fp.perfil_id in (select perfil_id from flota_equipo_de(auth.uid()))
        );
$$;

-- Quien tiene una unidad propuesta o asignada puede gestionar la
-- galeria de fotos de ESA unidad (antes solo el admin podia).
drop policy if exists "usuario gestiona fotos de su unidad" on flota_vehiculo_fotos;
create policy "usuario gestiona fotos de su unidad" on flota_vehiculo_fotos
  for all to authenticated
  using (es_de_la_empresa() and vehiculo_id in (
    select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid()
    union
    select vehiculo_propuesto_id from flota_perfiles where perfil_id = auth.uid()
  ))
  with check (es_de_la_empresa() and vehiculo_id in (
    select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid()
    union
    select vehiculo_propuesto_id from flota_perfiles where perfil_id = auth.uid()
  ));

-- flota_alta_perfil() ahora tambien regresa la propuesta pendiente y
-- los datos de RH del perfil, para que "Mi unidad" pueda mostrarlos.
create or replace function flota_alta_perfil()
returns table (
  perfil_id uuid, rol text, vehiculo_asignado_id bigint, vehiculo_propuesto_id bigint, supervisor_id uuid,
  telefono text, licencia text, licencia_vence date, puesto text, departamento text,
  jefe_directo text, tipo_prestacion text
)
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
    select fp.perfil_id, fp.rol, fp.vehiculo_asignado_id, fp.vehiculo_propuesto_id, fp.supervisor_id,
           fp.telefono, fp.licencia, fp.licencia_vence, fp.puesto, fp.departamento,
           fp.jefe_directo, fp.tipo_prestacion
    from flota_perfiles fp where fp.perfil_id = auth.uid();
end;
$$;

-- La persona que recibe la propuesta la acepta y llena su propia
-- informacion; solo puede tocar la unidad que se le propuso a ELLA.
create or replace function flota_aceptar_asignacion(
  p_telefono text, p_licencia text, p_licencia_vence date,
  p_puesto text, p_departamento text, p_tipo_prestacion text, p_km numeric
) returns void
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
declare
  v_vehiculo_id     bigint;
  v_otra_unidad_id  bigint;
  v_supervisor      uuid;
  v_nombre          text;
  v_email           text;
  v_jefe            text;
begin
  select vehiculo_propuesto_id, vehiculo_asignado_id, supervisor_id
    into v_vehiculo_id, v_otra_unidad_id, v_supervisor
    from flota_perfiles where perfil_id = auth.uid();

  if v_vehiculo_id is null then
    raise exception 'No tienes ninguna unidad pendiente por aceptar.';
  end if;

  if v_otra_unidad_id is not null and v_otra_unidad_id <> v_vehiculo_id then
    update flota_vehiculos set
      conductor_nombre = null, conductor_correo = null, conductor_telefono = null,
      conductor_licencia = null, licencia_vence = null, puesto = null,
      departamento = null, jefe_directo = null, tipo_prestacion = null
    where id = v_otra_unidad_id;
  end if;

  select p.nombre, u.email into v_nombre, v_email
  from perfiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();

  select p2.nombre into v_jefe
  from flota_perfiles fp2 join perfiles p2 on p2.id = fp2.perfil_id
  where fp2.perfil_id = v_supervisor;

  update flota_vehiculos set
    conductor_nombre = v_nombre, conductor_correo = v_email,
    conductor_telefono = p_telefono, conductor_licencia = p_licencia, licencia_vence = p_licencia_vence,
    puesto = p_puesto, departamento = p_departamento, jefe_directo = v_jefe, tipo_prestacion = p_tipo_prestacion,
    km = coalesce(p_km, km),
    propuesta_perfil_id = null
  where id = v_vehiculo_id;

  begin
    update flota_perfiles set
      vehiculo_asignado_id = v_vehiculo_id,
      vehiculo_propuesto_id = null,
      telefono = p_telefono, licencia = p_licencia, licencia_vence = p_licencia_vence,
      puesto = p_puesto, departamento = p_departamento, tipo_prestacion = p_tipo_prestacion
    where perfil_id = auth.uid();
  exception when unique_violation then
    raise exception 'Esta unidad ya fue asignada a alguien más.';
  end;
end;
$$;

grant execute on function flota_aceptar_asignacion(text, text, date, text, text, text, numeric) to authenticated;

commit;
