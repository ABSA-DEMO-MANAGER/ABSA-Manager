-- =====================================================================
-- FLOTAS — arregla la bitacora al BORRAR una unidad.
--
-- El trigger intentaba guardar el registro de "Baja" apuntando al
-- vehiculo_id que acaba de eliminarse, lo cual viola la llave foranea
-- (no se puede insertar una referencia a una fila que ya no existe).
-- La info de la unidad borrada ya queda completa dentro del jsonb
-- "antes", asi que el registro de bitacora simplemente no necesita
-- vehiculo_id en ese caso.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

begin;

create or replace function flota_registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into flota_bitacora (vehiculo_id, accion, despues, hecho_por)
    values (new.id, 'alta', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into flota_bitacora (vehiculo_id, accion, antes, despues, hecho_por)
    values (new.id, 'edicion', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into flota_bitacora (vehiculo_id, accion, antes, hecho_por)
    values (null, 'baja', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

commit;
