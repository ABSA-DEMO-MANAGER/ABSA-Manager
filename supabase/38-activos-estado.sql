-- =====================================================================
-- MANTENIMIENTO — estado del activo: indica si funciona, funciona con
-- fallas, o no funciona. Solo el administrador lo edita directamente
-- (igual que el resto de los campos de activos); un usuario normal lo
-- propone a traves de activos_cambios, como ya pasa con los demas
-- campos.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

alter table activos
  add column if not exists estado text not null default 'activo'
  check (estado in ('activo', 'con_fallas', 'inactivo'));
