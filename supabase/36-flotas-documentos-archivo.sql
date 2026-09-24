-- =====================================================================
-- FLOTAS — permite adjuntar el archivo real de cada documento
-- (poliza, factura, tarjeta de circulacion, etc.), no solo su fecha y
-- referencia como hasta ahora.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

alter table flota_documentos
  add column if not exists archivo_path text;
