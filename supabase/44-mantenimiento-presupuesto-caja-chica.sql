-- =====================================================================
-- MANTENIMIENTO — presupuesto real (sin contar lo rechazado/pendiente)
-- y comprobacion de caja chica (paso 6 del rediseno del modulo).
--
-- No se agrega una columna "comprometido" a presupuestos (el plan
-- aprobado la proponia, pero ya existe el mismo patron sin ella: el
-- "disponible" de Dashboard/Sucursales/SucursalDetalle ya se calcula
-- en el cliente sumando gastos, nunca se guarda). Se mantiene ese
-- mismo criterio: "comprometido" = gastos con estatus_pago='aprobado'
-- (autorizados, aun no pagados) y "gastado" = 'pagado'. Los de
-- 'borrador'/'a_enviar'/'rechazado' dejan de contar -- hoy SI contaban,
-- lo cual era un hueco real (un gasto rechazado seguia viendose como
-- gastado).
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- (requiere haber corrido antes 39, 40, 41, 42 y 43)
-- =====================================================================

begin;

alter table gastos
  add column if not exists comprobante_path text,
  add column if not exists comprobado_en timestamptz;

commit;
