-- =====================================================================
-- FLOTAS — roles especializados (Administrador General / Administrador
-- Flotas / Administrador Gasolina) y mantenimiento automatico al
-- procesar un ticket.
--
-- 1) Se quita el rol 'director' (sus cuentas pasan a 'gerente') y se
--    agregan 'admin_flotas' y 'admin_gasolina'. 'admin' no cambia de
--    valor -- sigue siendo "Administrador General", cero migracion
--    para las cuentas que ya lo son.
--
-- 2) Regla real (no solo de pantalla): Administrador Flotas puede todo
--    lo que ya podia Administrador General, EXCEPTO aprobar/rechazar
--    solicitudes de gasolina/tag y cargas pendientes de esas dos
--    categorias en flota_gastos. Administrador Gasolina solo puede
--    gasolina/tag (flota_gasolina_solicitudes, flota_gastos filtrado a
--    esas categorias) y el modulo de Combustible (ciudades, distancias,
--    precio del litro) -- nada de tickets normales, servicios,
--    siniestros, documentos ni bitacora.
--
-- 3) flota_tickets gana relacionado_servicio_id (referencia opcional al
--    rechazar) y flota_servicios gana ticket_id + estatus
--    (abierto/cerrado) -- al "procesar" un ticket (estatus en_proceso)
--    se crea solo un mantenimiento abierto ligado a ese folio; al
--    cerrarlo, si tiene ticket, ese ticket pasa a completado solo.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Roles: reasignar director -> gerente, nuevo check constraint
-- ---------------------------------------------------------------------
update flota_perfiles set rol = 'gerente' where rol = 'director';

alter table flota_perfiles drop constraint if exists flota_perfiles_rol_check;
alter table flota_perfiles add constraint flota_perfiles_rol_check
  check (rol in ('admin', 'admin_flotas', 'admin_gasolina', 'gerente', 'usuario', 'pendiente'));

-- ---------------------------------------------------------------------
-- 2. Funciones auxiliares
-- ---------------------------------------------------------------------
create or replace function flota_es_admin_general_o_flotas()
returns boolean language sql stable security definer set search_path = public as $$
  select flota_mi_rol() in ('admin', 'admin_flotas')
$$;
grant execute on function flota_es_admin_general_o_flotas() to authenticated;

create or replace function flota_puede_gestionar_gasolina()
returns boolean language sql stable security definer set search_path = public as $$
  select flota_mi_rol() in ('admin', 'admin_gasolina')
$$;
grant execute on function flota_puede_gestionar_gasolina() to authenticated;

-- Los 3 "sabores" de admin ven todo el parque vehicular (antes solo
-- 'admin'); gerente/usuario siguen viendo su equipo/su propia unidad.
create or replace function flota_vehiculos_visibles()
returns table (id bigint) language sql stable security definer set search_path = public as $$
  select v.id from flota_vehiculos v
  where flota_mi_rol() in ('admin', 'admin_flotas', 'admin_gasolina')
     or v.id = (select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid())
     or v.id = (select vehiculo_propuesto_id from flota_perfiles where perfil_id = auth.uid())
     or exists (
          select 1 from flota_perfiles fp
          where fp.vehiculo_asignado_id = v.id
            and fp.perfil_id in (select perfil_id from flota_equipo_de(auth.uid()))
        );
$$;

create or replace function flota_listar_usuarios()
returns table (
  id uuid, nombre text, rol text, email text,
  supervisor_id uuid, vehiculo_asignado_id bigint, creado_en timestamptz
)
language sql security definer set search_path = public, auth as $$
  select p.id, p.nombre, coalesce(fp.rol, 'pendiente'), u.email,
         fp.supervisor_id, fp.vehiculo_asignado_id, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  left join flota_perfiles fp on fp.perfil_id = p.id
  where flota_es_admin_general_o_flotas()
     or p.id = auth.uid()
     or p.id in (select perfil_id from flota_equipo_de(auth.uid()))
  order by p.creado_en;
$$;
grant execute on function flota_listar_usuarios() to authenticated;

create or replace function flota_bloquear_autopromocion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol <> old.rol and not flota_es_admin_general_o_flotas() then
    raise exception 'Solo un administrador de Flotas puede cambiar el rol.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. flota_perfiles
-- ---------------------------------------------------------------------
drop policy if exists "propio o admin lee" on flota_perfiles;
create policy "propio o admin lee" on flota_perfiles
  for select to authenticated
  using (es_de_la_empresa() and (
    perfil_id = auth.uid()
    or flota_es_admin_general_o_flotas()
    or perfil_id in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "admin da de alta" on flota_perfiles;
create policy "admin da de alta" on flota_perfiles
  for insert to authenticated
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "admin edita" on flota_perfiles;
create policy "admin edita" on flota_perfiles
  for update to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

-- ---------------------------------------------------------------------
-- 4. flota_vehiculos / flota_documentos / flota_servicios
-- ---------------------------------------------------------------------
drop policy if exists "lectura segun equipo" on flota_vehiculos;
create policy "lectura segun equipo" on flota_vehiculos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario', 'admin_gasolina')
         and id in (select id from flota_vehiculos_visibles()));

drop policy if exists "admin escribe" on flota_vehiculos;
create policy "admin escribe" on flota_vehiculos
  for all to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "lectura segun equipo" on flota_documentos;
create policy "lectura segun equipo" on flota_documentos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario')
         and vehiculo_id in (select id from flota_vehiculos_visibles()));

