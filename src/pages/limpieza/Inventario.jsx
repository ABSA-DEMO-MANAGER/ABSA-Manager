import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLimpiezaPerfil } from '../../lib/useLimpiezaPerfil';
import { money, fechaCorta } from '../../lib/format';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Stat, Boton, Modal, Campo, Input, Textarea,
} from '../../components/ui';

const FORM_VACIO = { insumo_id: '', tipo: 'salida', cantidad: '', costo_unitario: '', fecha: new Date().toISOString().slice(0, 10), motivo: '' };

export default function Inventario() {
  const { limpiezaPerfil, esLimpiezaAdmin, puedeCapturar } = useLimpiezaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [ubicacionId, setUbicacionId] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [minEditando, setMinEditando] = useState(null); // insumo_id en edición inline
  const [minValor, setMinValor] = useState('');

  async function cargar() {
    const [u, i, s, m] = await Promise.all([
      supabase.from('limpieza_ubicaciones').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('limpieza_insumos').select('id, nombre, categoria, unidad_medida, stock_minimo_default').eq('activo', true).order('nombre'),
      supabase.from('limpieza_stock').select('ubicacion_id, insumo_id, cantidad_actual, stock_minimo'),
      supabase.from('limpieza_movimientos')
        .select('id, ubicacion_id, insumo_id, tipo, cantidad, costo_unitario, motivo, fecha, creado_en')
        .order('creado_en', { ascending: false }).limit(200),
    ]);
    const err = u.error || i.error || s.error || m.error;
    if (err) { setError(err.message); return; }
    setD({ ubicaciones: u.data, insumos: i.data, stock: s.data, movimientos: m.data });
    setUbicacionId((prev) => prev || (u.data[0] ? String(u.data[0].id) : ''));
  }
  useEffect(() => { cargar(); }, []);

  const stockPorInsumo = useMemo(() => {
    if (!d || !ubicacionId) return {};
    return Object.fromEntries(
      d.stock.filter((s) => String(s.ubicacion_id) === ubicacionId).map((s) => [s.insumo_id, s]),
    );
  }, [d, ubicacionId]);

  const filas = useMemo(() => {
    if (!d) return [];
    return d.insumos.map((i) => {
      const s = stockPorInsumo[i.id];
      const cantidad = Number(s?.cantidad_actual ?? 0);
      const minimo = s?.stock_minimo ?? i.stock_minimo_default;
      return { insumo: i, cantidad, minimo: Number(minimo || 0), bajo: cantidad <= Number(minimo || 0) };
    }).sort((a, b) => (b.bajo - a.bajo) || a.insumo.nombre.localeCompare(b.insumo.nombre));
  }, [d, stockPorInsumo]);

  const bajos = filas.filter((f) => f.bajo).length;

  const movimientosUbicacion = useMemo(() => {
    if (!d || !ubicacionId) return [];
    return d.movimientos.filter((m) => String(m.ubicacion_id) === ubicacionId).slice(0, 15);
  }, [d, ubicacionId]);

  const insumoById = useMemo(() => Object.fromEntries((d?.insumos ?? []).map((i) => [i.id, i])), [d]);

  function abrirMovimiento(insumo_id) {
    setForm({ ...FORM_VACIO, insumo_id: insumo_id ? String(insumo_id) : '' });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!ubicacionId) return setFormError('Selecciona una ubicación.');
    if (!form.insumo_id) return setFormError('Selecciona un insumo.');
    const cantidad = Number(form.cantidad);
    if (!cantidad || cantidad <= 0) return setFormError('Escribe una cantidad mayor a 0.');

    setGuardando(true);
    const { error: err } = await supabase.from('limpieza_movimientos').insert({
      ubicacion_id: Number(ubicacionId), insumo_id: Number(form.insumo_id), tipo: form.tipo,
      cantidad, costo_unitario: form.tipo === 'entrada' && form.costo_unitario !== '' ? Number(form.costo_unitario) : null,
      fecha: form.fecha, motivo: form.motivo.trim() || null, registrado_por: limpiezaPerfil.perfil_id,
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  function abrirMinimo(f) {
    setMinEditando(f.insumo.id);
    setMinValor(String(stockPorInsumo[f.insumo.id]?.stock_minimo ?? ''));
  }
  async function guardarMinimo(insumo_id) {
    const stock_minimo = minValor === '' ? null : Number(minValor);
    const { error: err } = await supabase.from('limpieza_stock')
      .upsert({ ubicacion_id: Number(ubicacionId), insumo_id, stock_minimo }, { onConflict: 'ubicacion_id,insumo_id' });
    if (err) { alert(err.message); return; }
    setMinEditando(null); cargar();
  }

  if (error) return <Aviso tono="critical">No se pudo cargar el inventario: {error}</Aviso>;
  if (!d) return <Cargando />;

  const ubicacionActual = d.ubicaciones.find((u) => String(u.id) === ubicacionId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Existencia de insumos por ubicación.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className="!w-auto">
            {d.ubicaciones.length === 0 && <option value="">Sin ubicaciones</option>}
            {d.ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </Select>
          {puedeCapturar && d.ubicaciones.length > 0 && <Boton onClick={() => abrirMovimiento()}>+ Registrar movimiento</Boton>}
        </div>
      </div>

      {d.ubicaciones.length === 0 ? (
        <Aviso tono="warning">
          Todavía no hay ubicaciones. {esLimpiezaAdmin ? 'Da de alta la primera en "Ubicaciones".' : 'Pídele a un administrador de Limpieza que las capture.'}
        </Aviso>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Insumos activos" value={d.insumos.length} />
            <Stat label="Bajo mínimo" value={bajos} tone={bajos ? 'critical' : 'good'} />
            <Stat label="Movimientos (30 recientes)" value={movimientosUbicacion.length} />
          </div>

          <Card title={`Existencia — ${ubicacionActual?.nombre ?? ''}`}>
            <Tabla
              vacio="Sin insumos activos en el catálogo."
              columnas={[
                { key: 'nombre', header: 'Insumo', render: (f) => (
                    <div>
                      <div className="font-medium">{f.insumo.nombre}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.insumo.categoria || 'Sin categoría'}</div>
                    </div>) },
                { key: 'cantidad', header: 'Existencia', align: 'right', render: (f) => (
                    <span className="tnum" style={f.bajo ? { color: 'var(--critical)', fontWeight: 600 } : undefined}>
                      {f.cantidad} {f.insumo.unidad_medida}
                    </span>) },
                { key: 'minimo', header: 'Mínimo', align: 'right', render: (f) => (
                    esLimpiezaAdmin && minEditando === f.insumo.id ? (
                      <div className="flex justify-end gap-1">
                        <Input type="number" min="0" step="0.01" value={minValor} onChange={(e) => setMinValor(e.target.value)}
                               className="!w-20 !py-1 text-right" autoFocus />
                        <Boton className="!py-1 !px-2 !text-xs" onClick={() => guardarMinimo(f.insumo.id)}>OK</Boton>
                      </div>
                    ) : (
                      <button type="button" onClick={() => esLimpiezaAdmin && abrirMinimo(f)}
                              className="tnum" style={{ color: esLimpiezaAdmin ? 'var(--series-1)' : undefined, textDecoration: esLimpiezaAdmin ? 'underline' : undefined }}>
                        {f.minimo}
                      </button>
                    )) },
                { key: 'estatus', header: '', nowrap: true, render: (f) => f.bajo ? <Badge color="var(--critical)">bajo mínimo</Badge> : null },
                ...(puedeCapturar ? [{ key: 'accion', header: '', nowrap: true, render: (f) => (
                    <button onClick={() => abrirMovimiento(f.insumo.id)} className="text-xs underline" style={{ color: 'var(--series-1)' }}>
                      Movimiento
                    </button>) }] : []),
              ]}
              filas={filas}
            />
          </Card>

          <div>
            <h2 className="mb-2 text-base font-semibold tracking-tight">Movimientos recientes</h2>
            <Card className="!p-0">
              <div className="p-4 sm:p-5">
                <Tabla
                  vacio="Sin movimientos registrados en esta ubicación."
                  columnas={[
                    { key: 'fecha', header: 'Fecha', nowrap: true, render: (m) => fechaCorta(m.fecha) },
                    { key: 'insumo', header: 'Insumo', render: (m) => insumoById[m.insumo_id]?.nombre ?? '—' },
                    { key: 'tipo', header: 'Tipo', nowrap: true, render: (m) => (
                        <Badge color={m.tipo === 'entrada' ? 'var(--good)' : 'var(--serious)'}>{m.tipo === 'entrada' ? 'Entrada' : 'Salida'}</Badge>
                      ) },
                    { key: 'cantidad', header: 'Cantidad', align: 'right', render: (m) => `${m.cantidad} ${insumoById[m.insumo_id]?.unidad_medida ?? ''}` },
                    { key: 'costo', header: 'Costo', align: 'right', render: (m) => m.costo_unitario ? money(m.costo_unitario * m.cantidad) : '—' },
                    { key: 'motivo', header: 'Motivo', render: (m) => m.motivo || '—' },
                  ]}
                  filas={movimientosUbicacion}
                />
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Registrar movimiento">
        <form onSubmit={guardar} className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ubicación: <strong>{ubicacionActual?.nombre}</strong></p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Insumo" required>
              <Select value={form.insumo_id} required onChange={(e) => setForm({ ...form, insumo_id: e.target.value })}>
                <option value="">Selecciona…</option>
                {d.insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </Select>
            </Campo>
            <Campo label="Tipo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="salida">Salida (consumo)</option>
                <option value="entrada">Entrada (compra recibida)</option>
              </Select>
            </Campo>
            <Campo label="Cantidad" required>
              <Input type="number" min="0" step="0.01" value={form.cantidad} required onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
            </Campo>
            <Campo label="Fecha">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Campo>
            {form.tipo === 'entrada' && (
              <Campo label="Costo unitario (MXN)" hint="Opcional">
                <Input type="number" min="0" step="0.01" value={form.costo_unitario} onChange={(e) => setForm({ ...form, costo_unitario: e.target.value })} />
              </Campo>
            )}
          </div>
          <Campo label="Motivo / referencia" hint="Ej. Limpieza de baños, Factura #1234">
            <Textarea rows={2} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </Campo>
          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
