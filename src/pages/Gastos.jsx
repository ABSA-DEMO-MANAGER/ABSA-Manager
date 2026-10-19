import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  money, fechaCorta, hoyISO, TIPOS, UNIDADES, ESTATUS_PAGO,
} from '../lib/format';
import { urlFirmada, subirArchivo } from '../lib/storage';
import SelectorProveedor from '../components/SelectorProveedor';
import { FotoOPdfInput } from '../components/FotoInput';
import {
  Card, Tabla, Boton, Campo, Input, Select, Textarea, Modal,
  Cargando, Aviso, Badge, Stat,
} from '../components/ui';
import PeriodoFiltro from '../components/PeriodoFiltro';

const VACIO = {
  fecha: hoyISO(), sucursal_id: '', concepto: '', tipo: 'insumo',
  unidad_pago: 'compania', estatus_pago: 'borrador', cotizaciones: 1,
  monto: '', proveedor_id: '', factura: '', archivo: null, caja_chica_emergencia: false,
};

// Valores por defecto mientras carga mantenimiento_config (paso 7); un
// admin los edita en Configuración sin tocar código. Mismos umbrales
// que usa Plan.jsx y que exige la base de datos (policies de gastos).
const DEFAULT_UMBRAL_SIN_AUTORIZACION = 500;
const DEFAULT_CAJA_CHICA_LIMITE_EVENTO = 1500;
const DEFAULT_CAJA_CHICA_LIMITE_EMERGENCIA = 3000;

// Preventivo/correctivo solo se generan al finalizar una orden en el Plan
// de mantenimiento (se piden proveedor y comprobantes ahí). Aquí solo se
// capturan directo los tipos que no nacen de una orden de trabajo.
const TIPOS_CAPTURA_DIRECTA = ['remodelacion', 'insumo', 'viaticos', 'otro'];

