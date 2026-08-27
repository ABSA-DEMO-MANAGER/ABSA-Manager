-- =====================================================================
-- Agrega ciudad y cobertura (nacional/regional/local) a proveedores.
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cobertura_proveedor') then
    create type cobertura_proveedor as enum ('local', 'regional', 'nacional');
  end if;
end $$;

alter table proveedores add column if not exists ciudad text;
alter table proveedores add column if not exists cobertura cobertura_proveedor;
