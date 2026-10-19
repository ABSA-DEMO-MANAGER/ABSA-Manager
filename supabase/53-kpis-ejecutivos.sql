-- =====================================================================
-- TABLERO DE KPIs EJECUTIVOS (punto 4 de la recomendacion para el Plan
-- de Trabajo de 90 dias).
--
-- De los 6 KPIs del documento, 5 se calculan solos a partir de datos
-- que ya existen (cumplimiento preventivo, cumplimiento de atencion,
-- reduccion del rezago, indice de orden, control presupuestal). El
-- sexto -- "ahorro validado" -- se deja fuera (punto 5, requiere una
-- decision tuya sobre como guardar un precio base de referencia).
--
-- "Reduccion del rezago" necesita un numero que nadie puede calcular
-- solo: cuantos pendientes habia el dia 0 del plan. Se agrega
-- rezago_inicial en mantenimiento_config para que lo captures una vez
-- a mano (Configuracion).
--
-- "Indice de orden" (instalaciones 40% + documentos 30% + portal 30%)
-- es una evaluacion visual/subjetiva -- nadie puede calcular solo si
-- las instalaciones estan limpias o si falta identificacion de
-- riesgos. Se guarda como captura manual periodica (una fila por
-- medicion), no como algo que el sistema deduce de otras tablas.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 45-mantenimiento-config.sql)
-- =====================================================================

begin;

alter table mantenimiento_config add column if not exists rezago_inicial integer;

create table if not exists mantenimiento_indice_orden (
  id             bigint generated always as identity primary key,
  fecha          date not null default current_date,
  instalaciones  numeric(5,2) not null check (instalaciones between 0 and 100),
  documentos     numeric(5,2) not null check (documentos between 0 and 100),
  portal         numeric(5,2) not null check (portal between 0 and 100),
  notas          text,
  creado_por     uuid references perfiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);

alter table mantenimiento_indice_orden enable row level security;

drop policy if exists "lectura empresa" on mantenimiento_indice_orden;
create policy "lectura empresa" on mantenimiento_indice_orden
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "admin captura indice" on mantenimiento_indice_orden;
create policy "admin captura indice" on mantenimiento_indice_orden
  for insert to authenticated
  with check (es_de_la_empresa() and mi_rol() = 'admin');

commit;
