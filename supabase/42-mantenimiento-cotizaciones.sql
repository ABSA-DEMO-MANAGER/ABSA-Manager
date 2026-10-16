-- =====================================================================
-- MANTENIMIENTO — cotizaciones comparables por orden (paso 4 del
-- rediseno del modulo).
--
-- Antes solo existia un contador (gastos.cotizaciones) + un archivo
-- representativo. Ahora cada propuesta es su propia fila: proveedor,
-- monto, vigencia, tiempo de entrega, garantia y si cumple el
-- alcance. La recomendacion es "la de menor precio entre las que
-- cumplen alcance" (no el puntaje de 5 criterios del documento --
-- "cumplimiento tecnico" y "garantia" son juicios cualitativos que no
-- se pueden calcular solos; ver el plan aprobado).
--
-- El umbral de "$1500 -> exige 3 cotizaciones o excepcion" queda
-- hardcodeado por ahora (coincide con la decision ya aprobada en el
-- documento, seccion 16); se vuelve configurable en el paso 7.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 39, 40 y 41)
-- =====================================================================

begin;

create table if not exists cotizaciones (
  id                bigint generated always as identity primary key,
  orden_id          bigint not null references ordenes(id) on delete cascade,
  proveedor_id      bigint references proveedores(id) on delete set null,
  proveedor_nombre  text,
  monto             numeric(12,2) not null,
  iva               numeric(12,2),
  total             numeric(12,2) not null,
  vigencia          date,
  tiempo_entrega    text,
  garantia          text,
  forma_pago        text,
  cumple_alcance    boolean not null default true,
  observaciones     text,
  archivo_path      text,
  creado_por        uuid references perfiles(id) on delete set null,
  creado_en         timestamptz not null default now(),
  constraint cotizaciones_proveedor_check check (proveedor_id is not null or proveedor_nombre is not null)
);

create index if not exists cotizaciones_orden on cotizaciones (orden_id);

alter table ordenes
  add column if not exists cotizacion_excepcion text
    check (cotizacion_excepcion in ('emergencia_p1', 'proveedor_unico', 'garantia_vigente',
                                    'contrato_autorizado', 'falta_respuesta',
                                    'especialidad_sin_oferta', 'continuidad_trabajo')),
  add column if not exists cotizacion_excepcion_motivo text;

alter table cotizaciones enable row level security;

drop policy if exists "lectura empresa" on cotizaciones;
create policy "lectura empresa" on cotizaciones
  for select to authenticated using (es_de_la_empresa());

drop policy if exists "gestionar cotizacion" on cotizaciones;
create policy "gestionar cotizacion" on cotizaciones
  for all to authenticated
  using (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'))
  with check (es_de_la_empresa() and mi_rol() in ('admin', 'usuario'));

commit;
