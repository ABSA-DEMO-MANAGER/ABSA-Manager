import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { subirArchivo } from '../lib/storage';
import { useAuth } from '../lib/auth';
import {
  fechaCorta, hoyISO, money, pct, FRECUENCIAS, ESTATUS_ORDEN, TIPOS, CRITICIDAD,
} from '../lib/format';
import {
  Card, Tabla, Boton, Campo, Input, Select, Textarea, Modal,
  Cargando, Aviso, Badge, Stat, FiltroChips, ArchivoInput,
} from '../components/ui';
import SelectorProveedor from '../components/SelectorProveedor';

const COLOR_ESTATUS = {
  programada: 'var(--series-1)', en_proceso: 'var(--series-3)',
  realizada: 'var(--good)', pospuesta: 'var(--serious)', cancelada: 'var(--text-muted)',
};

const TIPOS_ORDEN = ['preventivo', 'correctivo'];

const FORM_VACIO = {
  id: null, plan_id: '', sucursal_id: '', activo_id: '', proveedor_id: '',
  titulo: '', descripcion: '', tipo: 'correctivo', tipo_falla: '', criticidad: 'B', categoria_id: '',
  fecha_programada: hoyISO(), fecha_realizada: '', estatus: 'programada',
  costo_estimado: '', duracion_estimada_horas: '', notas: '',
};

const FORM_FINAL_VACIO = {
  fecha_realizada: hoyISO(), duracion_real_horas: '', proveedor_id: '',
  unidad_pago: 'compania', estatus_pago: 'pagado', monto: '', cotizaciones: 1,
  factura: '', archivoCotizacion: null, archivoComprobante: null,
};

