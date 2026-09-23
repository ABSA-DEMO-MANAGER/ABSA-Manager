import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, fechaCorta } from '../../lib/format';
import { subirArchivo, borrarArchivo } from '../../lib/storage';
import ChecklistFotos, { PUNTOS_UNIDAD, fotosVaciasUnidad, cuentaFotosUnidad } from '../../components/ChecklistFotos';
import { Card, Tabla, Cargando, Aviso, Badge, Stat, Boton, Campo, Input } from '../../components/ui';

const ESTATUS_SOLICITUD = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const COLOR_SOLICITUD = { pendiente: 'var(--serious)', aprobada: 'var(--good)', rechazada: 'var(--critical)' };
const mesActual = () => new Date().toISOString().slice(0, 7);

const ACEPTAR_VACIO = { telefono: '', licencia: '', licencia_vence: '', puesto: '', departamento: '', tipo_prestacion: '', km: '' };

export default function MiUnidad() {
  const navigate = useNavigate();
  const { flotaPerfil } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [propuesta, setPropuesta] = useState(null);
  const [aceptarForm, setAceptarForm] = useState(ACEPTAR_VACIO);
  const [fotosAceptar, setFotosAceptar] = useState(fotosVaciasUnidad());
  const [aceptando, setAceptando] = useState(false);
  const [aceptarError, setAceptarError] = useState(null);

  const vehiculoPropuestoId = flotaPerfil?.vehiculo_propuesto_id;
  useEffect(() => {
    if (!vehiculoPropuestoId) { setPropuesta(null); return; }
    (async () => {
      const { data } = await supabase.from('flota_vehiculos')
        .select('id, marca, modelo, anio, codigo, placas, km').eq('id', vehiculoPropuestoId).maybeSingle();
      setPropuesta(data ?? null);
      setAceptarForm({
        telefono: flotaPerfil.telefono ?? '', licencia: flotaPerfil.licencia ?? '',
        licencia_vence: flotaPerfil.licencia_vence ?? '', puesto: flotaPerfil.puesto ?? '',
        departamento: flotaPerfil.departamento ?? '', tipo_prestacion: flotaPerfil.tipo_prestacion ?? '',
        km: data?.km ?? '',
      });
      setFotosAceptar(fotosVaciasUnidad());
      setAceptarError(null);
    })();
  }, [vehiculoPropuestoId]);

  async function aceptarPropuesta(e) {
    e.preventDefault();
    setAceptarError(null);
    if (cuentaFotosUnidad(fotosAceptar) === 0) {
      return setAceptarError('Sube al menos una foto del estado actual de la unidad.');
    }
    setAceptando(true);
    try {
      const { data: actuales } = await supabase.from('flota_vehiculo_fotos')
        .select('id, archivo_path').eq('vehiculo_id', propuesta.id);
      for (const f of actuales ?? []) { try { await borrarArchivo(f.archivo_path); } catch { /* ignora */ } }
      if (actuales?.length) await supabase.from('flota_vehiculo_fotos').delete().in('id', actuales.map((f) => f.id));

      for (const punto of PUNTOS_UNIDAD) {
        for (const file of fotosAceptar[punto]) {
          const ruta = await subirArchivo(file, `flota/${propuesta.id}/galeria`);
          await supabase.from('flota_vehiculo_fotos').insert({ vehiculo_id: propuesta.id, punto, archivo_path: ruta });
        }
      }

      const { error: err } = await supabase.rpc('flota_aceptar_asignacion', {
        p_telefono: aceptarForm.telefono.trim() || null,
        p_licencia: aceptarForm.licencia.trim() || null,
        p_licencia_vence: aceptarForm.licencia_vence || null,
        p_puesto: aceptarForm.puesto.trim() || null,
        p_departamento: aceptarForm.departamento.trim() || null,
        p_tipo_prestacion: aceptarForm.tipo_prestacion.trim() || null,
        p_km: aceptarForm.km === '' ? null : Number(aceptarForm.km),
      });
      if (err) throw err;
      location.reload();
    } catch (err) {
      setAceptarError(err.message || 'No se pudo aceptar la unidad.');
      setAceptando(false);
    }
  }

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

  const tarjetaPropuesta = propuesta && (
    <Card title={`Tienes una unidad propuesta: ${[propuesta.marca, propuesta.modelo, propuesta.anio].filter(Boolean).join(' ') || propuesta.codigo}`}
          subtitle="Acepta y llena tu información para empezar a usarla.">
      <form onSubmit={aceptarPropuesta} className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {[propuesta.codigo, propuesta.placas].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Teléfono">
            <Input value={aceptarForm.telefono} onChange={(e) => setAceptarForm({ ...aceptarForm, telefono: e.target.value })} />
          </Campo>
          <Campo label="Licencia">
            <Input value={aceptarForm.licencia} onChange={(e) => setAceptarForm({ ...aceptarForm, licencia: e.target.value })} />
          </Campo>
          <Campo label="Vence licencia">
            <Input type="date" value={aceptarForm.licencia_vence} onChange={(e) => setAceptarForm({ ...aceptarForm, licencia_vence: e.target.value })} />
          </Campo>
          <Campo label="Puesto">
            <Input value={aceptarForm.puesto} onChange={(e) => setAceptarForm({ ...aceptarForm, puesto: e.target.value })} />
          </Campo>
          <Campo label="Departamento">
            <Input value={aceptarForm.departamento} onChange={(e) => setAceptarForm({ ...aceptarForm, departamento: e.target.value })} />
          </Campo>
          <Campo label="Tipo de prestación">
            <Input value={aceptarForm.tipo_prestacion} onChange={(e) => setAceptarForm({ ...aceptarForm, tipo_prestacion: e.target.value })} />
          </Campo>
          <Campo label="Kilometraje actual">
            <Input inputMode="numeric" value={aceptarForm.km} onChange={(e) => setAceptarForm({ ...aceptarForm, km: e.target.value })} />
          </Campo>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-2 text-xs font-medium" style={{ color: 'var(--good)' }}>Fotos del estado actual de la unidad</div>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Obligatorio — así queda documentado cómo la recibes.
          </p>
          <ChecklistFotos valor={fotosAceptar} onChange={setFotosAceptar} />
        </div>
        {aceptarError && <Aviso tono="critical">{aceptarError}</Aviso>}
        <div className="flex justify-end">
          <Boton type="submit" disabled={aceptando}>{aceptando ? 'Guardando…' : 'Aceptar unidad'}</Boton>
        </div>
      </form>
    </Card>
  );

  if (d.sinUnidad) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Mi unidad</h1>
        {tarjetaPropuesta ?? (
          <Aviso tono="warning">
            Todavía no tienes una unidad asignada. Pídele a un administrador de Flotas que te la asigne
            para poder ver tu información aquí y hacer solicitudes.
          </Aviso>
        )}
      </div>
    );
  }

  const v = d.vehiculo;
  const nombre = [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || v.codigo || 'Tu unidad';

  return (
    <div className="space-y-5">
      {tarjetaPropuesta}
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
