-- =====================================================================
-- MANTENIMIENTO — diagnostico, alcance, prioridad real y evidencia
-- antes/despues en Ordenes (paso 3 del rediseno del modulo).
--
-- "prioridad" ya existia en ordenes pero nunca se usaba desde la app
-- (columna de texto libre, siempre null) -- se reutiliza y se limita
-- a P1-P4 en vez de agregar una columna nueva.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 39 y 40)
-- =====================================================================

begin;

alter table ordenes
  add column if not exists diagnostico text,
  add column if not exists alcance text,
  add column if not exists fecha_compromiso date,
  add column if not exists requiere_proveedor boolean not null default false;

alter table ordenes drop constraint if exists ordenes_prioridad_check;
alter table ordenes add constraint ordenes_prioridad_check
  check (prioridad is null or prioridad in ('P1', 'P2', 'P3', 'P4'));

create table if not exists ordenes_evidencias (
  id           bigint generated always as identity primary key,
  orden_id     bigint not null references ordenes(id) on delete cascade,
  momento      text not null check (momento in ('antes', 'despues')),
  archivo_path text not null,
  creado_por   uuid references perfiles(id) on delete set null,
  creado_en    timestamptz not null default now()
);

create index if not exists ordenes_evidencias_orden on ordenes_evidencias (orden_id, momento);

alter table ordenes_evidencias enable row level security;

drop policy if exists "lectura empresa" on ordenes_evidencias;
create policy "lectura empresa" on ordenes_evidencias
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "agregar evidencia" on ordenes_evidencias;
create policy "agregar evidencia" on ordenes_evidencias
  for insert to authenticated
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

commit;