export default function Gastos() {
  const { perfil, puedeGestionar } = useAuth();
  const [params, setParams] = useSearchParams();

  const [gastos, setGastos] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const UMBRAL_SIN_AUTORIZACION = config?.monto_sin_autorizacion ?? DEFAULT_UMBRAL_SIN_AUTORIZACION;
  const CAJA_CHICA_LIMITE_EVENTO = config?.caja_chica_limite_evento ?? DEFAULT_CAJA_CHICA_LIMITE_EVENTO;
  const CAJA_CHICA_LIMITE_EMERGENCIA = config?.caja_chica_limite_emergencia ?? DEFAULT_CAJA_CHICA_LIMITE_EMERGENCIA;

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
    const [g, s, p, cfg] = await Promise.all([
      supabase.from('gastos')
        .select('id, folio, fecha, sucursal_id, concepto, tipo, unidad_pago, estatus_pago, cotizaciones, monto, factura, requiere_revision, nota_revision, proveedor_id, orden_id, comprobante_cotizacion_path, comprobante_gasto_path, comprobante_path, comprobado_en, creado_en')
        .order('fecha', { ascending: false }).limit(2000),
      supabase.from('sucursales').select('id, codigo, nombre, activa').order('codigo'),
      supabase.from('proveedores').select('id, nombre').order('nombre'),
      supabase.from('mantenimiento_config')
        .select('monto_sin_autorizacion, caja_chica_limite_evento, caja_chica_limite_emergencia').eq('id', 1).single(),
    ]);
    if (g.error || s.error || p.error) { setError((g.error || s.error || p.error).message); return; }
    setGastos(g.data); setSucursales(s.data); setProveedores(p.data); setConfig(cfg.data);
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
    if (form.unidad_pago === 'caja_chica') {
      const limite = form.caja_chica_emergencia ? CAJA_CHICA_LIMITE_EMERGENCIA : CAJA_CHICA_LIMITE_EVENTO;
      if (monto > limite) {
        return setFormError(
          form.caja_chica_emergencia
            ? `Ni como emergencia puede superar $${limite} de caja chica.`
            : `Caja chica no puede superar $${limite} por evento. Si es una emergencia real, marca la casilla.`
        );
      }
    }

    setGuardando(true);
    let comprobante_path = null;
    if (form.archivo) comprobante_path = await subirArchivo(form.archivo, 'gastos');
    const { error: err } = await supabase.from('gastos').insert({
      fecha: form.fecha,
      sucursal_id: Number(form.sucursal_id),
      concepto: form.concepto.trim(),
      tipo: form.tipo,
      unidad_pago: form.unidad_pago,
      estatus_pago: monto > UMBRAL_SIN_AUTORIZACION && ['aprobado', 'pagado', 'rechazado'].includes(form.estatus_pago)
        ? 'a_enviar' : form.estatus_pago,
      cotizaciones: Number(form.cotizaciones) || 0,
      monto,
      proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
      factura: form.factura.trim() || null,
      comprobante_path, comprobado_en: comprobante_path ? new Date().toISOString() : null,
      caja_chica_emergencia: form.unidad_pago === 'caja_chica' ? form.caja_chica_emergencia : false,
      creado_por: perfil.id,
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

  const [adjuntarFor, setAdjuntarFor] = useState(null);
  const [archivoAdjuntar, setArchivoAdjuntar] = useState(null);
  const [adjuntando, setAdjuntando] = useState(false);

  async function guardarAdjunto() {
    if (!archivoAdjuntar) return;
    setAdjuntando(true);
    const ruta = await subirArchivo(archivoAdjuntar, 'gastos');
    await supabase.from('gastos')
      .update({ comprobante_path: ruta, comprobado_en: new Date().toISOString() })
      .eq('id', adjuntarFor.id);
    setAdjuntando(false);
    setAdjuntarFor(null); setArchivoAdjuntar(null);
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
          <div>{g.folio && <span className="tnum" style={{ color: 'var(--text-muted)' }}>{g.folio} · </span>}{g.concepto}</div>
          {(g.comprobante_cotizacion_path || g.comprobante_gasto_path || g.comprobante_path) && (
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
              {g.comprobante_path && (
                <button onClick={() => verComprobante(g.comprobante_path)}
                        className="underline" style={{ color: 'var(--series-1)' }}>
                  Comprobante
                </button>
              )}
            </div>
          )}
          {!g.comprobante_path && g.unidad_pago === 'caja_chica' && (
            <div className="mt-1">
              <button onClick={() => { setAdjuntarFor(g); setArchivoAdjuntar(null); }}
                      className="text-xs underline" style={{ color: 'var(--serious)' }}>
                Adjuntar comprobante
              </button>
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
                 onChange={(e) => setBusca(e.target.value)} className="w-full min-w-[200px] sm:!w-auto sm:flex-1" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Unidad de pago"
                   hint={form.unidad_pago === 'caja_chica'
                     ? `Tope ${form.caja_chica_emergencia ? 'de emergencia' : 'por evento'}: $${form.caja_chica_emergencia ? CAJA_CHICA_LIMITE_EMERGENCIA : CAJA_CHICA_LIMITE_EVENTO}`
                     : undefined}>
              <Select value={form.unidad_pago}
                      onChange={(e) => setForm({ ...form, unidad_pago: e.target.value })}>
                {Object.entries(UNIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              {form.unidad_pago === 'caja_chica' && (
                <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.caja_chica_emergencia}
                         onChange={(e) => setForm({ ...form, caja_chica_emergencia: e.target.checked })} />
                  Es una emergencia
                </label>
              )}
            </Campo>
            <Campo label="Estatus de pago"
                   hint={(Number(form.monto) || 0) > UMBRAL_SIN_AUTORIZACION ? `Arriba de $${UMBRAL_SIN_AUTORIZACION} se autoriza desde Aprobaciones` : undefined}>
              <Select value={form.estatus_pago}
                      onChange={(e) => setForm({ ...form, estatus_pago: e.target.value })}>
                {Object.entries(ESTATUS_PAGO)
                  .filter(([k]) => (Number(form.monto) || 0) <= UMBRAL_SIN_AUTORIZACION || !['aprobado', 'pagado', 'rechazado'].includes(k))
                  .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Cotizaciones" hint="Cuántas se pidieron">
              <Input type="number" min="0" value={form.cotizaciones}
                     onChange={(e) => setForm({ ...form, cotizaciones: e.target.value })} />
            </Campo>
            <Campo label="Factura / folio">
              <Input value={form.factura} placeholder="Opcional"
                     onChange={(e) => setForm({ ...form, factura: e.target.value })} />
            </Campo>
          </div>

          <Campo label="Comprobante" hint="Opcional al registrar; si es caja chica debe adjuntarse dentro de 24 horas">
            <FotoOPdfInput value={form.archivo} onChange={(f) => setForm({ ...form, archivo: f })} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}

          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Adjuntar comprobante ---------------- */}
      <Modal abierto={!!adjuntarFor} onClose={() => setAdjuntarFor(null)} titulo="Adjuntar comprobante">
        {adjuntarFor && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{adjuntarFor.concepto}</p>
            <Campo label="Comprobante" required>
              <FotoOPdfInput value={archivoAdjuntar} onChange={setArchivoAdjuntar} />
            </Campo>
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setAdjuntarFor(null)}>Cancelar</Boton>
              <Boton type="button" disabled={!archivoAdjuntar || adjuntando} onClick={guardarAdjunto}>
                {adjuntando ? 'Guardando…' : 'Guardar'}
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
