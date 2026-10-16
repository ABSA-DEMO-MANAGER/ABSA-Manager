-- =====================================================================
-- MANTENIMIENTO — Autorizaciones + delegaciones (paso 5 del rediseno
-- del modulo).
--
-- Gastos mayores a $500 (umbral hardcodeado por ahora, igual que el
-- de cotizaciones; se vuelve configurable en el paso 7) ya no pueden
-- marcarse "aprobado"/"pagado"/"rechazado" libremente -- solo un
-- admin, o alguien con una delegacion vigente que alcance ese monto,
-- puede hacerlo. Gastos de $500 o menos siguen sin necesitar
-- autorizacion previa (coincide con la decision ya aprobada en el
-- documento: "Hasta $500: sin autorizacion individual previa").
--
-- NOTA: "ALTER TYPE ... ADD VALUE" no se puede usar en la misma
-- transaccion donde ademas se usa ese valor nuevo -- por eso esta
-- migracion va en dos bloques begin/commit separados.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 39, 40, 41 y 42)
-- =====================================================================

begin;
alter type estatus_pago add value if not exists 'rechazado';
commit;

begin;

create table if not exists delegaciones (
  id              bigint generated always as identity primary key,
  persona_id      uuid not null references perfiles(id) on delete cascade,
  tipo_operacion  text not null check (tipo_operacion in ('gastos', 'cotizaciones', 'solicitudes', 'todas')),
  monto_maximo    numeric(12,2),
  vigente_desde   date not null default current_date,
  vigente_hasta   date,
  notas           text,
  creado_por      uuid references perfiles(id) on delete set null,
  creado_en       timestamptz not null default now()
);

alter table delegaciones enable row level security;

drop policy if exists "lectura propia o admin" on delegaciones;
create policy "lectura propia o admin" on delegaciones
  for select to authenticated
  using (es_de_la_empresa() and (persona_id = auth.uid() or mi_rol() = 'admin'));

drop policy if exists "admin gestiona delegaciones" on delegaciones;
create policy "admin gestiona delegaciones" on delegaciones
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() = 'admin')
  with check (es_de_la_empresa() and mi_rol() = 'admin');

-- Verdadero si la persona actual puede autorizar una operacion de
-- este tipo y monto: es admin, o tiene una delegacion vigente que
-- alcanza el monto.
create or replace function tiene_autorizacion(p_tipo text, p_monto numeric)
returns boolean language sql stable security definer set search_path = public as $$
  select mi_rol() = 'admin' or exists (
    select 1 from delegaciones
    where persona_id = auth.uid()
      and tipo_operacion in (p_tipo, 'todas')
      and (monto_maximo is null or monto_maximo >= p_monto)
      and current_date >= vigente_desde
      and (vigente_hasta is null or current_date <= vigente_hasta)
  );
$$;

grant execute on function tiene_autorizacion(text, numeric) to authenticated;

alter table gastos
  add column if not exists autorizado_por uuid references perfiles(id) on delete set null,
  add column if not exists autorizado_en timestamptz,
  add column if not exists comentario_autorizacion text;

-- Reemplaza la policy de escritura de gastos (antes: admin o usuario,
-- sin restriccion) para exigir autorizacion al marcar un gasto mayor
-- a $500 como aprobado, pagado o rechazado.
drop policy if exists "escritura gestion" on gastos;
create policy "escritura gestion" on gastos
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'))
  with check (
    es_de_la_empresa() and mi_rol() in ('admin', 'usuario')
    and (monto <= 500 or estatus_pago not in ('aprobado', 'pagado', 'rechazado') or tiene_autorizacion('gastos', monto))
  );

commit;
