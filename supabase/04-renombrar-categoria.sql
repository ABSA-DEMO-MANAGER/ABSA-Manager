-- =====================================================================
-- Renombra "Aire Acondicionado" a "Climatización".
-- Los 55 equipos ya asignados a esa categoría se actualizan solos
-- (el nombre vive en la categoría, no en cada activo).
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

update categorias
set nombre = 'Climatización'
where nombre = 'Aire Acondicionado';

-- Verifica que quedo bien:
select id, nombre, orden from categorias order by orden;
