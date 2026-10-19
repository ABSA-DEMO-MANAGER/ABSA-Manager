-- =====================================================================
-- CAJA CHICA — tope por evento ($1,500) y por emergencia ($3,000)
-- (punto 3 de la recomendacion para el Plan de Trabajo de 90 dias).
--
-- Antes solo existia el umbral de "a partir de aqui se autoriza desde
-- Aprobaciones" ($500, configurable desde el paso 7). Esto es otra
-- regla, independiente: un gasto de caja chica NUNCA puede superar
-- $1,500 (o $3,000 si se marca como emergencia), sin importar quien lo
-- autorice -- es un tope duro, no una autorizacion.
--
-- Se implementa como policy RESTRICTIVE, no como CHECK constraint, y
-- solo para INSERT (no UPDATE). Con un CHECK constraint corriamos el
-- mismo riesgo que ya nos paso en la migracion 50: cualquier UPDATE a
-- futuro de una caja chica historica que ya superaba este tope (por
-- ejemplo, adjuntarle su comprobante) tronaria la validacion otra vez.
-- Con RESTRICTIVE + for insert, la regla solo se aplica al CREAR un
-- gasto de caja chica nuevo; lo que ya existe nunca se vuelve a
-- revisar por una edicion no relacionada.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 45-mantenimiento-config.sql)
-- =====================================================================

begin;

alter table mantenimiento_config
  add column if not exists caja_chica_limite_evento numeric(12,2) not null default 1500,
  add column if not exists caja_chica_limite_emergencia numeric(12,2) not null default 3000;

alter table gastos add column if not exists caja_chica_emergencia boolean not null default false;

create or replace function mantenimiento_limite_caja_chica(p_emergencia boolean)
returns numeric language sql stable security definer set search_path = public as $$
  select case when p_emergencia then caja_chica_limite_emergencia else caja_chica_limite_evento end
  from mantenimiento_config where id = 1
$$;

grant execute on function mantenimiento_limite_caja_chica(boolean) to authenticated;

drop policy if exists "limite caja chica al crear" on gastos;
create policy "limite caja chica al crear" on gastos
  as restrictive
  for insert to authenticated
  with check (unidad_pago <> 'caja_chica' or monto <= mantenimiento_limite_caja_chica(caja_chica_emergencia));

commit;
