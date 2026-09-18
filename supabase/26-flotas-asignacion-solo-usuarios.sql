-- =====================================================================
-- FLOTAS — arregla la asignacion de unidades: a partir de ahora una
-- unidad SOLO se puede asignar a un usuario ya registrado en Flotas
-- (antes se escribia el nombre del conductor a mano y esa persona
-- nunca quedaba vinculada a su cuenta, por lo que no podia ver la
-- informacion de su propia unidad).
--
-- - vehiculo_asignado_id ahora es unico por perfil: nadie puede traer
--   dos unidades a la vez (evita datos inconsistentes).
-- - flota_listar_usuarios() regresa tambien vehiculo_asignado_id, para
--   que el formulario de asignar conductor sepa quien ya trae otra
--   unidad y se la libere automaticamente.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

alter table flota_perfiles
  add constraint flota_perfiles_vehiculo_unico unique (vehiculo_asignado_id);

drop function if exists flota_listar_usuarios();
create function flota_listar_usuarios()
returns table (
  id uuid, nombre text, rol text, email text,
  supervisor_id uuid, vehiculo_asignado_id bigint, creado_en timestamptz
)
language sql security definer set search_path = public, auth
as $$
  select p.id, p.nombre, coalesce(fp.rol, 'pendiente'), u.email,
         fp.supervisor_id, fp.vehiculo_asignado_id, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  left join flota_perfiles fp on fp.perfil_id = p.id
  where flota_mi_rol() = 'admin'
     or p.id = auth.uid()
     or p.id in (select perfil_id from flota_equipo_de(auth.uid()))
  order by p.creado_en;
$$;

grant execute on function flota_listar_usuarios() to authenticated;

commit;
