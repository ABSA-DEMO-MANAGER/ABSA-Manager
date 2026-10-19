-- =====================================================================
-- ORDENES Y GASTOS — folio automatico y responsable por orden
-- (punto 1 de la recomendacion para el Plan de Trabajo de 90 dias).
--
-- Hallazgo al revisar el esquema original: `ordenes.folio` y
-- `ordenes.creado_por` ya existian desde la version inicial del
-- portal, pero NINGUN alta de orden los llenaba nunca (ni Plan.jsx, ni
-- ActivoDetalle.jsx, ni la conversion de una solicitud) -- se quedaban
-- siempre en null. No es un cambio de diseno, es terminar algo que ya
-- estaba a medias:
--   - Se agrega el folio automatico "ORD-000001" (mismo patron que
--     solicitudes_folio) y se hace backfill de las ordenes existentes.
--   - El codigo ya se actualizo para empezar a llenar creado_por.
--   - gastos.folio es nuevo (no existia antes); mismo patron
--     "GAS-000001", tambien con backfill.
--   - responsable_id es nuevo: a diferencia de creado_por (quien la
--     dio de alta, no cambia), este es reasignable -- "el equipo
--     pueda apoyarse o sustituirse" del documento del cliente.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create sequence if not exists ordenes_folio_seq;
create or replace function ordenes_folio()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'ORD-' || lpad(nextval('ordenes_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists ordenes_folio on ordenes;
create trigger ordenes_folio before insert on ordenes
  for each row execute function ordenes_folio();

update ordenes set folio = 'ORD-' || lpad(nextval('ordenes_folio_seq')::text, 6, '0')
where folio is null;

alter table ordenes add column if not exists responsable_id uuid references perfiles(id) on delete set null;

alter table gastos add column if not exists folio text unique;

create sequence if not exists gastos_folio_seq;
create or replace function gastos_folio()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'GAS-' || lpad(nextval('gastos_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists gastos_folio on gastos;
create trigger gastos_folio before insert on gastos
  for each row execute function gastos_folio();

-- gastos_mantenimiento_requiere_orden (05-ampliacion.sql) se creo como
-- "not valid" a proposito -- para no exigirle orden_id al historico
-- migrado de Excel, solo a partir de ahi en adelante. Pero cualquier
-- UPDATE a una fila (aunque sea de otra columna, como este backfill de
-- folio) hace que Postgres vuelva a checar TODAS las constraints de esa
-- fila, y el historico exento revienta la validacion. Se quita antes
-- del backfill y se vuelve a crear exactamente igual (not valid) para
-- no cambiar esa regla de negocio.
alter table gastos drop constraint if exists gastos_mantenimiento_requiere_orden;

update gastos set folio = 'GAS-' || lpad(nextval('gastos_folio_seq')::text, 6, '0')
where folio is null;

alter table gastos
  add constraint gastos_mantenimiento_requiere_orden
  check (tipo not in ('preventivo','correctivo') or orden_id is not null)
  not valid;

commit;
