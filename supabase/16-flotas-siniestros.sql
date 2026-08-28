-- =====================================================================
-- FLOTAS — fase 4: Siniestros y multas.
--
-- Cualquier rol aprobado reporta un siniestro/multa de su unidad; el
-- admin de Flotas lo gestiona (aseguradora, poliza, montos, estatus) y
-- opcionalmente registra el costo en Costos (flota_gastos) con un clic.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create table if not exists flota_siniestros (
  id                 bigint generated always as identity primary key,
  folio              text unique,
  vehiculo_id        bigint not null references flota_vehiculos(id) on delete cascade,
  tipo               text not null check (tipo in ('Siniestro', 'Multa')),
  clasificacion      text,     -- Colision, Volcadura... / Exceso de velocidad, Estacionamiento...
  gravedad           text check (gravedad in ('Leve', 'Moderado', 'Grave')),
  fecha              date not null default current_date,
  ubicacion          text,
  conductor          text,
  descripcion        text not null,
  monto              numeric(12, 2) not null default 0,   -- importe si es multa
  estatus            text not null default 'reportado'
                     check (estatus in ('reportado', 'en_proceso', 'cerrado', 'rechazado')),
  motivo_rechazo     text,
  aseguradora        text,
  poliza             text,
  costo_reparacion   numeric(12, 2) not null default 0,
  cubierto_seguro    numeric(12, 2) not null default 0,
  deducible          numeric(12, 2) not null default 0,
  absorbido_empresa  numeric(12, 2) not null default 0,
  gasto_registrado   boolean not null default false,
  reportado_por      uuid references perfiles(id) on delete set null,
  creado_en          timestamptz not null default now()
);

alter table flota_siniestros enable row level security;

drop policy if exists "lectura propios o admin" on flota_siniestros;
create policy "lectura propios o admin" on flota_siniestros
  for select to authenticated
  using (es_de_la_empresa() and (flota_mi_rol() = 'admin' or reportado_por = auth.uid()));

drop policy if exists "reportar siniestro" on flota_siniestros;
create policy "reportar siniestro" on flota_siniestros
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario')
              and reportado_por = auth.uid() and estatus = 'reportado');

drop policy if exists "admin gestiona siniestro" on flota_siniestros;
create policy "admin gestiona siniestro" on flota_siniestros
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- folio automatico legible: SN-000001, SN-000002...
create sequence if not exists flota_siniestros_folio_seq;
create or replace function flota_folio_siniestro()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'SN-' || lpad(nextval('flota_siniestros_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists flota_siniestros_folio on flota_siniestros;
create trigger flota_siniestros_folio before insert on flota_siniestros
  for each row execute function flota_folio_siniestro();

commit;
