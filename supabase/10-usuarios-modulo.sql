-- =====================================================================
-- Modulo de Usuarios:
--  1. Permite que un admin edite el rol de CUALQUIER persona (antes solo
--     podian editar su propio perfil).
--  2. Expone el correo de cada cuenta (vive en auth.users, protegido)
--     solo para quien ya es admin, via una funcion segura.
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

drop policy if exists "admin edita cualquier perfil" on perfiles;
create policy "admin edita cualquier perfil" on perfiles
  for update to authenticated
  using (mi_rol() = 'admin')
  with check (mi_rol() = 'admin');

create or replace function listar_usuarios()
returns table (id uuid, nombre text, rol rol_usuario, email text, creado_en timestamptz)
language sql security definer set search_path = public, auth
as $$
  select p.id, p.nombre, p.rol, u.email, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  where mi_rol() = 'admin'
  order by p.creado_en;
$$;

grant execute on function listar_usuarios() to authenticated;
