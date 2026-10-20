// Columnas del CSV de unidades de Flotas -- compartidas entre la
// plantilla de Carga masiva y la descarga del inventario real (deben
// coincidir exactamente para que un archivo descargado se pueda
// volver a subir tal cual).
export const COLUMNAS_UNIDAD = [
  'codigo', 'ciudad', 'marca', 'modelo', 'anio', 'tipo', 'version', 'motor', 'color', 'placas', 'vin', 'origen_placa',
  'propiedad', 'estado', 'km', 'valor', 'costo_poliza',
  'conductor_nombre', 'conductor_correo', 'conductor_telefono', 'conductor_licencia', 'licencia_vence',
  'puesto', 'departamento', 'area', 'jefe_directo', 'tipo_prestacion',
  'proximo_servicio_km', 'proximo_servicio_fecha', 'fecha_ultimo_servicio', 'notas',
  'verificacion_vence', 'seguro_vence', 'tenencia_vence', 'circulacion_vence', 'arrendadora', 'contrato_fin',
];

/** Dispara la descarga de un archivo CSV a partir de filas de texto (arreglo de arreglos). */
export function descargarCSV(nombreArchivo, filasTexto) {
  const csv = filasTexto.map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