export default function Plan() {
  const { puedeGestionar } = useAuth();
  const [vista, setVista] = useState('activas');   // activas | historial | catalogo
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [fTipo, setFTipo] = useState('');
  const [fSucursal, setFSucursal] = useState('');
  const [fCat, setFCat] = useState('');
  const [ordenarCosto, setOrdenarCosto] = useState(false);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [ordenActiva, setOrdenActiva] = useState(null);
  const [formFinal, setFormFinal] = useState(FORM_FINAL_VACIO);
  const [subiendo, setSubiendo] = useState(null); // texto de progreso

  async function cargar() {
    const [o, p, s, c, a, prov, g] = await Promise.all([
      supabase.from('ordenes')
        .select('id, folio, sucursal_id, activo_id, plan_id, proveedor_id, tipo, titulo, descripcion, tipo_falla, criticidad, categoria_id, fecha_programada, fecha_realizada, estatus, costo_estimado, duracion_estimada_horas, duracion_real_horas, notas')
        .order('fecha_programada', { ascending: true, nullsFirst: false }).limit(2000),
      supabase.from('planes').select('id, nombre, descripcion, frecuencia, servicio, categoria_id, activo').order('nombre'),
      supabase.from('sucursales').select('id, codigo, nombre, activa').order('codigo'),
      supabase.from('categorias').select('id, nombre').order('orden'),
      supabase.from('activos').select('id, sucursal_id, nombre, codigo').order('nombre'),
      supabase.from('proveedores').select('id, nombre').order('nombre'),
      supabase.from('gastos').select('orden_id, monto').not('orden_id', 'is', null),
    ]);
    const err = o.error || p.error || s.error || c.error || a.error || prov.error || g.error;
    if (err) { setError(err.message); return; }
    setD({
      ordenes: o.data, planes: p.data, sucursales: s.data, categorias: c.data,
      activos: a.data, proveedores: prov.data, gastos: g.data,
    });
  }
  useEffect(() => { cargar(); }, []);

  const sucById = useMemo(() => Object.fromEntries((d?.sucursales ?? []).map((s) => [s.id, s])), [d]);
  const catById = useMemo(() => Object.fromEntries((d?.categorias ?? []).map((c) => [c.id, c])), [d]);
  const activoById = useMemo(() => Object.fromEntries((d?.activos ?? []).map((a) => [a.id, a])), [d]);
  const provById = useMemo(() => Object.fromEntries((d?.proveedores ?? []).map((p) => [p.id, p])), [d]);
  const costoRealPorOrden = useMemo(() => {
    const m = {};
    (d?.gastos ?? []).forEach((g) => { m[g.orden_id] = (m[g.orden_id] || 0) + Number(g.monto); });
    return m;
  }, [d]);

  const hoy = hoyISO();
  const agregarProveedor = (nuevo) => setD((prev) => ({ ...prev, proveedores: [...prev.proveedores, nuevo] }));

  const activasBase = useMemo(() => {
    if (!d) return [];
    return d.ordenes.filter((o) => !['realizada', 'cancelada'].includes(o.estatus));
  }, [d]);

  const activasFiltradas = useMemo(() => activasBase.filter((o) =>
    (!fTipo || o.tipo === fTipo) &&
    (!fSucursal || String(o.sucursal_id) === fSucursal) &&
    (!fCat || String(o.categoria_id) === fCat)
  ), [activasBase, fTipo, fSucursal, fCat]);

  const opcionesCategoria = useMemo(() => {
    if (!d) return [];
    const base = activasBase.filter((o) =>
      (!fTipo || o.tipo === fTipo) && (!fSucursal || String(o.sucursal_id) === fSucursal));
    return d.categorias.map((c) => ({
      value: String(c.id), label: c.nombre,
      count: base.filter((o) => o.categoria_id === c.id).length,
    }));
  }, [d, activasBase, fTipo, fSucursal]);

  const buckets = useMemo(() => {
    const ordenar = (arr) => ordenarCosto
      ? [...arr].sort((a, b) => (Number(b.costo_estimado) || 0) - (Number(a.costo_estimado) || 0))
      : arr;
    const enCurso = ordenar(activasFiltradas.filter((o) => o.estatus === 'en_proceso'));
    const atrasado = ordenar(activasFiltradas.filter((o) => o.estatus !== 'en_proceso' &&
      (o.estatus === 'pospuesta' || !o.fecha_programada || o.fecha_programada < hoy)));
    const proximo = ordenar(activasFiltradas.filter((o) => o.estatus === 'programada' &&
      o.fecha_programada && o.fecha_programada >= hoy));
    return { enCurso, atrasado, proximo };
  }, [activasFiltradas, ordenarCosto, hoy]);

  const historial = useMemo(() => {
    if (!d) return [];
    return d.ordenes.filter((o) =>
      ['realizada', 'cancelada'].includes(o.estatus) &&
      (!fTipo || o.tipo === fTipo) &&
      (!fSucursal || String(o.sucursal_id) === fSucursal) &&
      (!fCat || String(o.categoria_id) === fCat))
      .sort((a, b) => (b.fecha_realizada ?? '').localeCompare(a.fecha_realizada ?? ''));
  }, [d, fTipo, fSucursal, fCat]);

  const kpi = useMemo(() => {
    if (!d) return null;
    const prev = d.ordenes.filter((o) => o.tipo === 'preventivo');
    const real = prev.filter((o) => o.estatus === 'realizada').length;
    return {
      cumplimiento: prev.length ? (real / prev.length) * 100 : null,
      realizadas: real,
      atrasadas: buckets.atrasado.length,
      proximas: buckets.proximo.length,
    };
  }, [d, buckets]);

  // ------------------------------------------------------------ formulario
  function abrirNueva(plan = null) {
    setForm({
      ...FORM_VACIO,
      plan_id: plan?.id ?? '', titulo: plan?.nombre ?? '', descripcion: plan?.descripcion ?? '',
      tipo: plan ? 'preventivo' : 'correctivo', categoria_id: plan?.categoria_id ? String(plan.categoria_id) : '',
    });
    setFormError(null); setModal(true);
  }
  function abrirEditar(o) {
    setForm({
      id: o.id, plan_id: o.plan_id ?? '', sucursal_id: String(o.sucursal_id),
      activo_id: o.activo_id ? String(o.activo_id) : '', proveedor_id: o.proveedor_id ? String(o.proveedor_id) : '',
      titulo: o.titulo, descripcion: o.descripcion ?? '', tipo: o.tipo, tipo_falla: o.tipo_falla ?? '',
      criticidad: o.criticidad ?? 'B', categoria_id: o.categoria_id ? String(o.categoria_id) : '',
      fecha_programada: o.fecha_programada ?? '', fecha_realizada: o.fecha_realizada ?? '',
      estatus: o.estatus, costo_estimado: o.costo_estimado ?? '',
      duracion_estimada_horas: o.duracion_estimada_horas ?? '', notas: o.notas ?? '',
    });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.sucursal_id) return setFormError('Selecciona la sucursal.');
    if (!form.titulo.trim()) return setFormError('Escribe el título de la orden.');

    const payload = {
      sucursal_id: Number(form.sucursal_id),
      activo_id: form.activo_id ? Number(form.activo_id) : null,
      proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
      plan_id: form.plan_id ? Number(form.plan_id) : null,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      tipo: form.tipo,
      tipo_falla: form.tipo === 'correctivo' ? (form.tipo_falla.trim() || null) : null,
      criticidad: form.criticidad || null,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      fecha_programada: form.fecha_programada || null,
      fecha_realizada: form.fecha_realizada || null,
      estatus: form.estatus,
      costo_estimado: form.costo_estimado === '' ? null : Number(form.costo_estimado),
      duracion_estimada_horas: form.duracion_estimada_horas === '' ? null : Number(form.duracion_estimada_horas),
      notas: form.notas.trim() || null,
    };
    setGuardando(true);
    const { error: err } = form.id
      ? await supabase.from('ordenes').update(payload).eq('id', form.id)
      : await supabase.from('ordenes').insert(payload);
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  // ------------------------------------------------------ iniciar/finalizar
  async function iniciar(o) {
    await supabase.from('ordenes').update({ estatus: 'en_proceso' }).eq('id', o.id);
    cargar();
  }

  function abrirFinalizar(o) {
    setOrdenActiva(o);
    setFormFinal({ ...FORM_FINAL_VACIO, proveedor_id: o.proveedor_id ? String(o.proveedor_id) : '' });
    setFormError(null);
  }

  async function finalizar(e) {
    e.preventDefault();
    setFormError(null);
    if (!formFinal.proveedor_id) return setFormError('Selecciona el proveedor que hizo el trabajo.');
    const monto = parseFloat(String(formFinal.monto).replace(/[$,\s]/g, ''));
    if (isNaN(monto) || monto <= 0) return setFormError('Captura un monto válido.');
    if (!formFinal.archivoCotizacion) return setFormError('Sube el comprobante de cotización.');
    if (!formFinal.archivoComprobante) return setFormError('Sube el comprobante de gasto (factura o recibo).');
    if (!formFinal.fecha_realizada) return setFormError('Captura la fecha de realización.');

    setGuardando(true);
    try {
      setSubiendo('Subiendo cotización…');
      const rutaCot = await subirArchivo(formFinal.archivoCotizacion, `ordenes/${ordenActiva.id}`);
      setSubiendo('Subiendo comprobante de gasto…');
      const rutaComp = await subirArchivo(formFinal.archivoComprobante, `ordenes/${ordenActiva.id}`);
      setSubiendo('Guardando…');

      const { error: errGasto } = await supabase.from('gastos').insert({
        fecha: formFinal.fecha_realizada,
        sucursal_id: ordenActiva.sucursal_id,
        orden_id: ordenActiva.id,
        proveedor_id: Number(formFinal.proveedor_id),
        concepto: ordenActiva.titulo,
        tipo: ordenActiva.tipo,
        unidad_pago: formFinal.unidad_pago,
        estatus_pago: formFinal.estatus_pago,
        cotizaciones: Number(formFinal.cotizaciones) || 1,
        monto,
        factura: formFinal.factura.trim() || null,
        comprobante_cotizacion_path: rutaCot,
        comprobante_gasto_path: rutaComp,
      });
      if (errGasto) throw errGasto;

      const { error: errOrden } = await supabase.from('ordenes').update({
        estatus: 'realizada',
        fecha_realizada: formFinal.fecha_realizada,
        duracion_real_horas: formFinal.duracion_real_horas === '' ? null : Number(formFinal.duracion_real_horas),
        proveedor_id: Number(formFinal.proveedor_id),
      }).eq('id', ordenActiva.id);
      if (errOrden) throw errOrden;

      setOrdenActiva(null); cargar();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setGuardando(false); setSubiendo(null);
    }
  }

  if (error) return <Aviso tono="critical">No se pudo cargar el plan: {error}</Aviso>;
  if (!d) return <Cargando />;

  const activosDeSucursal = d.activos.filter((a) => String(a.sucursal_id) === String(form.sucursal_id));

  const columnasOrden = (mostrarAccion) => [
    { key: 'fecha_programada', header: 'Programada', nowrap: true, render: (o) => fechaCorta(o.fecha_programada) },
    { key: 'titulo', header: 'Orden', render: (o) => (
        <div>
          <div>{o.titulo}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {activoById[o.activo_id]?.nombre && <span>{activoById[o.activo_id].nombre}</span>}
            {catById[o.categoria_id]?.nombre && <span>· {catById[o.categoria_id].nombre}</span>}
            {o.tipo_falla && <span>· falla: {o.tipo_falla}</span>}
          </div>
        </div>) },
    { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (o) => sucById[o.sucursal_id]?.codigo ?? '—' },
    { key: 'tipo', header: 'Tipo', nowrap: true,
      render: (o) => <Badge color={TIPOS[o.tipo]?.color}>{TIPOS[o.tipo]?.label}</Badge> },
    { key: 'criticidad', header: 'Criticidad', nowrap: true,
      render: (o) => o.criticidad ? <Badge color={CRITICIDAD[o.criticidad]?.color}>{o.criticidad}</Badge> : '—' },
    { key: 'costo_estimado', header: 'Costo est.', align: 'right', nowrap: true,
      render: (o) => o.costo_estimado ? money(o.costo_estimado) : '—' },
    { key: 'duracion_estimada_horas', header: 'Duración', align: 'right', nowrap: true,
      render: (o) => o.duracion_estimada_horas ? `${o.duracion_estimada_horas} h` : '—' },
    ...(mostrarAccion ? [{ key: 'accion', header: '', nowrap: true, render: (o) => (
      <div className="flex items-center justify-end gap-2">
        {o.estatus !== 'en_proceso' && puedeGestionar && (
          <button onClick={(e) => { e.stopPropagation(); iniciar(o); }}
                  className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Iniciar
          </button>
        )}
        {o.estatus === 'en_proceso' && puedeGestionar && (
          <button onClick={(e) => { e.stopPropagation(); abrirFinalizar(o); }}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium"
                  style={{ background: 'var(--series-1)', color: '#fff' }}>
            Finalizar
          </button>
        )}
        {puedeGestionar && (
          <button onClick={(e) => { e.stopPropagation(); abrirEditar(o); }}
                  className="text-xs underline" style={{ color: 'var(--text-secondary)' }}>
            Editar
          </button>
        )}
      </div>) }] : []),
  ];

  const seccion = (titulo, hint, ordenes, tono) => (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
        <Badge color={tono}>{ordenes.length}</Badge>
        {hint && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {hint}</span>}
      </div>
      <Card className="!p-0">
        <div className="p-4 sm:p-5">
          <Tabla vacio="Sin órdenes en este grupo." columnas={columnasOrden(true)} filas={ordenes} />
        </div>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Plan de mantenimiento</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {d.planes.length} tareas tipo · {d.ordenes.length} órdenes de trabajo
          </p>
        </div>
        {puedeGestionar && <Boton onClick={() => abrirNueva()}>+ Nueva orden</Boton>}
      </div>

      {d.ordenes.length === 0 && (
        <Aviso tono="warning">
          Todavía no hay órdenes de trabajo. El catálogo ya tiene {d.planes.length} tareas cargadas
          desde tus Exceles: abre la pestaña <strong>Catálogo</strong> y genera una orden desde
          cualquiera de ellas para empezar a medir cumplimiento.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cumplimiento preventivo"
              value={kpi.cumplimiento === null ? '—' : pct(kpi.cumplimiento)}
              hint={`${kpi.realizadas} realizadas`}
              tone={kpi.cumplimiento === null ? undefined : kpi.cumplimiento >= 85 ? 'good' : kpi.cumplimiento >= 60 ? 'warning' : 'critical'} />
        <Stat label="Atrasadas" value={kpi.atrasadas} tone={kpi.atrasadas > 0 ? 'critical' : 'good'} />
        <Stat label="Próximas" value={kpi.proximas} />
        <Stat label="Tareas en catálogo" value={d.planes.length} />
      </div>

      <div className="flex gap-1 rounded-lg border p-1"
           style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', width: 'fit-content' }}>
        {[['activas', 'Activas'], ['historial', 'Historial'], ['catalogo', 'Catálogo de tareas']].map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)}
                  className="rounded-md px-3 py-1.5 text-sm"
                  style={{
                    background: vista === k ? 'var(--plane)' : 'transparent',
                    color: vista === k ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: vista === k ? 500 : 400,
                  }}>
            {l}
          </button>
        ))}
      </div>

      {(vista === 'activas' || vista === 'historial') && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="!w-auto">
              <option value="">Preventivo y correctivo</option>
              {TIPOS_ORDEN.map((t) => <option key={t} value={t}>{TIPOS[t].label}</option>)}
            </Select>
            <Select value={fSucursal} onChange={(e) => setFSucursal(e.target.value)} className="!w-auto">
              <option value="">Todas las sucursales</option>
              {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
            {vista === 'activas' && (
              <button onClick={() => setOrdenarCosto(!ordenarCosto)}
                      className="rounded-lg border px-3 py-2 text-xs font-medium"
                      style={{
                        borderColor: 'var(--border)',
                        background: ordenarCosto ? 'var(--series-1)' : 'transparent',
                        color: ordenarCosto ? '#fff' : 'var(--text-secondary)',
                      }}>
                Costo: mayor a menor
              </button>
            )}
          </div>
          <FiltroChips opciones={opcionesCategoria} valor={fCat} onChange={setFCat} todasLabel="Todas las categorías" />
        </div>
      )}

      {vista === 'activas' && (
        <div className="space-y-6">
          {seccion('En curso', 'ejecutándose ahora mismo', buckets.enCurso, 'var(--series-3)')}
          {seccion('Atrasado', 'sin fecha, vencidas o pospuestas', buckets.atrasado, 'var(--critical)')}
          {seccion('Próximo', 'programadas a futuro', buckets.proximo, 'var(--series-1)')}
        </div>
      )}

      {vista === 'historial' && (
        <Card>
          <Tabla
            vacio="Sin órdenes finalizadas todavía."
            columnas={[
              { key: 'fecha_realizada', header: 'Realizada', nowrap: true, render: (o) => fechaCorta(o.fecha_realizada) },
              { key: 'titulo', header: 'Orden', render: (o) => o.titulo },
              { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (o) => sucById[o.sucursal_id]?.codigo ?? '—' },
              { key: 'tipo', header: 'Tipo', nowrap: true,
                render: (o) => <Badge color={TIPOS[o.tipo]?.color}>{TIPOS[o.tipo]?.label}</Badge> },
              { key: 'estatus', header: 'Estatus', nowrap: true,
                render: (o) => <Badge color={COLOR_ESTATUS[o.estatus]}>{ESTATUS_ORDEN[o.estatus]}</Badge> },
              { key: 'proveedor_id', header: 'Proveedor', render: (o) => provById[o.proveedor_id]?.nombre ?? '—' },
              { key: 'costo_real', header: 'Costo real', align: 'right', nowrap: true,
                render: (o) => costoRealPorOrden[o.id] ? money(costoRealPorOrden[o.id]) : '—' },
              { key: 'duracion_real_horas', header: 'Duración', align: 'right', nowrap: true,
                render: (o) => o.duracion_real_horas ? `${o.duracion_real_horas} h` : '—' },
            ]}
            filas={historial}
          />
        </Card>
      )}

      {vista === 'catalogo' && (
        <Card subtitle="Tareas tipo extraídas de tus Exceles. Genera una orden para programarlas.">
          <Tabla
            vacio="Sin tareas en el catálogo."
            columnas={[
              { key: 'nombre', header: 'Tarea', render: (p) => (
                  <div>
                    <div>{p.nombre}</div>
                    {p.descripcion && (
                      <div className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{p.descripcion}</div>)}
                  </div>) },
              { key: 'categoria_id', header: 'Categoría', nowrap: true,
                render: (p) => catById[p.categoria_id]?.nombre ?? '—' },
              { key: 'frecuencia', header: 'Frecuencia', nowrap: true,
                render: (p) => FRECUENCIAS[p.frecuencia] ?? p.frecuencia },
              { key: 'servicio', header: 'Ejecuta', nowrap: true, render: (p) => p.servicio ?? '—' },
              ...(puedeGestionar ? [{ key: 'accion', header: '', nowrap: true, render: (p) => (
                  <button onClick={() => abrirNueva(p)} className="text-xs underline"
                          style={{ color: 'var(--series-1)' }}>Generar orden</button>) }] : []),
            ]}
            filas={d.planes}
          />
        </Card>
      )}

      {/* ---------------- Nueva / editar orden ---------------- */}
      <Modal abierto={modal} onClose={() => setModal(false)}
             titulo={form.id ? 'Editar orden' : 'Nueva orden de trabajo'}>
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Título" required>
            <Input value={form.titulo} required
                   onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </Campo>
          {form.tipo === 'correctivo' && (
            <Campo label="Tipo de falla" hint="Ej. no enfría, fuga de refrigerante, corto circuito">
              <Input value={form.tipo_falla}
                     onChange={(e) => setForm({ ...form, tipo_falla: e.target.value })} />
            </Campo>
          )}
          <Campo label="Descripción">
            <Textarea rows={2} value={form.descripcion}
                      onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Sucursal" required>
              <Select value={form.sucursal_id} required
                      onChange={(e) => setForm({ ...form, sucursal_id: e.target.value, activo_id: '' })}>
                <option value="">Selecciona…</option>
                {d.sucursales.filter((s) => s.activa).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>))}
              </Select>
            </Campo>
            <Campo label="Activo" hint="Opcional">
              <Select value={form.activo_id} disabled={!form.sucursal_id}
                      onChange={(e) => setForm({ ...form, activo_id: e.target.value })}>
                <option value="">Sin activo específico</option>
                {activosDeSucursal.map((a) => (
                  <option key={a.id} value={a.id}>{a.codigo ? `${a.codigo} — ${a.nombre}` : a.nombre}</option>))}
              </Select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo label="Tipo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS_ORDEN.map((t) => <option key={t} value={t}>{TIPOS[t].label}</option>)}
              </Select>
            </Campo>
            <Campo label="Criticidad">
              <Select value={form.criticidad} onChange={(e) => setForm({ ...form, criticidad: e.target.value })}>
                {Object.entries(CRITICIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Campo>
            <Campo label="Categoría">
              <Select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">Sin categoría</option>
                {d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Fecha programada">
              <Input type="date" value={form.fecha_programada}
                     onChange={(e) => setForm({ ...form, fecha_programada: e.target.value })} />
            </Campo>
            <Campo label="Estatus">
              <Select value={form.estatus} onChange={(e) => setForm({ ...form, estatus: e.target.value })}>
                {Object.entries(ESTATUS_ORDEN).filter(([k]) => k !== 'realizada').map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>))}
              </Select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Costo estimado">
              <Input inputMode="decimal" value={form.costo_estimado} placeholder="0.00"
                     onChange={(e) => setForm({ ...form, costo_estimado: e.target.value })} />
            </Campo>
            <Campo label="Duración estimada (horas)">
              <Input inputMode="decimal" value={form.duracion_estimada_horas} placeholder="0"
                     onChange={(e) => setForm({ ...form, duracion_estimada_horas: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Proveedor" hint="Opcional — también se puede asignar al finalizar">
            <SelectorProveedor proveedores={d.proveedores} value={form.proveedor_id}
                               onChange={(v) => setForm({ ...form, proveedor_id: v })}
                               onCreado={agregarProveedor} />
          </Campo>
          <Campo label="Notas">
            <Textarea rows={2} value={form.notas}
                      onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Finalizar orden: captura el gasto ---------------- */}
      <Modal abierto={!!ordenActiva} onClose={() => !guardando && setOrdenActiva(null)}
             titulo={`Finalizar — ${ordenActiva?.titulo ?? ''}`}>
        {ordenActiva && (
          <form onSubmit={finalizar} className="space-y-3">
            <Aviso>
              Al finalizar se crea el registro de gasto ligado a esta orden y ya no podrá
              capturarse por separado en el módulo de Gastos.
            </Aviso>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Fecha de realización" required>
                <Input type="date" value={formFinal.fecha_realizada} required
                       onChange={(e) => setFormFinal({ ...formFinal, fecha_realizada: e.target.value })} />
              </Campo>
              <Campo label="Duración real (horas)">
                <Input inputMode="decimal" value={formFinal.duracion_real_horas} placeholder="0"
                       onChange={(e) => setFormFinal({ ...formFinal, duracion_real_horas: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Proveedor" required>
              <SelectorProveedor proveedores={d.proveedores} value={formFinal.proveedor_id} required
                                 onChange={(v) => setFormFinal({ ...formFinal, proveedor_id: v })}
                                 onCreado={agregarProveedor} />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Se pagó con" required>
                <Select value={formFinal.unidad_pago}
                        onChange={(e) => setFormFinal({ ...formFinal, unidad_pago: e.target.value })}>
                  <option value="compania">Presupuesto (compañía)</option>
                  <option value="caja_chica">Caja chica</option>
                  <option value="empleado">Empleado (a reembolsar)</option>
                </Select>
              </Campo>
              <Campo label="Monto" required>
                <Input inputMode="decimal" value={formFinal.monto} required placeholder="0.00"
                       onChange={(e) => setFormFinal({ ...formFinal, monto: e.target.value })} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Estatus de pago">
                <Select value={formFinal.estatus_pago}
                        onChange={(e) => setFormFinal({ ...formFinal, estatus_pago: e.target.value })}>
                  <option value="pagado">Pagado</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="a_enviar">A enviar</option>
                </Select>
              </Campo>
              <Campo label="Folio / factura" hint="Opcional">
                <Input value={formFinal.factura}
                       onChange={(e) => setFormFinal({ ...formFinal, factura: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Comprobante de cotización" required hint="Foto o PDF">
              <ArchivoInput accept="image/*,.pdf"
                            onChange={(f) => setFormFinal({ ...formFinal, archivoCotizacion: f })} />
            </Campo>
            <Campo label="Comprobante de gasto (factura o recibo)" required hint="Foto o PDF">
              <ArchivoInput accept="image/*,.pdf"
                            onChange={(f) => setFormFinal({ ...formFinal, archivoComprobante: f })} />
            </Campo>

            {formError && <Aviso tono="critical">{formError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setOrdenActiva(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" disabled={guardando}>{subiendo || (guardando ? 'Guardando…' : 'Finalizar orden')}</Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
