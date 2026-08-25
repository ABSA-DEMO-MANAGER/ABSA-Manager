-- =====================================================================
-- Ajuste: solo admin/coordinador pueden subir o modificar archivos.
-- Cualquier usuario de la empresa puede seguir viéndolos (para
-- descargar un comprobante desde el celular, por ejemplo).
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- =====================================================================

drop policy if exists "mantenimiento escritura" on storage.objects;
create policy "mantenimiento escritura" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mantenimiento' and es_de_la_empresa()
              and mi_rol() in ('admin','coordinador'));

drop policy if exists "mantenimiento actualiza" on storage.objects;
create policy "mantenimiento actualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'mantenimiento' and es_de_la_empresa()
         and mi_rol() in ('admin','coordinador'));
