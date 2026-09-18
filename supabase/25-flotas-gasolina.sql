-- =====================================================================
-- FLOTAS — fase C: solicitudes de gasolina (viaje / carga extra) con
-- foto forzosa de kilometraje, calculo de distancia entre ciudades, y
-- tablero de aprobacion para el Administrador General.
--
-- El aviso de aprobado/rechazado NO se manda por servidor: se arma un
-- enlace "mailto:" prellenado (destinatario, asunto y cuerpo) que el
-- administrador abre y envia desde su propio correo — sin depender de
-- ningun servicio de correo externo.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Distancias entre ciudades (las captura el administrador; sin
--    esto el sistema no puede calcular km de un viaje, pero la
--    solicitud igual se puede registrar y aprobar)
-- ---------------------------------------------------------------------
create table if not exists flota_distancias (
  id             bigint generated always as identity primary key,
  ciudad_a_id    bigint not null references flota_ciudades(id) on delete cascade,
  ciudad_b_id    bigint not null references flota_ciudades(id) on delete cascade,
  km             numeric(8, 1) not null check (km > 0),
  creado_en      timestamptz not null default now(),
  check (ciudad_a_id < ciudad_b_id),
  unique (ciudad_a_id, ciudad_b_id)
);

alter table flota_distancias enable row level security;

drop policy if exists "lectura aprobados" on flota_distancias;
create policy "lectura aprobados" on flota_distancias
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_distancias;
create policy "admin escribe" on flota_distancias
  for all to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 2. Solicitudes de gasolina
-- ---------------------------------------------------------------------
create table if not exists flota_gasolina_solicitudes (
  id                 bigint generated always as identity primary key,
  folio              text unique,
  vehiculo_id        bigint not null references flota_vehiculos(id) on delete cascade,
  solicitante_id     uuid not null references perfiles(id) on delete cascade,
  motivo             text not null check (motivo in ('viaje', 'extra')),
  ciudad_origen_id   bigint references flota_ciudades(id) on delete set null,
  ciudad_destino_id  bigint references flota_ciudades(id) on delete set null,
  km_calculado       numeric(8, 1),
  fecha_inicio       date,
  fecha_regreso      date,
  notas              text,
  kilometraje        numeric(10, 1) not null,
  foto_km_path       text not null,
  estatus            text not null default 'pendiente' check (estatus in ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo     text,
  resuelto_por       uuid references perfiles(id) on delete set null,
  resuelto_en        timestamptz,
  creado_en          timestamptz not null default now()
);

alter table flota_gasolina_solicitudes enable row level security;

drop policy if exists "lectura segun equipo" on flota_gasolina_solicitudes;
create policy "lectura segun equipo" on flota_gasolina_solicitudes
  for select to authenticated
  using (es_de_la_empresa() and (
    flota_mi_rol() = 'admin'
    or solicitante_id = auth.uid()
    or solicitante_id in (select perfil_id from flota_equipo_de(auth.uid()))
  ));

drop policy if exists "crear solicitud" on flota_gasolina_solicitudes;
create policy "crear solicitud" on flota_gasolina_solicitudes
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario')
              and solicitante_id = auth.uid() and estatus = 'pendiente');

drop policy if exists "admin resuelve" on flota_gasolina_solicitudes;
create policy "admin resuelve" on flota_gasolina_solicitudes
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- folio automatico legible: GA-000001, GA-000002...
create sequence if not exists flota_gasolina_folio_seq;
create or replace function flota_folio_gasolina()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'GA-' || lpad(nextval('flota_gasolina_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists flota_gasolina_folio on flota_gasolina_solicitudes;
create trigger flota_gasolina_folio before insert on flota_gasolina_solicitudes
  for each row execute function flota_folio_gasolina();

commit;
