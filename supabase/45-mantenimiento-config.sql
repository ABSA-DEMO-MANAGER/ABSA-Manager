-- =====================================================================
-- MANTENIMIENTO — configuracion admin de montos (paso 7 del rediseno
-- del modulo).
--
-- Antes "sin autorizacion hasta $500" y "3 cotizaciones arriba de
-- $1500" estaban hardcodeados en el codigo (Plan.jsx, Gastos.jsx) Y
-- en la policy de gastos (con el valor 500 escrito literal). Ahora
-- viven en una sola fila de configuracion editable por un admin desde
-- el portal; la policy de gastos pasa a leer ese valor en vez del
-- literal, asi que esto no es solo cosmetico -- cambia la regla real
-- que la base de datos aplica, no solo lo que la pantalla sugiere.
--
-- Lo que SI queda fuera de este paso (no existe la logica que
-- consumiria estos valores, asi que agregarlos seria decorativo):
--   - Limites de caja chica por evento / emergencia: hoy el fondo de
--     caja chica es un monto por sucursal/año que un admin asigna a
--     mano (tabla caja_chica) -- no hay un tope por gasto individual
--     en el codigo.
--   - Tiempos de atencion/contencion por prioridad (SLA): fecha
--     compromiso hoy se escribe a mano por orden, no se calcula sola
--     a partir de la prioridad.
-- Ambos quedan en "paso 2": no tiene sentido exponer un campo que
-- nada en el sistema todavia respeta.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 39, 40, 41, 42 y 43)
-- =====================================================================

begin;

create table if not exists mantenimiento_config (
  id                        bigint primary key default 1 check (id = 1),
  monto_sin_autorizacion    numeric(12,2) not null default 500,
  monto_tres_cotizaciones   numeric(12,2) not null default 1500,
  actualizado_por           uuid references perfiles(id) on delete set null,
  actualizado_en            timestamptz not null default now()
);

insert into mantenimiento_config (id) values (1) on conflict (id) do nothing;

alter table mantenimiento_config enable row level security;

drop policy if exists "lectura empresa" on mantenimiento_config;
create policy "lectura empresa" on mantenimiento_config
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "admin edita config" on mantenimiento_config;
create policy "admin edita config" on mantenimiento_config
  for update to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

create or replace function mantenimiento_monto_sin_autorizacion()
returns numeric language sql stable security definer set search_path = public as $$
  select monto_sin_autorizacion from mantenimiento_config where id = 1
$$;

grant execute on function mantenimiento_monto_sin_autorizacion() to authenticated;

-- Reemplaza la policy del paso 5: el "500" literal pasa a ser el
-- valor configurado (por defecto sigue siendo 500 hasta que un admin
-- lo cambie).
drop policy if exists "escritura gestion" on gastos;
create policy "escritura gestion" on gastos
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'))
  with check (
    es_de_la_empresa() and mi_rol() in ('admin', 'usuario')
    and (monto <= mantenimiento_monto_sin_autorizacion()
         or estatus_pago not in ('aprobado', 'pagado', 'rechazado')
         or tiene_autorizacion('gastos', monto))
  );

commit;
