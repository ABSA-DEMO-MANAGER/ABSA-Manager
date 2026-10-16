import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { subirArchivo, urlFirmada } from '../lib/storage';
import { useAuth } from '../lib/auth';
import {
  fechaCorta, hoyISO, money, pct, FRECUENCIAS, ESTATUS_ORDEN, TIPOS, CRITICIDAD, PRIORIDAD_SOLICITUD,
} from '../lib/format';
import {
  Card, Tabla, Boton, Campo, Input, Select, Textarea, Modal,
  Cargando, Aviso, Badge, Stat, FiltroChips,
} from '../components/ui';
import SelectorProveedor from '../components/SelectorProveedor';
import { FotoOPdfInput } from '../components/FotoInput';
import FotoFirmada from '../components/FotoFirmada';
import ChecklistFotos, { fotosVaciasUnidad, cuentaFotosUnidad } from '../components/ChecklistFotos';

const COLOR_ESTATUS = {
  programada: 'var(--series-1)', en_proceso: 'var(--series-3)',
  realizada: 'var(--good)', pospuesta: 'var(--serious)', cancelada: 'var(--text-muted)',
};

const TIPOS_ORDEN = ['preventivo', 'correctivo'];

// Por ahora hardcodeado (coincide con la decision ya aprobada en el
// documento: "Tres cotizaciones obligatorias arriba de $1,500 con
// IVA"); se vuelve configurable por el admin en el paso 7.
const UMBRAL_TRES_COTIZACIONES = 1500;
// Mismo criterio: gastos de $500 o menos no necesitan autorizacion
// previa (solo comprobacion); arriba de $500 se gestionan desde
// Aprobaciones. Tambien hardcodeado hasta el paso 7.
const UMBRAL_SIN_AUTORIZACION = 500;

const EXCEPCIONES_COTIZACION = {
  emergencia_p1: 'Emergencia P1',
  proveedor_unico: 'Proveedor único',
  garantia_vigente: 'Garantía vigente',
  contrato_autorizado: 'Contrato autorizado',
  falta_respuesta: 'Falta de respuesta',
  especialidad_sin_oferta: 'Especialidad sin oferta suficiente',
  continuidad_trabajo: 'Continuidad de un trabajo iniciado',
};

const COT_VACIO = {
  proveedor_id: '', monto: '', iva: '', vigencia: '', tiempo_entrega: '', garantia: '',
  cumple_alcance: true, archivo: null,
};

const FORM_VACIO = {
  id: null, plan_id: '', sucursal_id: '', activo_id: '', proveedor_id: '',
  titulo: '', descripcion: '', tipo: 'correctivo', tipo_falla: '', criticidad: 'B', categoria_id: '',
  fecha_programada: hoyISO(), fecha_realizada: '', estatus: 'programada',
  costo_estimado: '', duracion_estimada_horas: '', notas: '',
  diagnostico: '', alcance: '', fecha_compromiso: '', prioridad: 'P3', requiere_proveedor: false,
  cotizacion_excepcion: '', cotizacion_excepcion_motivo: '',
};

const FORM_FINAL_VACIO = {
  fecha_realizada: hoyISO(), duracion_real_horas: '', proveedor_id: '',
  unidad_pago: 'compania', estatus_pago: 'pagado', monto: '', cotizaciones: 1,
  factura: '', archivoCotizacion: null, archivoComprobante: null,
};

