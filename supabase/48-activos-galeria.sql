-- =====================================================================
-- ACTIVOS — galeria de fotos (hasta 3 por activo).
--
-- Separada de la "foto" de portada que ya existia (activos.foto_path,
-- sigue igual, es la miniatura de la lista). Esta es una galeria
-- aparte para documentar el estado del equipo con varias tomas. El
-- limite de 3 se aplica en la pantalla (como ya se hace con otros
-- limites de este tipo en el portal), no con una restriccion de base
-- de datos.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create table if not exists activos_fotos (
  id            bigint generated always as identity primary key,
  activo_id     bigint not null references activos(id) on delete cascade,
  archivo_path  text not null,
  creado_por    uuid references perfiles(id) on delete set null,
  creado_en     timestamptz not null default now()
);

create index if not exists activos_fotos_activo on activos_fotos (activo_id);

alter table activos_fotos enable row level security;

drop policy if exists "lectura empresa" on activos_fotos;
create policy "lectura empresa" on activos_fotos
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "gestionar foto" on activos_fotos;
create policy "gestionar foto" on activos_fotos
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'))
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

commit;
