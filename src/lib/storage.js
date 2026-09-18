import { supabase } from './supabase';

const BUCKET = 'mantenimiento';

/**
 * Redimensiona y recomprime una imagen antes de subirla (las fotos de
 * celular pueden pesar varios MB; sin esto, cada vez que alguien ve
 * una foto se vuelve a transmitir ese peso completo — es lo que agotó
 * la cuota de "Cached Egress" de Supabase). PDFs y archivos que no son
 * imagen se suben tal cual. Si algo falla al comprimir, se sube el
 * archivo original para no bloquear al usuario.
 */
async function comprimirImagen(archivo, maxAncho = 1600, calidad = 0.75) {
  if (!archivo.type?.startsWith('image/') || archivo.type === 'image/svg+xml') return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, maxAncho / bitmap.width);
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = ancho; canvas.height = alto;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', calidad));
    if (!blob || blob.size >= archivo.size) return archivo; // si no ayudó, mejor el original

    const nombre = archivo.name.replace(/\.\w+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg' });
  } catch {
    return archivo;
  }
}

/** Sube un archivo (comprimiendo primero si es imagen) y regresa la ruta guardada (no la URL — el bucket es privado). */
export async function subirArchivo(archivo, carpeta) {
  const listo = await comprimirImagen(archivo);
  const ext = listo.name.split('.').pop();
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, listo, { upsert: false });
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
