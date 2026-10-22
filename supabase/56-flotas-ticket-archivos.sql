-- =====================================================================
-- FLOTAS — archivos adjuntos al crear un ticket (foto del problema,
-- documento, etc.). Quien levanta el ticket puede subir varios; se
-- suman a lo que ya existia (flota_servicio_archivos para el
-- mantenimiento, archivo_cierre_path para la evidencia de cierre).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 55-flotas-roles-especializados.sql)
-- =====================================================================

begin;

create table if not exists flota_ticket_archivos (
  id            bigint generated always as identity primary key,
  ticket_id     bigint not null references flota_tickets(id) on delete cascade,
  archivo_path  text not null,
  creado_por    uuid references perfiles(id) on delete set null,
  creado_en     timestamptz not null default now()
);

create index if not exists flota_ticket_archivos_ticket on flota_ticket_archivos (ticket_id);

alter table flota_ticket_archivos enable row level security;

-- Lectura: quien ya puede ver ese ticket (admin/admin_flotas, o el
-- propio solicitante/su equipo) -- mismo criterio que flota_tickets.
drop policy if exists "lectura segun ticket" on flota_ticket_archivos;
create policy "lectura segun ticket" on flota_ticket_archivos
  for select to authenticated
  using (es_de_la_empresa() and exists (
    select 1 from flota_tickets t where t.id = ticket_id
      and (flota_es_admin_general_o_flotas()
           or t.solicitado_por = auth.uid()
           or t.solicitado_por in (select perfil_id from flota_equipo_de(auth.uid())))
  ));

-- Insertar: quien levanto el ticket (al crearlo) o un administrador.
drop policy if exists "agregar archivo" on flota_ticket_archivos;
create policy "agregar archivo" on flota_ticket_archivos
  for insert to authenticated
  with check (es_de_la_empresa() and exists (
    select 1 from flota_tickets t where t.id = ticket_id
      and (flota_es_admin_general_o_flotas() or t.solicitado_por = auth.uid())
  ));

commit;