export default function Plan() {
  const { perfil, puedeGestionar } = useAuth();
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
  const [fotosDespues, setFotosDespues] = useState(fotosVaciasUnidad());
  const [subiendo, setSubiendo] = useState(null); // texto de progreso
  const [fotosAntes, setFotosAntes] = useState(fotosVaciasUnidad());

  const [cotForm, setCotForm] = useState(COT_VACIO);
  const [cotGuardando, setCotGuardando] = useState(false);
  const [cotError, setCotError] = useState(null);

  async function cargar() {
    const [o, p, s, c, a, prov, g, ev, cot] = await Promise.all([
      supabase.from('ordenes')
        .select('id, folio, sucursal_id, activo_id, plan_id, proveedor_id, tipo, titulo, descripcion, tipo_falla, criticidad, categoria_id, fecha_programada, fecha_realizada, estatus, costo_estimado, duracion_estimada_horas, duracion_real_horas, notas, diagnostico, alcance, fecha_compromiso, prioridad, requiere_proveedor, cotizacion_excepcion, cotizacion_excepcion_motivo')
        .order('fecha_programada', { ascending: true, nullsFirst: false }).limit(2000),
      supabase.from('planes').select('id, nombre, descripcion, frecuencia, servicio, categoria_id, activo').order('nombre'),
      supabase.from('sucursales').select('id, codigo, nombre, activa').order('codigo'),
      supabase.from('categorias').select('id, nombre').order('orden'),
      supabase.from('activos').select('id, sucursal_id, nombre, codigo').order('nombre'),
      supabase.from('proveedores').select('id, nombre').order('nombre'),
      supabase.from('gastos').select('orden_id, monto').not('orden_id', 'is', null),
      supabase.from('ordenes_evidencias').select('id, orden_id, momento, archivo_path'),
      supabase.from('cotizaciones')
        .select('id, orden_id, proveedor_id, monto, iva, total, vigencia, tiempo_entrega, garantia, cumple_alcance, archivo_path, creado_en'),
    ]);
    const err = o.error || p.error || s.error || c.error || a.error || prov.error || g.error || ev.error || cot.error;
    if (err) { setError(err.message); return; }
    setD({
      ordenes: o.data, planes: p.data, sucursales: s.data, categorias: c.data,
      activos: a.data, proveedores: prov.data, gastos: g.data, evidencias: ev.data, cotizaciones: cot.data,
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
    setFotosAntes(fotosVaciasUnidad());
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
      diagnostico: o.diagnostico ?? '', alcance: o.alcance ?? '', fecha_compromiso: o.fecha_compromiso ?? '',
      prioridad: o.prioridad ?? 'P3', requiere_proveedor: o.requiere_proveedor ?? false,
      cotizacion_excepcion: o.cotizacion_excepcion ?? '', cotizacion_excepcion_motivo: o.cotizacion_excepcion_motivo ?? '',
    });
    setFotosAntes(fotosVaciasUnidad());
    setCotForm(COT_VACIO); setCotError(null);
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
      diagnostico: form.diagnostico.trim() || null,
      alcance: form.alcance.trim() || null,
      fecha_compromiso: form.fecha_compromiso || null,
      prioridad: form.prioridad || null,
      requiere_proveedor: form.requiere_proveedor,
      cotizacion_excepcion: form.cotizacion_excepcion || null,
      cotizacion_excepcion_motivo: form.cotizacion_excepcion ? (form.cotizacion_excepcion_motivo.trim() || null) : null,
    };
    setGuardando(true);
    const { data: ordenGuardada, error: err } = form.id
      ? await supabase.from('ordenes').update(payload).eq('id', form.id).select('id').maybeSingle()
      : await supabase.from('ordenes').insert(payload).select('id').maybeSingle();
    if (err) { setGuardando(false); return setFormError(err.message); }

    for (const file of fotosAntes) {
      const ruta = await subirArchivo(file, `ordenes/${ordenGuardada.id}`);
      await supabase.from('ordenes_evidencias').insert({ orden_id: ordenGuardada.id, momento: 'antes', archivo_path: ruta });
    }

    setGuardando(false);
    setModal(false); cargar();
  }

  // ------------------------------------------------------------ cotizaciones
  async function agregarCotizacion() {
    setCotError(null);
    if (!cotForm.proveedor_id) return setCotError('Selecciona el proveedor.');
    const monto = parseFloat(String(cotForm.monto).replace(/[$,\s]/g, ''));
    if (isNaN(monto) || monto <= 0) return setCotError('Captura un monto válido.');
    const ivaNum = cotForm.iva === '' ? null : parseFloat(String(cotForm.iva).replace(/[$,\s]/g, ''));
    const total = monto + (ivaNum && !isNaN(ivaNum) ? ivaNum : 0);

    setCotGuardando(true);
    try {
      let archivo_path = null;
      if (cotForm.archivo) archivo_path = await subirArchivo(cotForm.archivo, `ordenes/${form.id}/cotizaciones`);
      const { error: err } = await supabase.from('cotizaciones').insert({
        orden_id: form.id, proveedor_id: Number(cotForm.proveedor_id),
        monto, iva: ivaNum && !isNaN(ivaNum) ? ivaNum : null, total,
        vigencia: cotForm.vigencia || null, tiempo_entrega: cotForm.tiempo_entrega.trim() || null,
        garantia: cotForm.garantia.trim() || null, cumple_alcance: cotForm.cumple_alcance,
        archivo_path, creado_por: perfil.id,
      });
      if (err) throw err;
      setCotForm(COT_VACIO);
      cargar();
    } catch (err) {
      setCotError(err.message);
    } finally {
      setCotGuardando(false);
    }
  }

  async function quitarCotizacion(id) {
    if (!confirm('¿Quitar esta cotización?')) return;
    await supabase.from('cotizaciones').delete().eq('id', id);
    cargar();
  }

  async function verArchivo(path) {
    const url = await urlFirmada(path);
    if (url) window.open(url, '_blank');
  }

  // ------------------------------------------------------ iniciar/finalizar
  async function iniciar(o) {
    await supabase.from('ordenes').update({ estatus: 'en_proceso' }).eq('id', o.id);
    cargar();
  }

  function abrirFinalizar(o) {
    setOrdenActiva(o);
    setFormFinal({ ...FORM_FINAL_VACIO, proveedor_id: o.proveedor_id ? String(o.proveedor_id) : '' });
    setFotosDespues(fotosVaciasUnidad());
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
    if (cuentaFotosUnidad(fotosDespues) === 0) return setFormError('Sube al menos una foto de evidencia de cómo quedó el trabajo.');
    if (monto > UMBRAL_TRES_COTIZACIONES && !ordenActiva.cotizacion_excepcion) {
      const cumplen = (d.cotizaciones ?? []).filter((c) => c.orden_id === ordenActiva.id && c.cumple_alcance).length;
      if (cumplen < 3) {
        return setFormError(
          `Esta orden supera $${UMBRAL_TRES_COTIZACIONES} — necesita 3 cotizaciones que cumplan el alcance ` +
          `(tiene ${cumplen}) o una excepción registrada. Agrégalas desde "Editar orden".`
        );
      }
    }

    setGuardando(true);
    try {
      setSubiendo('Subiendo cotización…');
      const rutaCot = await subirArchivo(formFinal.archivoCotizacion, `ordenes/${ordenActiva.id}`);
      setSubiendo('Subiendo comprobante de gasto…');
      const rutaComp = await subirArchivo(formFinal.archivoComprobante, `ordenes/${ordenActiva.id}`);
      setSubiendo('Subiendo evidencia…');
      for (const file of fotosDespues) {
        const ruta = await subirArchivo(file, `ordenes/${ordenActiva.id}`);
        await supabase.from('ordenes_evidencias').insert({ orden_id: ordenActiva.id, momento: 'despues', archivo_path: ruta });
      }
      setSubiendo('Guardando…');

      const { error: errGasto } = await supabase.from('gastos').insert({
        fecha: formFinal.fecha_realizada,
        sucursal_id: ordenActiva.sucursal_id,
        orden_id: ordenActiva.id,
        proveedor_id: Number(formFinal.proveedor_id),
        concepto: ordenActiva.titulo,
        tipo: ordenActiva.tipo,
        unidad_pago: formFinal.unidad_pago,
        // Arriba del umbral, nunca se manda directo a aprobado/pagado aunque
        // el formulario traiga otra cosa -- tiene que pasar por Aprobaciones.
        estatus_pago: monto > UMBRAL_SIN_AUTORIZACION ? 'a_enviar' : formFinal.estatus_pago,
        cotizaciones: Number(formFinal.cotizaciones) || 1,
        monto,
        factura: formFinal.factura.trim() || null,
        comprobante_cotizacion_path: rutaCot,
        comprobante_gasto_path: rutaComp,
        comprobante_path: rutaComp, comprobado_en: new Date().toISOString(),
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
    { key: 'prioridad', header: 'Prioridad', nowrap: true,
      render: (o) => o.prioridad ? <Badge color={PRIORIDAD_SOLICITUD[o.prioridad]?.color}>{o.prioridad}</Badge> : '—' },
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
          <Campo label="Diagnóstico" hint="Opcional — causa, riesgo e impacto encontrados">
            <Textarea rows={2} value={form.diagnostico}
                      onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} />
          </Campo>
          <Campo label="Alcance" hint="Opcional — actividades, cantidades y entrega esperada">
            <Textarea rows={2} value={form.alcance}
                      onChange={(e) => setForm({ ...form, alcance: e.target.value })} />
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
            <Campo label="Fecha compromiso" hint="Opcional">
              <Input type="date" value={form.fecha_compromiso}
                     onChange={(e) => setForm({ ...form, fecha_compromiso: e.target.value })} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Prioridad">
              <Select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                {Object.entries(PRIORIDAD_SOLICITUD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
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
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.requiere_proveedor}
                   onChange={(e) => setForm({ ...form, requiere_proveedor: e.target.checked })} />
            Requiere contratación externa (no se puede resolver con el equipo interno)
          </label>
          {form.id && (d.evidencias ?? []).some((ev) => ev.orden_id === form.id && ev.momento === 'antes') && (
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>Evidencia "antes" ya guardada</div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {d.evidencias.filter((ev) => ev.orden_id === form.id && ev.momento === 'antes').map((ev) => (
                  <div key={ev.id} className="aspect-square">
                    <FotoFirmada path={ev.archivo_path} alt="" className="block h-full w-full" />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Evidencia "antes" — opcional
            </div>
            <ChecklistFotos valor={fotosAntes} onChange={setFotosAntes} />
          </div>

          {form.id && (() => {
            const lista = (d.cotizaciones ?? []).filter((c) => c.orden_id === form.id);
            const mejorTotal = Math.min(
              ...lista.filter((c) => c.cumple_alcance).map((c) => Number(c.total)),
              Infinity,
            );
            return (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Cotizaciones {lista.length > 0 && `(${lista.length})`}
                </div>
                {lista.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {lista.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-xs"
                           style={{ borderColor: 'var(--border)' }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{provById[c.proveedor_id]?.nombre ?? c.proveedor_nombre ?? '—'}</span>
                          <span className="tnum">{money(c.total)}</span>
                          {!c.cumple_alcance && <Badge color="var(--critical)">No cumple alcance</Badge>}
                          {c.cumple_alcance && Number(c.total) === mejorTotal && <Badge color="var(--good)">Recomendada</Badge>}
                          {c.vigencia && <span style={{ color: 'var(--text-muted)' }}>vigente a {fechaCorta(c.vigencia)}</span>}
                          {c.archivo_path && (
                            <button type="button" onClick={() => verArchivo(c.archivo_path)}
                                    className="underline" style={{ color: 'var(--series-1)' }}>Ver archivo</button>
                          )}
                        </div>
                        <button type="button" onClick={() => quitarCotizacion(c.id)} className="underline" style={{ color: 'var(--critical)' }}>
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <SelectorProveedor proveedores={d.proveedores} value={cotForm.proveedor_id}
                                     onChange={(v) => setCotForm({ ...cotForm, proveedor_id: v })}
                                     onCreado={agregarProveedor} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input inputMode="decimal" placeholder="Monto" value={cotForm.monto}
                           onChange={(e) => setCotForm({ ...cotForm, monto: e.target.value })} />
                    <Input inputMode="decimal" placeholder="IVA" value={cotForm.iva}
                           onChange={(e) => setCotForm({ ...cotForm, iva: e.target.value })} />
                  </div>
                  <Input type="date" placeholder="Vigencia" value={cotForm.vigencia}
                         onChange={(e) => setCotForm({ ...cotForm, vigencia: e.target.value })} />
                  <Input placeholder="Tiempo de entrega" value={cotForm.tiempo_entrega}
                         onChange={(e) => setCotForm({ ...cotForm, tiempo_entrega: e.target.value })} />
                  <Input placeholder="Garantía" value={cotForm.garantia}
                         onChange={(e) => setCotForm({ ...cotForm, garantia: e.target.value })} />
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={cotForm.cumple_alcance}
                           onChange={(e) => setCotForm({ ...cotForm, cumple_alcance: e.target.checked })} />
                    Cumple el alcance solicitado
                  </label>
                </div>
                <div className="mt-2">
                  <FotoOPdfInput value={cotForm.archivo} onChange={(f) => setCotForm({ ...cotForm, archivo: f })} />
                </div>
                {cotError && <Aviso tono="critical">{cotError}</Aviso>}
                <div className="mt-2 flex justify-end">
                  <Boton type="button" variant="ghost" disabled={cotGuardando} onClick={agregarCotizacion}>
                    {cotGuardando ? 'Agregando…' : '+ Agregar cotización'}
                  </Boton>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Excepción a las 3 cotizaciones" hint="Opcional — solo si no se van a juntar 3 propuestas">
              <Select value={form.cotizacion_excepcion} onChange={(e) => setForm({ ...form, cotizacion_excepcion: e.target.value })}>
                <option value="">Sin excepción</option>
                {Object.entries(EXCEPCIONES_COTIZACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
            {form.cotizacion_excepcion && (
              <Campo label="Motivo de la excepción" required>
                <Input value={form.cotizacion_excepcion_motivo} required
                       onChange={(e) => setForm({ ...form, cotizacion_excepcion_motivo: e.target.value })} />
              </Campo>
            )}
          </div>

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
        {ordenActiva && (() => {
          const montoFinalNum = parseFloat(String(formFinal.monto).replace(/[$,\s]/g, '')) || 0;
          const requiereAutorizacion = montoFinalNum > UMBRAL_SIN_AUTORIZACION;
          return (
          <form onSubmit={finalizar} className="space-y-3">
            <Aviso>
              Al finalizar se crea el registro de gasto ligado a esta orden y ya no podrá
              capturarse por separado en el módulo de Gastos.
            </Aviso>
            {requiereAutorizacion && (
              <Aviso tono="warning">
                Este gasto supera ${UMBRAL_SIN_AUTORIZACION} — se enviará a Aprobaciones en vez de marcarse pagado.
              </Aviso>
            )}
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
              <Campo label="Estatus de pago" hint={requiereAutorizacion ? 'Arriba del umbral — se envía a Aprobaciones' : undefined}>
                <Select value={requiereAutorizacion ? 'a_enviar' : formFinal.estatus_pago} disabled={requiereAutorizacion}
                        onChange={(e) => setFormFinal({ ...formFinal, estatus_pago: e.target.value })}>
                  {!requiereAutorizacion && <option value="pagado">Pagado</option>}
                  {!requiereAutorizacion && <option value="aprobado">Aprobado</option>}
                  <option value="a_enviar">A enviar</option>
                </Select>
              </Campo>
              <Campo label="Folio / factura" hint="Opcional">
                <Input value={formFinal.factura}
                       onChange={(e) => setFormFinal({ ...formFinal, factura: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Comprobante de cotización" required hint="Foto (con cámara) o PDF">
              <FotoOPdfInput value={formFinal.archivoCotizacion}
                             onChange={(f) => setFormFinal({ ...formFinal, archivoCotizacion: f })} />
            </Campo>
            <Campo label="Comprobante de gasto (factura o recibo)" required hint="Foto (con cámara) o PDF">
              <FotoOPdfInput value={formFinal.archivoComprobante}
                             onChange={(f) => setFormFinal({ ...formFinal, archivoComprobante: f })} />
            </Campo>
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2 text-xs font-medium" style={{ color: 'var(--good)' }}>
                Evidencia "después" — obligatoria
              </div>
              <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                Cómo quedó el trabajo terminado.
              </p>
              <ChecklistFotos valor={fotosDespues} onChange={setFotosDespues} />
            </div>

            {formError && <Aviso tono="critical">{formError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setOrdenActiva(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" disabled={guardando}>{subiendo || (guardando ? 'Guardando…' : 'Finalizar orden')}</Boton>
            </div>
          </form>
          );
        })()}
      </Modal>
    </div>
  );
}
