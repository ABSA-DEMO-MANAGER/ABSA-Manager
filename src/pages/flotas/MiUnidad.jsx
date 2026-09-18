import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, fechaCorta } from '../../lib/format';
import { Card, Tabla, Cargando, Aviso, Badge, Stat, Boton } from '../../components/ui';

const ESTATUS_SOLICITUD = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const COLOR_SOLICITUD = { pendiente: 'var(--serious)', aprobada: 'var(--good)', rechazada: 'var(--critical)' };
const mesActual = () => new Date().toISOString().slice(0, 7);

export default function MiUnidad() {
  const navigate = useNavigate();
  const { flotaPerfil } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const vehiculoId = flotaPerfil?.vehiculo_asignado_id;

  async function cargar() {
    if (!vehiculoId) { setD({ sinUnidad: true }); return; }
    const [v, gastos, sol, serv, sin] = await Promise.all([
      supabase.from('flota_vehiculos').select('*').eq('id', vehiculoId).maybeSingle(),
      supabase.from('flota_gastos')
        .select('categoria, monto, litros, mes, estatus, origen')
        .eq('vehiculo_id', vehiculoId).eq('mes', mesActual()).eq('estatus', 'aprobado'),
      supabase.from('flota_gasolina_solicitudes')
        .select('id, folio, motivo, litros_solicitados, monto_estimado, monto_solicitado, estatus, motivo_rechazo, creado_en')
        .eq('vehiculo_id', vehiculoId).order('creado_en', { ascending: false }).limit(10),
      supabase.from('flota_servicios')
        .select('id, fecha, tipo, concepto, taller, km, mano_obra, refacciones')
        .eq('vehiculo_id', vehiculoId).order('fecha', { ascending: false }).limit(10),
      supabase.from('flota_siniestros')
        .select('id, folio, tipo, clasificacion, fecha, estatus, monto')
        .eq('vehiculo_id', vehiculoId).order('creado_en', { ascending: false }).limit(10),
    ]);
    const err = v.error || gastos.error || sol.error || serv.error || sin.error;
    if (err) { setError(err.message); return; }
    setD({ vehiculo: v.data, gastos: gastos.data, solicitudes: sol.data, servicios: serv.data, siniestros: sin.data });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [vehiculoId]);

  const consumoMes = useMemo(() => {
    const o = { gasP: 0, gasL: 0, tagP: 0 };
    (d?.gastos ?? []).forEach((g) => {
      if (g.categoria === 'Gasolina') { o.gasP += Number(g.monto); o.gasL += Number(g.litros || 0); }
      else if (g.categoria === 'Tag') { o.tagP += Number(g.monto); }
    });
    return o;
  }, [d]);

  if (error) return <Aviso tono="critical">No se pudo cargar tu unidad: {error}</Aviso>;
  if (!d) return <Cargando />;

  if (d.sinUnidad) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Mi unidad</h1>
        <Aviso tono="warning">
          Todavía no tienes una unidad asignada. Pídele a un administrador de Flotas que te la asigne
          para poder ver tu información aquí y hacer solicitudes.
        </Aviso>
      </div>
    );
  }

  const v = d.vehiculo;
  const nombre = [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || v.codigo || 'Tu unidad';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{nombre}</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {[v.codigo, v.placas].filter(Boolean).join(' · ') || 'Tu unidad asignada'}
          </p>
        </div>
        <Boton onClick={() => navigate('/flotas/tickets')}>+ Nuevo ticket</Boton>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kilometraje" value={v.km ? `${Number(v.km).toLocaleString('es-MX')} km` : '—'} />
        <Stat label="Cajón semanal" value={money(v.cajon_pesos)} hint={v.cajon_litros ? `${v.cajon_litros} L` : undefined} />
        <Stat label="Gasolina consumida (mes)" value={money(Math.round(consumoMes.gasP))} hint={consumoMes.gasL ? `${Math.round(consumoMes.gasL)} L` : undefined} />
        <Stat label="Tags (mes)" value={money(Math.round(consumoMes.tagP))} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Cargas de gasolina y tags</h2>
          <button onClick={() => navigate('/flotas/tickets')} className="text-xs underline" style={{ color: 'var(--series-1)' }}>
            Solicitar
          </button>
        </div>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin solicitudes de gasolina o tags todavía."
              columnas={[
                { key: 'folio', header: 'Folio', nowrap: true, render: (s) => <span className="tnum">{s.folio}</span> },
                { key: 'motivo', header: 'Motivo', nowrap: true, render: (s) => s.motivo === 'viaje' ? 'Viaje' : s.motivo === 'extra' ? 'Carga extra' : 'Tag' },
                { key: 'monto', header: 'Monto', align: 'right', render: (s) => money(s.motivo === 'tag' ? s.monto_solicitado : s.monto_estimado) },
                { key: 'fecha', header: 'Fecha', nowrap: true, render: (s) => fechaCorta(s.creado_en?.slice(0, 10)) },
                { key: 'estatus', header: 'Estatus', nowrap: true, render: (s) => <Badge color={COLOR_SOLICITUD[s.estatus]}>{ESTATUS_SOLICITUD[s.estatus]}</Badge> },
              ]}
              filas={d.solicitudes}
            />
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold tracking-tight">Registro de mantenimientos</h2>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin servicios registrados todavía."
              columnas={[
                { key: 'fecha', header: 'Fecha', nowrap: true, render: (s) => fechaCorta(s.fecha) },
                { key: 'concepto', header: 'Concepto', render: (s) => (
                    <div>
                      <div>{s.concepto}</div>
                      {s.taller && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.taller}</div>}
                    </div>) },
                { key: 'tipo', header: 'Tipo', nowrap: true,
                  render: (s) => <Badge color={s.tipo === 'preventivo' ? 'var(--series-1)' : 'var(--serious)'}>{s.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'}</Badge> },
                { key: 'km', header: 'Km', align: 'right', render: (s) => s.km ? Number(s.km).toLocaleString('es-MX') : '—' },
              ]}
              filas={d.servicios}
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Siniestros y multas</h2>
          <button onClick={() => navigate('/flotas/siniestros')} className="text-xs underline" style={{ color: 'var(--series-1)' }}>
            Reportar uno
          </button>
        </div>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin reportes todavía — mejor así."
              columnas={[
                { key: 'folio', header: 'Folio', nowrap: true, render: (s) => <span className="tnum">{s.folio}</span> },
                { key: 'tipo', header: 'Tipo', nowrap: true, render: (s) => s.tipo === 'Multa' ? 'Multa' : s.tipo },
                { key: 'clasificacion', header: 'Clasificación', render: (s) => s.clasificacion || '—' },
                { key: 'fecha', header: 'Fecha', nowrap: true, render: (s) => fechaCorta(s.fecha) },
                { key: 'estatus', header: 'Estatus', nowrap: true, render: (s) => <Badge>{s.estatus}</Badge> },
              ]}
              filas={d.siniestros}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
