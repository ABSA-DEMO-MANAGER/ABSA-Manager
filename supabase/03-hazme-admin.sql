-- =====================================================================
-- Ejecutar AL FINAL, despues de:
--   1. correr 01-schema.sql y 02-datos.sql
--   2. entrar al portal al menos una vez (ahi se crea tu perfil)
--
-- Sin esto tu usuario queda como "consulta" y no puede capturar nada.
-- =====================================================================

update perfiles
set rol = 'admin'
where id = (select id from auth.users
            where email = 'calejandro.garza@grupoabsa.com');

-- Verifica que quedo bien (debe decir admin):
select p.nombre, u.email, p.rol
from perfiles p
join auth.users u on u.id = p.id;

-- ---------------------------------------------------------------------
-- Si el update no afecto ninguna fila, es porque todavia no has entrado
-- al portal. Entra primero, recarga, y vuelve a correr esto.
-- ---------------------------------------------------------------------

-- Para dar de alta a tu equipo (que primero creen su cuenta en el portal):
--
--   update perfiles set rol = 'coordinador'
--   where id = (select id from auth.users where email = 'persona@grupoabsa.com');
--
-- Roles:
--   admin       — todo
--   coordinador — captura gastos, ordenes, activos, presupuesto
--   tecnico     — solo cierra ordenes de trabajo
--   consulta    — solo lectura
