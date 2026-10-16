-- =====================================================================
-- MANTENIMIENTO — encuesta de cierre (paso 8 del rediseno del modulo).
--
-- Cuando la orden que nacio de una solicitud queda "realizada", quien
-- levanto la solicitud puede calificar el cierre (1-5 + comentario
-- opcional). Una sola calificacion por orden. Solo el solicitante
-- original puede capturarla -- se valida con una funcion security
-- definer (es_solicitante_de_orden) en vez de un subquery correlacionado
-- directo en la policy, para evitar cualquier ambiguedad de nombres de
-- columna entre encuestas.orden_id y solicitudes.orden_id.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 39 y 40)
-- =====================================================================

begin;

create table if not exists encuestas (
  id            bigint generated always as identity primary key,
  orden_id      bigint not null unique references ordenes(id) on delete cascade,
  calificacion  smallint not null check (calificacion between 1 and 5),
  comentario    text,
  creado_por    uuid references perfiles(id) on delete set null,
  creado_en     timestamptz not null default now()
);

create or replace function es_solicitante_de_orden(p_orden_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from solicitudes
    where orden_id = p_orden_id and solicitado_por = auth.uid()
  )
$$;

grant execute on function es_solicitante_de_orden(bigint) to authenticated;

alter table encuestas enable row level security;

drop policy if exists "lectura empresa" on encuestas;
create policy "lectura empresa" on encuestas
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "solicitante califica" on encuestas;
create policy "solicitante califica" on encuestas
  for insert to authenticated
  with check (
    es_de_la_empresa()
    and creado_por = auth.uid()
    and es_solicitante_de_orden(orden_id)
  );

commit;
