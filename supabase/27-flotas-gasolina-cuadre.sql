-- =====================================================================
-- FLOTAS — mejoras a la solicitud de gasolina:
--  1. Rendimiento (km/litro) por unidad, para poder estimar consumo.
--  2. Precio de la gasolina (config unica que actualiza el admin).
--  3. La solicitud ahora pide si es ida y vuelta y cuantos litros se
--     piden; el sistema calcula el costo estimado con el precio
--     vigente al momento de enviarla (se guarda como foto del
--     momento, no cambia si despues cambia el precio).
--
-- El "cuadre" (comparar litros pedidos vs. distancia + 5km/dia de
-- viaje / rendimiento de la unidad) se calcula en la app al momento
-- de revisar la solicitud — no requiere nada mas en la base de datos.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- 1. Rendimiento del vehiculo
alter table flota_vehiculos
  add column if not exists rendimiento_km_l numeric(6, 2);

-- 2. Precio de la gasolina (config unica)
create table if not exists flota_precio_combustible (
  id              boolean primary key default true check (id),
  precio_litro    numeric(8, 2) not null default 0,
  actualizado_en  timestamptz not null default now()
);
insert into flota_precio_combustible (id) values (true) on conflict (id) do nothing;

alter table flota_precio_combustible enable row level security;

drop policy if exists "lectura aprobados" on flota_precio_combustible;
create policy "lectura aprobados" on flota_precio_combustible
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'director', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_precio_combustible;
create policy "admin escribe" on flota_precio_combustible
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- 3. Ida y vuelta + litros solicitados + costo estimado
alter table flota_gasolina_solicitudes
  add column if not exists ida_y_vuelta        boolean not null default false,
  add column if not exists litros_solicitados  numeric(8, 2),
  add column if not exists monto_estimado      numeric(10, 2);

commit;
