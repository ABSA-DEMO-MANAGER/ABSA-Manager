import { fechaCorta } from '../lib/format';
import { Card, Badge } from './ui';

const CAMPO_IGNORADO = new Set(['id', 'creado_en']);
const CAMPO_LABEL = {
  codigo: 'Código', ciudad_id: 'Ciudad', marca: 'Marca', modelo: 'Modelo', anio: 'Año',
  tipo: 'Tipo', motor: 'Motor', color: 'Color', placas: 'Placas', vin: 'VIN',
  propiedad: 'Propiedad', estado: 'Estado', km: 'Kilometraje', valor: 'Valor',
  conductor_nombre: 'Conductor', conductor_telefono: 'Teléfono', conductor_correo: 'Correo',
  conductor_licencia: 'Licencia', licencia_vence: 'Vence licencia',
  puesto: 'Puesto', departamento: 'Departamento', jefe_directo: 'Jefe directo', tipo_prestacion: 'Tipo de prestación',
  proximo_servicio_km: 'Próximo servicio (km)', proximo_servicio_fecha: 'Próximo servicio (fecha)',
  notas: 'Notas', cajon_pesos: 'Cajón (pesos)', cajon_litros: 'Cajón (litros)',
};

function diffCampos(antes, despues) {
  if (!antes || !despues) return [];
  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const out = [];
  campos.forEach((campo) => {
    if (CAMPO_IGNORADO.has(campo)) return;
    const a = antes[campo], b = despues[campo];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ campo: CAMPO_LABEL[campo] || campo, antes: a, despues: b });
    }
  });
  return out;
}

/** Bitácora de altas/ediciones/bajas de una unidad. Se usa tanto en
 * UnidadDetalle.jsx (equipo de Flotas) como en MiUnidad.jsx (el
 * conductor viendo su propia unidad) -- misma presentación en ambas. */
export default function BitacoraVehiculo({ bitacora, personaById }) {
  if (!bitacora?.length) return null;
  return (
    <div>
      <h2 className="mb-2 text-base font-semibold tracking-tight">Bitácora de cambios</h2>
      <div className="space-y-2">
        {bitacora.map((b) => (
          <Card key={b.id} className="!p-3 sm:!p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge color={b.accion === 'baja' ? 'var(--critical)' : b.accion === 'alta' ? 'var(--good)' : 'var(--series-1)'}>
                {b.accion === 'alta' ? 'Alta' : b.accion === 'baja' ? 'Baja' : 'Edición'}
              </Badge>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {fechaCorta(b.creado_en?.slice(0, 10))} {new Date(b.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                {' · '}{personaById[b.hecho_por]?.nombre ?? 'Administrador General'}
              </span>
            </div>
            {b.accion === 'edicion' ? (
              <ul className="space-y-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {diffCampos(b.antes, b.despues).map(({ campo, antes, despues }) => (
                  <li key={campo}><strong>{campo}</strong>: {String(antes ?? '—')} → {String(despues ?? '—')}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {b.accion === 'alta' ? 'Unidad dada de alta.' : 'Unidad dada de baja.'}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
