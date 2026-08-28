-- =====================================================================
-- FLOTAS — fase 3: Costos (gastos por unidad, presupuesto y caja chica)
-- y Combustible (cajon semanal, cargas extra, tags, importacion CSV).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Cajon de combustible (carga semanal fija) por unidad
-- ---------------------------------------------------------------------
alter table flota_vehiculos
  add column if not exists cajon_pesos  numeric(10, 2) not null default 0,
  add column if not exists cajon_litros numeric(10, 2) not null default 0;

-- ---------------------------------------------------------------------
-- 2. Gastos (mantenimiento/reparacion/gasolina/tag/multa/siniestro/admin)
--    Mantenimiento y Reparacion afectan el presupuesto mensual (si no son
--    caja chica). El resto es solo operacion, no descuenta presupuesto.
-- ---------------------------------------------------------------------
create table if not exists flota_gastos (
  id              bigint generated always as identity primary key,
  vehiculo_id     bigint not null references flota_vehiculos(id) on delete cascade,
  categoria       text not null
                  check (categoria in ('Mantenimiento', 'Reparación', 'Gasolina', 'Tag', 'Multa', 'Siniestro', 'Administrativo')),
  monto           numeric(12, 2) not null,
  litros          numeric(10, 2),
  fecha           date not null default current_date,
  mes             text generated always as (to_char(fecha, 'YYYY-MM')) stored,
  descripcion     text,
  caja_chica      boolean not null default false,
  estatus         text not null default 'aprobado'
                  check (estatus in ('por_aprobar', 'aprobado', 'rechazado')),
  origen          text not null default 'manual'
                  check (origen in ('manual', 'extra', 'tag', 'combustible')),
  referencia      text,   -- dedupe de importacion de combustible (folio o fecha|placas|importe)
  registrado_por  uuid references perfiles(id) on delete set null,
  creado_en       timestamptz not null default now()
);

create unique index if not exists flota_gastos_combustible_ref
  on flota_gastos (referencia) where origen = 'combustible';

alter table flota_gastos enable row level security;

drop policy if exists "lectura aprobados" on flota_gastos;
create policy "lectura aprobados" on flota_gastos
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "crear gasto" on flota_gastos;
create policy "crear gasto" on flota_gastos
  for insert to authenticated
  with check (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario')
              and registrado_por = auth.uid());

drop policy if exists "admin actualiza gasto" on flota_gastos;
create policy "admin actualiza gasto" on flota_gastos
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

drop policy if exists "admin borra gasto" on flota_gastos;
create policy "admin borra gasto" on flota_gastos
  for delete to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- 3. Presupuesto mensual + caja chica (config unica de Flotas)
-- ---------------------------------------------------------------------
create table if not exists flota_presupuesto (
  id                  boolean primary key default true check (id),
  presupuesto_mensual numeric(12, 2) not null default 0,
  caja_chica          numeric(12, 2) not null default 0,
  actualizado_en      timestamptz not null default now()
);
insert into flota_presupuesto (id) values (true) on conflict (id) do nothing;

alter table flota_presupuesto enable row level security;

drop policy if exists "lectura aprobados" on flota_presupuesto;
create policy "lectura aprobados" on flota_presupuesto
  for select to authenticated
  using (es_de_la_empresa() and flota_mi_rol() in ('admin', 'gerente', 'usuario'));

drop policy if exists "admin escribe" on flota_presupuesto;
create policy "admin escribe" on flota_presupuesto
  for update to authenticated
  using (es_de_la_empresa() and flota_mi_rol() = 'admin')
  with check (es_de_la_empresa() and flota_mi_rol() = 'admin');

commit;