drop policy if exists "admin escribe" on flota_documentos;
create policy "admin escribe" on flota_documentos
  for all to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "lectura segun equipo" on flota_servicios;
create policy "lectura segun equipo" on flota_servicios
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario')
         and vehiculo_id in (select id from flota_vehiculos_visibles()));

drop policy if exists "admin escribe" on flota_servicios;
create policy "admin escribe" on flota_servicios
  for all to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

-- ---------------------------------------------------------------------
-- 5. flota_tickets (nunca admin_gasolina) + columna de referencia
-- ---------------------------------------------------------------------
alter table flota_tickets add column if not exists relacionado_servicio_id bigint references flota_servicios(id) on delete set null;

drop policy if exists "lectura segun equipo" on flota_tickets;
create policy "lectura segun equipo" on flota_tickets
  for select to authenticated
  using (es_de_la_empresa() and (
    flota_es_admin_general_o_flotas()
    or solicitado_por = auth.uid()
    or solicitado_por in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "crear ticket" on flota_tickets;
create policy "crear ticket" on flota_tickets
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario')
              and solicitado_por = auth.uid() and estatus = 'abierto');

drop policy if exists "admin actualiza ticket" on flota_tickets;
create policy "admin actualiza ticket" on flota_tickets
  for update to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

-- ---------------------------------------------------------------------
-- 6. flota_gastos -- la unica tabla con logica de verdad distinta por
--    rol: admin_flotas ve/edita todo menos actualizar Gasolina/Tag;
--    admin_gasolina solo ve/escribe/actualiza esas dos categorias.
-- ---------------------------------------------------------------------
drop policy if exists "lectura segun equipo" on flota_gastos;
create policy "lectura segun equipo" on flota_gastos
  for select to authenticated
  using (es_de_la_empresa() and (
    (flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario') and vehiculo_id in (select id from flota_vehiculos_visibles()))
    or (flota_mi_rol() = 'admin_gasolina' and categoria in ('Gasolina', 'Tag'))
  ));

drop policy if exists "crear gasto" on flota_gastos;
create policy "crear gasto" on flota_gastos
  for insert to authenticated
  with check (es_de_la_empresa() and registrado_por = auth.uid() and (
    flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario')
    or (flota_mi_rol() = 'admin_gasolina' and categoria in ('Gasolina', 'Tag'))
  ));

drop policy if exists "admin actualiza gasto" on flota_gastos;
create policy "admin actualiza gasto" on flota_gastos
  for update to authenticated
  using (es_de_la_empresa() and (
    flota_mi_rol() = 'admin'
    or (flota_mi_rol() = 'admin_flotas' and categoria not in ('Gasolina', 'Tag'))
    or (flota_mi_rol() = 'admin_gasolina' and categoria in ('Gasolina', 'Tag'))
  ))
  with check (es_de_la_empresa() and (
    flota_mi_rol() = 'admin'
    or (flota_mi_rol() = 'admin_flotas' and categoria not in ('Gasolina', 'Tag'))
    or (flota_mi_rol() = 'admin_gasolina' and categoria in ('Gasolina', 'Tag'))
  ));

drop policy if exists "admin borra gasto" on flota_gastos;
create policy "admin borra gasto" on flota_gastos
  for delete to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas());

-- ---------------------------------------------------------------------
-- 7. flota_presupuesto / flota_siniestros / flota_conductor_historial /
--    flota_vehiculo_fotos / flota_ciudades / flota_bitacora /
--    flota_servicio_archivos / flota_precarga -- mismo patron: se quita
--    director, se agrega admin_flotas donde habia 'admin' o la lista
--    general. admin_gasolina NO se agrega (fuera de su alcance).
-- ---------------------------------------------------------------------
drop policy if exists "lectura aprobados" on flota_presupuesto;
create policy "lectura aprobados" on flota_presupuesto
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_presupuesto;
create policy "admin escribe" on flota_presupuesto
  for update to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "lectura segun equipo" on flota_siniestros;
create policy "lectura segun equipo" on flota_siniestros
  for select to authenticated
  using (es_de_la_empresa() and (
    flota_es_admin_general_o_flotas()
    or reportado_por = auth.uid()
    or reportado_por in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "reportar siniestro" on flota_siniestros;
create policy "reportar siniestro" on flota_siniestros
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario')
              and reportado_por = auth.uid() and estatus = 'reportado');

drop policy if exists "admin gestiona siniestro" on flota_siniestros;
create policy "admin gestiona siniestro" on flota_siniestros
  for update to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "lectura aprobados" on flota_conductor_historial;
create policy "lectura aprobados" on flota_conductor_historial
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_conductor_historial;
create policy "admin escribe" on flota_conductor_historial
  for insert to authenticated
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "lectura aprobados" on flota_vehiculo_fotos;
create policy "lectura aprobados" on flota_vehiculo_fotos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_vehiculo_fotos;
create policy "admin escribe" on flota_vehiculo_fotos
  for all to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "lectura aprobados" on flota_ciudades;
create policy "lectura aprobados" on flota_ciudades
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario', 'admin_gasolina'));

drop policy if exists "admin escribe" on flota_ciudades;
create policy "admin escribe" on flota_ciudades
  for all to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "lectura segun equipo" on flota_bitacora;
create policy "lectura segun equipo" on flota_bitacora
  for select to authenticated
  using (
    es_de_la_empresa() and (
      (flota_mi_rol() in ('admin', 'admin_flotas', 'gerente')
       and (vehiculo_id is null or vehiculo_id in (select id from flota_vehiculos_visibles())))
      or vehiculo_id in (select vehiculo_asignado_id from flota_perfiles where perfil_id = auth.uid())
    )
  );

drop policy if exists "lectura aprobados" on flota_servicio_archivos;
create policy "lectura aprobados" on flota_servicio_archivos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_servicio_archivos;
create policy "admin escribe" on flota_servicio_archivos
  for all to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

drop policy if exists "admin gestiona precarga" on flota_precarga;
create policy "admin gestiona precarga" on flota_precarga
  for all to authenticated
  using (es_de_la_empresa() and flota_es_admin_general_o_flotas())
  with check (es_de_la_empresa() and flota_es_admin_general_o_flotas());

-- ---------------------------------------------------------------------
-- 8. Modulo de combustible -- admin_flotas y admin_gasolina lo operan
--    igual (infraestructura, no es "autorizar una carga").
-- ---------------------------------------------------------------------
drop policy if exists "lectura aprobados" on flota_distancias;
create policy "lectura aprobados" on flota_distancias
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario', 'admin_gasolina'));

drop policy if exists "admin escribe" on flota_distancias;
create policy "admin escribe" on flota_distancias
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'admin_gasolina'))
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'admin_gasolina'));

