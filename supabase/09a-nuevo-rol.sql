-- =====================================================================
-- PASO 1 de 2. Ejecutar ESTE ARCHIVO SOLO, esperar a que diga Success,
-- y DESPUES correr 09b-usuarios-y-presupuesto-mensual.sql en una
-- consulta nueva. No los pegues juntos: Postgres no permite usar un
-- valor de enum nuevo en la misma transaccion en que se crea.
-- =====================================================================

alter type rol_usuario add value if not exists 'usuario';
