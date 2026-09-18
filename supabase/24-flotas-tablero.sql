-- =====================================================================
-- FLOTAS — fase B: tablero general (dashboard) para Administrador
-- General, Director y Gerente, con filtros de ciudad y persona.
--
-- Se amplia flota_listar_usuarios() para que un Director o Gerente
-- tambien pueda listar a su propio equipo (antes solo el admin podia
-- llamarla) — se usa para armar el filtro de persona del tablero.
-- Solo lectura: seguir cambiando roles sigue siendo exclusivo del
-- Administrador General (esa RLS no cambia).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

drop function if exists flota_listar_usuarios();
create function flota_listar_usuarios()
returns table (id uuid, nombre text, rol text, email text, supervisor_id uuid, creado_en timestamptz)
language sql security definer set search_path = public, auth
as $$
  select p.id, p.nombre, coalesce(fp.rol, 'pendiente'), u.email, fp.supervisor_id, p.creado_en
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
