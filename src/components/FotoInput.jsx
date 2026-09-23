import { useState } from 'react';
import CamaraCaptura from './CamaraCaptura';

/**
 * Una sola foto, tomada con la camara en vivo -- nunca desde la
 * galeria. Reemplaza a <ArchivoInput accept="image/*"> en formularios
 * donde antes se podia elegir una foto ya guardada en el dispositivo.
 */
export function FotoInput({ value, onChange, className = '' }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className={className}>
      {value ? (
        <div className="flex items-center gap-3">
          <img src={URL.createObjectURL(value)} alt="" className="h-16 w-16 rounded-lg border object-cover"
               style={{ borderColor: 'var(--border)' }} />
          <button type="button" onClick={() => setAbierta(true)} className="text-xs underline" style={{ color: 'var(--series-1)' }}>
            Volver a tomar
          </button>
          <button type="button" onClick={() => onChange(null)} className="text-xs underline" style={{ color: 'var(--critical)' }}>
            Quitar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAbierta(true)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white" style={{ background: 'var(--series-1)' }}>
          📷 Tomar foto
        </button>
      )}
      <CamaraCaptura abierto={abierta} onCerrar={() => setAbierta(false)}
                     onCapturar={(archivo) => { onChange(archivo); setAbierta(false); }} />
    </div>
  );
}

/**
 * Foto (con camara) o PDF (comprobantes que a veces llegan como PDF
 * del proveedor). El PDF sigue siendo un selector de archivos normal,
 * pero solo acepta .pdf -- de ahi no se puede elegir una foto de la
 * galeria porque una foto de galeria nunca es un PDF.
 */
export function FotoOPdfInput({ value, onChange, className = '' }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState(null);
  const esPdf = value && value.type === 'application/pdf';

  function elegirPdf(archivo) {
    // El "accept" del input solo es una sugerencia -- el explorador de
    // archivos del sistema deja cambiar a "Todos los archivos" y elegir
    // cualquier cosa. Aqui se valida de verdad el contenido del archivo.
    const esRealmentePdf = archivo.type === 'application/pdf' || archivo.name.toLowerCase().endsWith('.pdf');
    if (!esRealmentePdf) {
      setError('Ese archivo no es un PDF. Si es una foto, usa "Tomar foto" con la cámara.');
      return;
    }
    setError(null);
    onChange(archivo);
  }

  return (
    <div className={className}>
      {error && <p className="mb-2 text-xs" style={{ color: 'var(--critical)' }}>{error}</p>}
      {value ? (
        <div className="flex items-center gap-3">
          {esPdf ? (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>📄 {value.name}</span>
          ) : (
            <img src={URL.createObjectURL(value)} alt="" className="h-16 w-16 rounded-lg border object-cover"
                 style={{ borderColor: 'var(--border)' }} />
          )}
          <button type="button" onClick={() => onChange(null)} className="text-xs underline" style={{ color: 'var(--critical)' }}>
            Quitar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setAbierta(true)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white" style={{ background: 'var(--series-1)' }}>
            📷 Tomar foto
          </button>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>o</span>
          <label className="cursor-pointer text-xs underline" style={{ color: 'var(--series-1)' }}>
            Subir PDF
            <input type="file" accept="application/pdf,.pdf" className="hidden"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) elegirPdf(f); e.target.value = ''; }} />
          </label>
        </div>
      )}
      <CamaraCaptura abierto={abierta} onCerrar={() => setAbierta(false)}
                     onCapturar={(archivo) => { onChange(archivo); setAbierta(false); }} />
    </div>
  );
}