drop policy if exists "lectura aprobados" on flota_precio_combustible;
create policy "lectura aprobados" on flota_precio_combustible
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario', 'admin_gasolina'));

drop policy if exists "admin escribe" on flota_precio_combustible;
create policy "admin escribe" on flota_precio_combustible
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'admin_gasolina'))
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'admin_gasolina'));

-- ---------------------------------------------------------------------
-- 9. flota_gasolina_solicitudes -- admin_flotas VE (panorama completo)
--    pero NO resuelve; solo admin/admin_gasolina aprueban/rechazan.
-- ---------------------------------------------------------------------
drop policy if exists "lectura segun equipo" on flota_gasolina_solicitudes;
create policy "lectura segun equipo" on flota_gasolina_solicitudes
  for select to authenticated
  using (es_de_la_empresa() and (
    flota_mi_rol() in ('admin', 'admin_flotas', 'admin_gasolina')
    or solicitante_id = auth.uid()
    or solicitante_id in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "crear solicitud" on flota_gasolina_solicitudes;
create policy "crear solicitud" on flota_gasolina_solicitudes
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'admin_flotas', 'admin_gasolina', 'gerente', 'usuario')
              and solicitante_id = auth.uid() and estatus = 'pendiente');

drop policy if exists "admin resuelve" on flota_gasolina_solicitudes;
create policy "admin resuelve" on flota_gasolina_solicitudes
  for update to authenticated
  using (es_de_la_empresa() and flota_puede_gestionar_gasolina())
  with check (es_de_la_empresa() and flota_puede_gestionar_gasolina());

-- ---------------------------------------------------------------------
-- 10. storage.objects (bucket "mantenimiento", compartido con Mantenimiento)
-- ---------------------------------------------------------------------
drop policy if exists "mantenimiento escritura" on storage.objects;
create policy "mantenimiento escritura" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mantenimiento' and es_de_la_empresa()
              and (mi_rol() in ('admin', 'usuario') or flota_mi_rol() in ('admin', 'admin_flotas', 'gerente', 'usuario')));

drop policy if exists "mantenimiento actualiza" on storage.objects;
create policy "mantenimiento actualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'mantenimiento' and es_de_la_empresa()
         and (mi_rol() in ('admin', 'usuario') or flota_es_admin_general_o_flotas()));

-- ---------------------------------------------------------------------
-- 11. Mantenimiento automatico al procesar un ticket
-- ---------------------------------------------------------------------
alter table flota_servicios
  add column if not exists ticket_id bigint unique references flota_tickets(id) on delete set null,
  add column if not exists estatus text not null default 'cerrado' check (estatus in ('abierto', 'cerrado'));

commit;
