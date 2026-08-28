-- =====================================================================
-- FLOTAS — fase 2: Tickets (solicitudes) y Servicios (mantenimiento).
--
-- De paso corrige un bug real: la politica de Storage seguia
-- exigiendo rol 'coordinador', que ya no existe desde que Mantenimiento
-- paso a admin/usuario/consulta — esto bloqueaba a cualquier "usuario"
-- al subir comprobantes al finalizar una orden.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Arreglo: Storage debe aceptar 'usuario', no el viejo 'coordinador'
-- ---------------------------------------------------------------------
drop policy if exists "mantenimiento escritura" on storage.objects;
create policy "mantenimiento escritura" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mantenimiento' and es_de_la_empresa()
              and (mi_rol() in ('admin', 'usuario') or flota_mi_rol() in ('admin', 'gerente', 'usuario')));

drop policy if exists "mantenimiento actualiza" on storage.objects;
create policy "mantenimiento actualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'mantenimiento' and es_de_la_empresa()
         and (mi_rol() in ('admin', 'usuario') or flota_mi_rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 1. Tickets (solicitudes sobre una unidad)
-- ---------------------------------------------------------------------
create table if not exists flota_tickets (
  id              bigint generated always as identity primary key,
  folio           text unique,
  vehiculo_id     bigint not null references flota_vehiculos(id) on delete cascade,
  categoria       text not null default 'otro'
                  check (categoria in ('mantenimiento', 'cambio_pieza', 'compra_pieza', 'reparacion', 'siniestro', 'otro')),
  descripcion     text not null,
  estatus         text not null default 'abierto'
                  check (estatus in ('abierto', 'en_proceso', 'rechazado', 'completado')),
  motivo_rechazo  text,
  solicitado_por  uuid references perfiles(id) on delete set null,
  creado_en       timestamptz not null default now()
);

alter table flota_tickets enable row level security;

drop policy if exists "lectura propios o admin" on flota_tickets;
create policy "lectura propios o admin" on flota_tickets
  for select to authenticated
  using (es_de_la_empresa() and (flota_mi_rol() = 'admin' or solicitado_por = auth.uid()));

drop policy if exists "crear ticket" on flota_tickets;
create policy "crear ticket" on flota_tickets
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario')
              and solicitado_por = auth.uid() and estatus = 'abierto');

drop policy if exists "admin actualiza ticket" on flota_tickets;
create policy "admin actualiza ticket" on flota_tickets
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- folio automatico legible: TK-000001, TK-000002...
create sequence if not exists flota_tickets_folio_seq;
create or replace function flota_folio_ticket()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'TK-' || lpad(nextval('flota_tickets_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists flota_tickets_folio on flota_tickets;
create trigger flota_tickets_folio before insert on flota_tickets
  for each row execute function flota_folio_ticket();

-- ---------------------------------------------------------------------
-- 2. Servicios (historial de mantenimiento por unidad)
-- ---------------------------------------------------------------------
create table if not exists flota_servicios (
  id              bigint generated always as identity primary key,
  vehiculo_id     bigint not null references flota_vehiculos(id) on delete cascade,
  fecha           date not null default current_date,
  tipo            text not null default 'preventivo' check (tipo in ('preventivo', 'correctivo')),
  concepto        text not null,
  descripcion     text,
  taller          text,
  km              numeric(10, 1),
  mano_obra       numeric(12, 2) not null default 0,
  refacciones     numeric(12, 2) not null default 0,
  registrado_por  uuid references perfiles(id) on delete set null,
  creado_en       timestamptz not null default now()
);

alter table flota_servicios enable row level security;

drop policy if exists "lectura aprobados" on flota_servicios;
create policy "lectura aprobados" on flota_servicios
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_servicios;
create policy "admin escribe" on flota_servicios
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

commit;
