import { supabase } from './supabase';

const BUCKET = 'mantenimiento';

/** Sube un archivo y regresa la ruta guardada (no la URL — el bucket es privado). */
export async function subirArchivo(archivo, carpeta) {
  const ext = archivo.name.split('.').pop();
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { upsert: false });
  if (error) throw error;
  return ruta;
}

/** Genera una URL temporal (1 hora) para ver/descargar un archivo privado. */
export async function urlFirmada(ruta, segundos = 3600) {
  if (!ruta) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, segundos);
  if (error) return null;
  return data.signedUrl;
}

export async function borrarArchivo(ruta) {
  if (!ruta) return;
  await supabase.storage.from(BUCKET).remove([ruta]);
}

export const TIPOS_ACEPTADOS = 'image/*,.pdf';
export const TAMANO_MAXIMO_MB = 10;
