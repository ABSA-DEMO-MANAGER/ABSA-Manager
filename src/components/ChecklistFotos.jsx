import { useState } from 'react';
import CamaraCaptura from './CamaraCaptura';

export const fotosVaciasUnidad = () => [];
export const cuentaFotosUnidad = (fotos) => fotos.length;

/** Fotos del estado de la unidad: una sola lista, sin categorias, tomadas con la camara en vivo. */
export default function ChecklistFotos({ valor, onChange }) {
  const [abierta, setAbierta] = useState(false);

  function agregar(archivo) {
    onChange([...valor, archivo]);
  }
  function quitar(i) {
    onChange(valor.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Adjunta fotos del frente, cofre, puertas delanteras y traseras, interiores, asientos,
        espejos, defensa trasera y cualquier detalle visible.
      </p>
      <button type="button" onClick={() => setAbierta(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white" style={{ background: 'var(--series-1)' }}>
        📷 Tomar fotos
      </button>
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {valor.map((file, i) => (
            <div key={i} className="relative">
              <img src={URL.createObjectURL(file)} alt="" className="h-16 w-16 rounded-lg border object-cover"
                   style={{ borderColor: 'var(--border)' }} />
              <button type="button" onClick={() => quitar(i)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
                      style={{ background: 'var(--critical)' }}>×</button>
            </div>
          ))}
        </div>
      )}
      <CamaraCaptura abierto={abierta} onCerrar={() => setAbierta(false)} onCapturar={agregar} />
    </div>
  );
}
