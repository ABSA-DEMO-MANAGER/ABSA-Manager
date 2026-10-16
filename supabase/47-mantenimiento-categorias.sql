-- =====================================================================
-- MANTENIMIENTO — catalogo real de categorias de activos.
--
-- Reemplaza las 13 categorias de la carga de datos de demostracion
-- (Electrico, Iluminacion, Estructural, Equipos Electricos, Aire
-- Acondicionado, Mobiliario, Hidraulico, Neumatico, Desagues,
-- Seguridad, Limpieza, Fumigacion, Vehiculos) por el catalogo real
-- que dio el cliente.
--
-- categoria_id en activos/planes/ordenes/solicitudes es "on delete
-- set null", asi que borrar las categorias viejas no borra ningun
-- activo/orden/plan/solicitud -- solo les quita la categoria que
-- tenian asignada. Si algo ya estaba categorizado con el catalogo
-- viejo, va a quedar "sin categoria" y hay que volver a asignarle una
-- del catalogo nuevo a mano desde la pantalla correspondiente.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

delete from categorias;

insert into categorias (nombre, orden) values
  ('Aire acondicionado', 1),
  ('Instalaciones eléctricas y alumbrado', 2),
  ('Plomería', 3),
  ('Mobiliario', 4),
  ('CCTV y alarmas', 5),
  ('Planta eléctrica y UPS', 6),
  ('Elevadores', 7),
  ('Puertas y accesos', 8),
  ('Obra civil', 9),
  ('Equipos de almacén', 10),
  ('Equipos y sistemas contra incendio', 11);

commit;
