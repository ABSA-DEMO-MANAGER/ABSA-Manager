import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  money, fechaCorta, hoyISO, TIPOS, UNIDADES, ESTATUS_PAGO,
} from '../lib/format';
import { urlFirmada } from '../lib/storage';
import SelectorProveedor from '../components/SelectorProveedor';
import {
  Card, Tabla, Boton, Campo, Input, Select, Textarea, Modal,
  Cargando, Aviso, Badge, Stat,
} from '../components/ui';
import PeriodoFiltro from '../components/PeriodoFiltro';

const VACIO = {
  fecha: hoyISO(), sucursal_id: '', concepto: '', tipo: 'insumo',
  unidad_pago: 'compania', estatus_pago: 'borrador', cotizaciones: 1,
  monto: '', proveedor_id: '', factura: '',
};

// Preventivo/correctivo solo se generan al finalizar una orden en el Plan
// de mantenimiento (se piden proveedor y comprobantes ahí). Aquí solo se
// capturan directo los tipos que no nacen de una orden de trabajo.
const TIPOS_CAPTURA_DIRECTA = ['remodelacion', 'insumo', 'viaticos', 'otro'];

export default function Gastos() {
  const { puedeGestionar } = useAuth();
  const [params, setParams] = useSearchParams();

  const [gastos, setGastos] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [error, setError] = useState(null);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [fSucursal, setFSucursal] = useState(params.get('sucursal') ?? '');
  const [fTipo, setFTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState(null);
  const soloRevisar = params.get('revisar') === '1';

  async function cargar() {
    const [g, s, p] = await Promise.all([
      supabase.from('gastos')
        .select('id, fecha, sucursal_id, concepto, tipo, unidad_pago, estatus_pago, cotizaciones, monto, factura, requiere_revision, nota_revision, proveedor_id, orden_id, comprobante_cotizacion_path, comprobante_gasto_path')
        .order('fecha', { ascending: false }).limit(2000),
      supabase.from('sucursales').select('id, codigo, nombre, activa').order('codigo'),
      supabase.from('proveedores').select('id, nombre').order('nombre'),
    ]);
    if (g.error || s.error || p.error) { setError((g.error || s.error || p.error).message); return; }
    setGastos(g.data); setSucursales(s.data); setProveedores(p.data);
  }
  useEffect(() => { cargar(); }, []);

  const sucById = useMemo(
    () => Object.fromEntries(sucursales.map((s) => [s.id, s])), [sucursales]);
  const provById = useMemo(
    () => Object.fromEntries(proveedores.map((p) => [p.id, p])), [proveedores]);

  const filtrados = useMemo(() => {
    if (!gastos || !periodo) return [];
    const q = busca.trim().toLowerCase();
    return gastos.filter((g) =>
      g.fecha >= periodo.desde && g.fecha <= periodo.hasta &&
      (!fSucursal || String(g.sucursal_id) === fSucursal) &&
      (!fTipo || g.tipo === fTipo) &&
      (!soloRevisar || g.requiere_revision) &&
      (!q ||
        g.concepto?.toLowerCase().includes(q) ||
        provById[g.proveedor_id]?.nombre?.toLowerCase().includes(q))
    );
  }, [gastos, periodo, fSucursal, fTipo, busca, soloRevisar, provById]);

  const total = filtrados.reduce((a, g) => a + Number(g.monto), 0);

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.sucursal_id) return setFormError('Selecciona la sucursal.');
    if (!form.concepto.trim()) return setFormError('Escribe el concepto.');
    const monto = parseFloat(String(form.monto).replace(/[$,\s]/g, ''));
    if (isNaN(monto)) return setFormError('El monto no es un número válido.');
    if (monto < 0) return setFormError('El monto no puede ser negativo. Si es una nota de crédito, regístrala como tal.');

    setGuardando(true);
    const { error: err } = await supabase.from('gastos').insert({
      fecha: form.fecha,
      sucursal_id: Number(form.sucursal_id),
      concepto: form.concepto.trim(),
      tipo: form.tipo,
      unidad_pago: form.unidad_pago,
      estatus_pago: form.estatus_pago,
      cotizaciones: Number(form.cotizaciones) || 0,
      monto,
      proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
      factura: form.factura.trim() || null,
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); setForm(VACIO); cargar();
  }

  async function resolverRevision(g) {
    await supabase.from('gastos')
      .update({ requiere_revision: false, nota_revision: null })
      .eq('id', g.id);
    cargar();
  }

  async function verComprobante(ruta) {
    const url = await urlFirmada(ruta);
    if (url) window.open(url, '_blank', 'noopener');
    else alert('No se pudo abrir el archivo.');
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los gastos: {error}</Aviso>;
  if (!gastos) return <Cargando />;

  const columnas = [
    { key: 'fecha', header: 'Fecha', nowrap: true, render: (g) => fechaCorta(g.fecha) },
    { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (g) => sucById[g.sucursal_id]?.codigo ?? '—' },
    { key: 'concepto', header: 'Concepto', render: (g) => (
        <div>
          <div>{g.concepto}</div>
          {(g.comprobante_cotizacion_path || g.comprobante_gasto_path) && (
            <div className="mt-1 flex gap-3 text-xs">
              {g.comprobante_cotizacion_path && (
                <button onClick={() => verComprobante(g.comprobante_cotizacion_path)}
                        className="underline" style={{ color: 'var(--series-1)' }}>
                  Cotización
                </button>
              )}
              {g.comprobante_gasto_path && (
                <button onClick={() => verComprobante(g.comprobante_gasto_path)}
                        className="underline" style={{ color: 'var(--series-1)' }}>
                  Comprobante
                </button>
              )}
            </div>
          )}
          {g.requiere_revision && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge color="var(--serious)">Por revisar</Badge>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{g.nota_revision}</span>
              {puedeGestionar && (
                <button onClick={() => resolverRevision(g)} className="text-xs underline"
                        style={{ color: 'var(--text-secondary)' }}>
                  Marcar revisado
                </button>
              )}
            </div>
          )}
        </div>) },
    { key: 'tipo', header: 'Tipo', nowrap: true, render: (g) => (
        <Badge color={TIPOS[g.tipo]?.color}>{TIPOS[g.tipo]?.label ?? g.tipo}</Badge>) },
    { key: 'proveedor_id', header: 'Proveedor', render: (g) => provById[g.proveedor_id]?.nombre ?? '—' },
    { key: 'unidad_pago', header: 'Pago', nowrap: true, render: (g) => (
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {UNIDADES[g.unidad_pago]}<br />{ESTATUS_PAGO[g.estatus_pago]}
        </span>) },
    { key: 'cotizaciones', header: 'Cot.', align: 'right', render: (g) => (
        <span style={{ color: g.cotizaciones === 0 && Number(g.monto) > 10000 ? 'var(--critical)' : undefined }}>
          {g.cotizaciones}
        </span>) },
    { key: 'monto', header: 'Monto', align: 'right', render: (g) => (
        <span style={{ color: Number(g.monto) < 0 ? 'var(--critical)' : undefined }}>
          {money(g.monto, 2)}
        </span>) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Gastos</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {periodo ? `${filtrados.length} de ${gastos.length} movimientos` : 'Cargando…'}
          </p>
        </div>
        {puedeGestionar && <Boton onClick={() => { setForm(VACIO); setFormError(null); setModal(true); }}>+ Registrar gasto</Boton>}
      </div>

      <PeriodoFiltro onChange={setPeriodo} />

      {!periodo ? <Cargando /> : (
      <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total filtrado" value={money(total)} hint={`${filtrados.length} movimientos`} />
        <Stat label="Promedio" value={money(filtrados.length ? total / filtrados.length : 0)} />
        <Stat label="Caja chica"
              value={money(filtrados.filter((g) => g.unidad_pago === 'caja_chica').reduce((a, g) => a + Number(g.monto), 0))}
              hint={`${filtrados.filter((g) => g.unidad_pago === 'caja_chica').length} movimientos`} />
        <Stat label="Por revisar" value={gastos.filter((g) => g.requiere_revision).length}
              tone={gastos.some((g) => g.requiere_revision) ? 'warning' : 'good'} />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Buscar concepto o proveedor…" value={busca}
                 onChange={(e) => setBusca(e.target.value)} className="!w-auto min-w-[200px] flex-1" />
          <Select value={fSucursal} onChange={(e) => setFSucursal(e.target.value)} className="!w-auto">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
          <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="!w-auto">
            <option value="">Todos los tipos</option>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <label className="flex items-center gap-2 rounded-lg border px-3 text-sm"
                 style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={soloRevisar}
                   onChange={(e) => { const p = new URLSearchParams(params);
                     e.target.checked ? p.set('revisar', '1') : p.delete('revisar'); setParams(p); }} />
            Solo por revisar
          </label>
        </div>

        <Tabla columnas={columnas} filas={filtrados} vacio="Ningún gasto coincide con el filtro en este periodo." />
      </Card>
      </>
      )}

      {/* ---------------- Alta ---------------- */}
      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Registrar gasto">
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha" required>
              <Input type="date" value={form.fecha} required
                     onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Campo>
            <Campo label="Monto" required>
              <Input inputMode="decimal" placeholder="0.00" value={form.monto} required
                     onChange={(e) => setForm({ ...form, monto: e.target.value })} />
            </Campo>
          </div>

          <Campo label="Sucursal" required>
            <Select value={form.sucursal_id} required
                    onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {sucursales.filter((s) => s.activa).map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </Select>
          </Campo>

          <Campo label="Concepto" required>
            <Textarea value={form.concepto} required rows={2}
                      placeholder="Qué se hizo y dónde"
                      onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tipo" required hint="Preventivo/correctivo se registran desde el Plan de mantenimiento">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS_CAPTURA_DIRECTA.map((k) => <option key={k} value={k}>{TIPOS[k].label}</option>)}
              </Select>
            </Campo>
            <Campo label="Proveedor">
              <SelectorProveedor proveedores={proveedores} value={form.proveedor_id}
                                 onChange={(v) => setForm({ ...form, proveedor_id: v })}
                                 onCreado={(nuevo) => setProveedores((prev) => [...prev, nuevo])} />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Unidad de pago">
              <Select value={form.unidad_pago}
                      onChange={(e) => setForm({ ...form, unidad_pago: e.target.value })}>
                {Object.entries(UNIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
            <Campo label="Estatus de pago">
              <Select value={form.estatus_pago}
                      onChange={(e) => setForm({ ...form, estatus_pago: e.target.value })}>
                {Object.entries(ESTATUS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Cotizaciones" hint="Cuántas se pidieron">
              <Input type="number" min="0" value={form.cotizaciones}
                     onChange={(e) => setForm({ ...form, cotizaciones: e.target.value })} />
            </Campo>
            <Campo label="Factura / folio">
              <Input value={form.factura} placeholder="Opcional"
                     onChange={(e) => setForm({ ...form, factura: e.target.value })} />
            </Campo>
          </div>

          {formError && <Aviso tono="critical">{formError}</Aviso>}

          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
