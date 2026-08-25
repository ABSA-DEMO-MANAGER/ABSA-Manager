-- =====================================================================
-- Agrega "tipo de falla" a las órdenes correctivas.
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

alter table ordenes add column if not exists tipo_falla text;
