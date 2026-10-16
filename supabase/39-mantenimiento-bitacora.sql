-- =====================================================================
-- MANTENIMIENTO — bitacora de auditoria (paso 1 del rediseno del
-- modulo: "Rediseño del módulo de Mantenimiento — Fase 1").
--
-- Copia el patron ya probado en Flotas (flota_bitacora +
-- flota_registrar_bitacora), con una diferencia deliberada: en vez de
-- una tabla por entidad, es una sola tabla generica (entidad +
-- entidad_id SIN llave foranea), para poder colgarla de ordenes y de
-- gastos sin duplicar la tabla/funcion, y sin el problema que tuvimos
-- en Flotas al borrar (ahi la llave foranea apuntaba a una fila que
-- ya no existe dentro del mismo DELETE; aqui no hay llave foranea asi
-- que no aplica).
--
-- Se crea primero, antes de Solicitudes/Cotizaciones/etc., para que
-- todo lo que se construya despues ya quede auditado desde que nace.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create table if not exists mantenimiento_bitacora (
  id         bigint generated always as identity primary key,
  entidad    text not null check (entidad in ('orden', 'gasto')),
  entidad_id bigint not null,
  accion     text not null check (accion in ('alta', 'edicion', 'baja')),
  antes      jsonb,
  despues    jsonb,
  hecho_por  uuid references perfiles(id) on delete set null,
  creado_en  timestamptz not null default now()
);

create index if not exists mantenimiento_bitacora_entidad
  on mantenimiento_bitacora (entidad, entidad_id, creado_en desc);

alter table mantenimiento_bitacora enable row level security;

drop policy if exists "lectura empresa" on mantenimiento_bitacora;
create policy "lectura empresa" on mantenimiento_bitacora
  for select to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

create or replace function mantenimiento_registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entidad text;
begin
  v_entidad := case tg_table_name when 'ordenes' then 'orden' when 'gastos' then 'gasto' else tg_table_name end;

  if tg_op = 'INSERT' then
    insert into mantenimiento_bitacora (entidad, entidad_id, accion, despues, hecho_por)
    values (v_entidad, new.id, 'alta', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into mantenimiento_bitacora (entidad, entidad_id, accion, antes, despues, hecho_por)
    values (v_entidad, new.id, 'edicion', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into mantenimiento_bitacora (entidad, entidad_id, accion, antes, hecho_por)
    values (v_entidad, old.id, 'baja', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists ordenes_bitacora on ordenes;
create trigger ordenes_bitacora
  after insert or update or delete on ordenes
  for each row execute function mantenimiento_registrar_bitacora();

drop trigger if exists gastos_bitacora on gastos;
create trigger gastos_bitacora
  after insert or update or delete on gastos
  for each row execute function mantenimiento_registrar_bitacora();

commit;
