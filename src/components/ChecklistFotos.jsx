export const PUNTOS_UNIDAD = ['Puertas delante', 'Puertas detrás', 'Espejos', 'Interiores', 'Otras'];

export const fotosVaciasUnidad = () => Object.fromEntries(PUNTOS_UNIDAD.map((p) => [p, []]));
export const cuentaFotosUnidad = (f) => Object.values(f).reduce((a, arr) => a + arr.length, 0);

export default function ChecklistFotos({ valor, onChange, puntos = PUNTOS_UNIDAD }) {
  function agregar(punto, fileList) {
    const nuevos = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!nuevos.length) return;
    onChange({ ...valor, [punto]: [...valor[punto], ...nuevos] });
  }
  function quitar(punto, i) {
    onChange({ ...valor, [punto]: valor[punto].filter((_, idx) => idx !== i) });
  }
  return (
    <div className="space-y-3">
      {puntos.map((punto) => (
        <div key={punto}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{punto}</span>
            <label className="cursor-pointer text-xs underline" style={{ color: 'var(--series-1)' }}>
              + Fotos
              <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                     onChange={(e) => { agregar(punto, e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          {valor[punto].length > 0 && (
            <div className="flex flex-wrap gap-2">
              {valor[punto].map((file, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(file)} alt="" className="h-14 w-14 rounded-lg border object-cover"
                       style={{ borderColor: 'var(--border)' }} />
                  <button type="button" onClick={() => quitar(punto, i)}
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
                          style={{ background: 'var(--critical)' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
