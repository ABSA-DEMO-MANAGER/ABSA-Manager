import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { subirArchivo, urlFirmada } from '../lib/storage';
import SelectorProveedor from '../components/SelectorProveedor';
import { useAuth } from '../lib/auth';
import { money, fechaCorta, hoyISO, TIPOS, CRITICIDAD, ESTATUS_ORDEN } from '../lib/format';
import {
  Cargando, Aviso, Badge, Stat, Tabla, Modal, Campo, Input, Select, Textarea,
  Boton, ArchivoInput, Card,
} from '../components/ui';

const COLOR_ESTATUS = {
  programada: 'var(--series-1)', en_proceso: 'var(--series-3)',
  realizada: 'var(--good)', pospuesta: 'var(--serious)', cancelada: 'var(--text-muted)',
};

const FORM_MANT_VACIO = {
  tipo: 'correctivo', tipo_falla: '', titulo: '', descripcion: '',
  criticidad: 'B', fecha_programada: hoyISO(), costo_estimado: '',
  duracion_estimada_horas: '', proveedor_id: '',
};

export default function ActivoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil, esAdmin, puedeGestionar } = useAuth();

  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [fotoUrl, setFotoUrl] = useState(null);

  const [modalMant, setModalMant] = useState(false);
  const [formMant, setFormMant] = useState(FORM_MANT_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [modalEditar, setModalEditar] = useState(false);
  const [formEditar, setFormEditar] = useState(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  async function cargar() {
    const [a, s, c, o, prov, cambios, perfiles] = await Promise.all([
      supabase.from('activos')
        .select('id, sucursal_id, categoria_id, codigo, nombre, ubicacion, tipo, marca, modelo, serie, capacidad, criticidad, ultimo_servicio, fecha_instalacion, atributos, notas, foto_path')
        .eq('id', id).maybeSingle(),
      supabase.from('sucursales').select('id, codigo, nombre').order('codigo'),
      supabase.from('categorias').select('id, nombre').order('orden'),
      supabase.from('ordenes')
        .select('id, tipo, tipo_falla, titulo, descripcion, criticidad, fecha_programada, fecha_realizada, estatus, costo_estimado, duracion_estimada_horas, duracion_real_horas, proveedor_id')
        .eq('activo_id', id).order('fecha_programada', { ascending: false, nullsFirst: false }),
      supabase.from('proveedores').select('id, nombre').order('nombre'),
      supabase.from('activos_cambios')
        .select('id, tipo, datos, estatus, solicitado_por, solicitado_en, resuelto_por, resuelto_en, nota_resolucion')
        .eq('activo_id', id).order('solicitado_en', { ascending: false }),
      supabase.from('perfiles').select('id, nombre'),
    ]);
    const err = a.error || s.error || c.error || o.error || prov.error || cambios.error || perfiles.error;
    if (err) { setError(err.message); return; }
    if (!a.data) { setError('no-existe'); return; }

    const ordenIds = o.data.map((x) => x.id);
    let gastos = [];
    if (ordenIds.length) {
      const g = await supabase.from('gastos')
        .select('orden_id, monto, comprobante_cotizacion_path, comprobante_gasto_path')
        .in('orden_id', ordenIds);
      if (g.error) { setError(g.error.message); return; }
      gastos = g.data;
    }

    setD({
      activo: a.data, sucursales: s.data, categorias: c.data, ordenes: o.data, proveedores: prov.data, gastos,
      cambios: cambios.data, perfiles: perfiles.data,
    });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!d?.activo?.foto_path) { setFotoUrl(null); return; }
    urlFirmada(d.activo.foto_path).then(setFotoUrl);
  }, [d?.activo?.foto_path]);

  const sucById = useMemo(() => Object.fromEntries((d?.sucursales ?? []).map((s) => [s.id, s])), [d]);
  const catById = useMemo(() => Object.fromEntries((d?.categorias ?? []).map((c) => [c.id, c])), [d]);
  const provById = useMemo(() => Object.fromEntries((d?.proveedores ?? []).map((p) => [p.id, p])), [d]);
  const perfilById = useMemo(() => Object.fromEntries((d?.perfiles ?? []).map((p) => [p.id, p])), [d]);
  const cambioPendiente = useMemo(() => (d?.cambios ?? []).find((c) => c.estatus === 'pendiente'), [d]);

  const gastoPorOrden = useMemo(() => {
    const m = {};
    (d?.gastos ?? []).forEach((g) => {
      m[g.orden_id] ??= { monto: 0, cot: null, comp: null };
      m[g.orden_id].monto += Number(g.monto);
      if (g.comprobante_cotizacion_path) m[g.orden_id].cot = g.comprobante_cotizacion_path;
      if (g.comprobante_gasto_path) m[g.orden_id].comp = g.comprobante_gasto_path;
    });
    return m;
  }, [d]);

  const stats = useMemo(() => {
    if (!d) return null;
    const realizadas = d.ordenes.filter((o) => o.estatus === 'realizada');
    const gastoTotal = Object.values(gastoPorOrden).reduce((a, g) => a + g.monto, 0);
    return {
      total: d.ordenes.length,
      enCurso: d.ordenes.filter((o) => o.estatus === 'en_proceso').length,
      gastoTotal,
      ultimoServicio: realizadas[0]?.fecha_realizada ?? d.activo.ultimo_servicio,
    };
  }, [d, gastoPorOrden]);

  // ------------------------------------------------------- nuevo mantenimiento
  function abrirNuevoMantenimiento() {
    setFormMant({ ...FORM_MANT_VACIO, titulo: d.activo.nombre, criticidad: d.activo.criticidad });
    setFormError(null); setModalMant(true);
  }

  async function guardarMantenimiento(e) {
    e.preventDefault();
    setFormError(null);
    if (!formMant.titulo.trim()) return setFormError('Escribe un título.');
    if (formMant.tipo === 'correctivo' && !formMant.tipo_falla.trim())
      return setFormError('Describe el tipo de falla.');

    setGuardando(true);
    const { error: err } = await supabase.from('ordenes').insert({
      sucursal_id: d.activo.sucursal_id,
      activo_id: d.activo.id,
      categoria_id: d.activo.categoria_id,
      tipo: formMant.tipo,
      tipo_falla: formMant.tipo === 'correctivo' ? formMant.tipo_falla.trim() : null,
      titulo: formMant.titulo.trim(),
      descripcion: formMant.descripcion.trim() || null,
      criticidad: formMant.criticidad || null,
      fecha_programada: formMant.fecha_programada || null,
      estatus: 'programada',
      costo_estimado: formMant.costo_estimado === '' ? null : Number(formMant.costo_estimado),
      duracion_estimada_horas: formMant.duracion_estimada_horas === '' ? null : Number(formMant.duracion_estimada_horas),
      proveedor_id: formMant.proveedor_id ? Number(formMant.proveedor_id) : null,
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModalMant(false); cargar();
  }

  // ------------------------------------------------------ editar datos técnicos
  function abrirEditar() {
    setFormEditar({
      nombre: d.activo.nombre, codigo: d.activo.codigo ?? '', ubicacion: d.activo.ubicacion ?? '',
      tipo: d.activo.tipo ?? '', marca: d.activo.marca ?? '', modelo: d.activo.modelo ?? '',
      serie: d.activo.serie ?? '', capacidad: d.activo.capacidad ?? '',
      criticidad: d.activo.criticidad, categoria_id: d.activo.categoria_id ? String(d.activo.categoria_id) : '',
      notas: d.activo.notas ?? '', foto: null,
    });
    setFormError(null); setModalEditar(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setFormError(null);
    if (!formEditar.nombre.trim()) return setFormError('El nombre no puede quedar vacío.');

    setGuardando(true);
    try {
      let foto_path = d.activo.foto_path;
      if (formEditar.foto) {
        setSubiendoFoto(true);
        foto_path = await subirArchivo(formEditar.foto, `activos/${d.activo.id}`);
      }
      const datos = {
        nombre: formEditar.nombre.trim(),
        codigo: formEditar.codigo.trim() || null,
        ubicacion: formEditar.ubicacion.trim() || null,
        tipo: formEditar.tipo.trim() || null,
        marca: formEditar.marca.trim() || null,
        modelo: formEditar.modelo.trim() || null,
        serie: formEditar.serie.trim() || null,
        capacidad: formEditar.capacidad.trim() || null,
        criticidad: formEditar.criticidad,
        categoria_id: formEditar.categoria_id ? Number(formEditar.categoria_id) : null,
        notas: formEditar.notas.trim() || null,
        foto_path,
      };

      if (esAdmin) {
        const { error: err } = await supabase.from('activos').update(datos).eq('id', d.activo.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('activos_cambios').insert({
          activo_id: d.activo.id, tipo: 'modificacion', datos, solicitado_por: perfil.id,
        });
        if (err) throw err;
      }
      setModalEditar(false); cargar();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setGuardando(false); setSubiendoFoto(false);
    }
  }

  async function resolverCambio(cambio, aprobar) {
    if (!aprobar) {
      const motivo = prompt('¿Por qué se rechaza este cambio? (opcional)') ?? '';
      await supabase.from('activos_cambios')
        .update({ estatus: 'rechazado', resuelto_por: perfil.id, resuelto_en: new Date().toISOString(), nota_resolucion: motivo || null })
        .eq('id', cambio.id);
      cargar();
      return;
    }
    const { error: err } = await supabase.from('activos').update(cambio.datos).eq('id', d.activo.id);
    if (err) { alert(err.message); return; }
    await supabase.from('activos_cambios')
      .update({ estatus: 'aprobado', resuelto_por: perfil.id, resuelto_en: new Date().toISOString() })
      .eq('id', cambio.id);
    cargar();
  }

  async function verArchivo(ruta) {
    const url = await urlFirmada(ruta);
    if (url) window.open(url, '_blank', 'noopener');
    else alert('No se pudo abrir el archivo.');
  }

  if (error === 'no-existe') {
    return (
      <div className="space-y-3">
        <Aviso tono="critical">Este activo no existe o no tienes acceso a él.</Aviso>
        <Link to="/mantenimiento/activos" className="text-sm underline" style={{ color: 'var(--series-1)' }}>
          ← Volver a activos
        </Link>
      </div>
    );
  }
  if (error) return <Aviso tono="critical">No se pudo cargar el activo: {error}</Aviso>;
  if (!d) return <Cargando />;

  const { activo } = d;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="text-sm underline" style={{ color: 'var(--text-secondary)' }}>
        ← Volver
      </button>

      <div className="flex flex-wrap items-start gap-4">
        {fotoUrl ? (
          <img src={fotoUrl} alt={activo.nombre} className="h-20 w-20 shrink-0 rounded-xl object-cover"
               style={{ border: '1px solid var(--border)' }} />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-2xl"
               style={{ background: 'var(--plane)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
               aria-hidden="true">
            ⚙
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{activo.nombre}</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {sucById[activo.sucursal_id]?.nombre}
            {activo.ubicacion && ` · ${activo.ubicacion}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activo.codigo && <Badge dot={false}>{activo.codigo}</Badge>}
            <Badge color={CRITICIDAD[activo.criticidad]?.color}>{CRITICIDAD[activo.criticidad]?.label}</Badge>
            {catById[activo.categoria_id]?.nombre && <Badge dot={false}>{catById[activo.categoria_id].nombre}</Badge>}
          </div>
        </div>
      </div>

      {puedeGestionar && (
        <div className="flex flex-wrap gap-2">
          <Boton onClick={abrirNuevoMantenimiento}>+ Nuevo mantenimiento</Boton>
          <Boton variant="ghost" onClick={abrirEditar}>{esAdmin ? 'Editar datos' : 'Proponer cambio'}</Boton>
        </div>
      )}

      {cambioPendiente && (
        <Aviso tono="warning">
          {esAdmin
            ? <>Hay un cambio pendiente de aprobar, propuesto por <strong>{perfilById[cambioPendiente.solicitado_por]?.nombre ?? 'alguien'}</strong>. Ábrelo abajo en "Historial de cambios" para aprobarlo o rechazarlo.</>
            : <>Tienes un cambio propuesto esperando aprobación del administrador.</>}
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mantenimientos" value={stats.total} />
        <Stat label="En curso" value={stats.enCurso} tone={stats.enCurso ? 'warning' : undefined} />
        <Stat label="Gasto acumulado" value={money(stats.gastoTotal)} />
        <Stat label="Último servicio" value={stats.ultimoServicio ? fechaCorta(stats.ultimoServicio) : '—'} />
      </div>

      <Card title="Datos técnicos">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['Tipo', activo.tipo],
            ['Marca', activo.marca],
            ['Modelo', activo.modelo],
            ['Número de serie', activo.serie],
            ['Capacidad', activo.capacidad],
            ['Instalación', activo.fecha_instalacion && fechaCorta(activo.fecha_instalacion)],
            ...Object.entries(activo.atributos ?? {}).map(([k, v]) =>
              [k.replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase()), v]),
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <dt style={{ color: 'var(--text-secondary)' }}>{k}</dt>
              <dd className="text-right font-medium">{String(v)}</dd>
            </div>
          ))}
        </dl>
        {activo.notas && (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{activo.notas}</p>
        )}
      </Card>

      <div>
        <h2 className="mb-2 text-base font-semibold tracking-tight">Mantenimientos</h2>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin mantenimientos registrados para este equipo todavía."
              columnas={[
                { key: 'fecha', header: 'Fecha', nowrap: true,
                  render: (o) => fechaCorta(o.fecha_realizada ?? o.fecha_programada) },
                { key: 'titulo', header: 'Orden', render: (o) => (
                    <div>
                      <div>{o.titulo}</div>
                      {o.tipo_falla && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Falla: {o.tipo_falla}</div>)}
                    </div>) },
                { key: 'tipo', header: 'Tipo', nowrap: true,
                  render: (o) => <Badge color={TIPOS[o.tipo]?.color}>{TIPOS[o.tipo]?.label}</Badge> },
                { key: 'estatus', header: 'Estatus', nowrap: true,
                  render: (o) => <Badge color={COLOR_ESTATUS[o.estatus]}>{ESTATUS_ORDEN[o.estatus]}</Badge> },
                { key: 'proveedor', header: 'Proveedor', render: (o) => provById[o.proveedor_id]?.nombre ?? '—' },
                { key: 'costo', header: 'Costo', align: 'right', nowrap: true, render: (o) =>
                    gastoPorOrden[o.id]?.monto ? money(gastoPorOrden[o.id].monto)
                      : (o.costo_estimado ? `~${money(o.costo_estimado)}` : '—') },
                { key: 'comprobantes', header: '', nowrap: true, render: (o) => (
                    gastoPorOrden[o.id] ? (
                      <div className="flex gap-2 text-xs">
                        {gastoPorOrden[o.id].cot && (
                          <button onClick={() => verArchivo(gastoPorOrden[o.id].cot)} className="underline"
                                  style={{ color: 'var(--series-1)' }}>Cotización</button>)}
                        {gastoPorOrden[o.id].comp && (
                          <button onClick={() => verArchivo(gastoPorOrden[o.id].comp)} className="underline"
                                  style={{ color: 'var(--series-1)' }}>Comprobante</button>)}
                      </div>
                    ) : null) },
              ]}
              filas={d.ordenes}
            />
          </div>
        </Card>
      </div>

      {d.cambios.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold tracking-tight">Historial de cambios</h2>
          <Card className="!p-0">
            <div className="p-4 sm:p-5">
              <Tabla
                columnas={[
                  { key: 'solicitado_en', header: 'Solicitado', nowrap: true,
                    render: (c) => fechaCorta(c.solicitado_en?.slice(0, 10)) },
                  { key: 'tipo', header: 'Tipo', nowrap: true,
                    render: (c) => c.tipo === 'alta' ? 'Alta' : 'Modificación' },
                  { key: 'solicitado_por', header: 'Solicitó', render: (c) => perfilById[c.solicitado_por]?.nombre ?? '—' },
                  { key: 'estatus', header: 'Estatus', nowrap: true, render: (c) => (
                      <Badge color={c.estatus === 'aprobado' ? 'var(--good)' : c.estatus === 'rechazado' ? 'var(--critical)' : 'var(--series-3)'}>
                        {c.estatus}
                      </Badge>) },
                  { key: 'resuelto_por', header: 'Resolvió', render: (c) => c.resuelto_por
                      ? `${perfilById[c.resuelto_por]?.nombre ?? '—'} · ${fechaCorta(c.resuelto_en?.slice(0, 10))}` : '—' },
                  ...(esAdmin ? [{ key: 'accion', header: '', nowrap: true, render: (c) => c.estatus === 'pendiente' && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => resolverCambio(c, true)} className="rounded-lg px-2.5 py-1 text-xs font-medium"
                                style={{ background: 'var(--series-1)', color: '#fff' }}>Aprobar</button>
                        <button onClick={() => resolverCambio(c, false)} className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                                style={{ borderColor: 'var(--border)', color: 'var(--critical)' }}>Rechazar</button>
                      </div>) }] : []),
                ]}
                filas={d.cambios}
              />
            </div>
          </Card>
        </div>
      )}

      {/* ---------------- Nuevo mantenimiento ---------------- */}
      <Modal abierto={modalMant} onClose={() => setModalMant(false)} titulo={`Nuevo mantenimiento — ${activo.nombre}`}>
        <form onSubmit={guardarMantenimiento} className="space-y-3">
          <Campo label="Tipo" required>
            <Select value={formMant.tipo} onChange={(e) => setFormMant({ ...formMant, tipo: e.target.value })}>
              <option value="correctivo">Correctivo</option>
              <option value="preventivo">Preventivo</option>
            </Select>
          </Campo>
          {formMant.tipo === 'correctivo' && (
            <Campo label="Tipo de falla" required hint="Ej. no enfría, fuga de refrigerante, corto circuito">
              <Input value={formMant.tipo_falla} required
                     onChange={(e) => setFormMant({ ...formMant, tipo_falla: e.target.value })} />
            </Campo>
          )}
          <Campo label="Título" required>
            <Input value={formMant.titulo} required
                   onChange={(e) => setFormMant({ ...formMant, titulo: e.target.value })} />
          </Campo>
          <Campo label="Descripción">
            <Textarea rows={2} value={formMant.descripcion}
                      onChange={(e) => setFormMant({ ...formMant, descripcion: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Criticidad">
              <Select value={formMant.criticidad} onChange={(e) => setFormMant({ ...formMant, criticidad: e.target.value })}>
                {Object.entries(CRITICIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Campo>
            <Campo label="Fecha programada">
              <Input type="date" value={formMant.fecha_programada}
                     onChange={(e) => setFormMant({ ...formMant, fecha_programada: e.target.value })} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Costo estimado">
              <Input inputMode="decimal" value={formMant.costo_estimado} placeholder="0.00"
                     onChange={(e) => setFormMant({ ...formMant, costo_estimado: e.target.value })} />
            </Campo>
            <Campo label="Duración estimada (horas)">
              <Input inputMode="decimal" value={formMant.duracion_estimada_horas} placeholder="0"
                     onChange={(e) => setFormMant({ ...formMant, duracion_estimada_horas: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Proveedor" hint="Opcional — también se puede asignar al finalizar">
            <SelectorProveedor proveedores={d.proveedores} value={formMant.proveedor_id}
                               onChange={(v) => setFormMant({ ...formMant, proveedor_id: v })}
                               onCreado={(nuevo) => setD((prev) => ({ ...prev, proveedores: [...prev.proveedores, nuevo] }))} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModalMant(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear orden'}</Boton>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Se crea como orden programada. Para iniciarla y registrar el gasto ve a{' '}
            <Link to="/mantenimiento/plan" className="underline">Plan de mantenimiento</Link>.
          </p>
        </form>
      </Modal>

      {/* ---------------- Editar datos técnicos ---------------- */}
      <Modal abierto={modalEditar} onClose={() => !guardando && setModalEditar(false)}
             titulo={esAdmin ? 'Editar datos técnicos' : 'Proponer cambio de datos técnicos'}>
        {formEditar && (
          <form onSubmit={guardarEdicion} className="space-y-3">
            <Campo label="Foto" hint={activo.foto_path ? 'Sube una nueva para reemplazarla' : undefined}>
              <ArchivoInput accept="image/*" onChange={(f) => setFormEditar({ ...formEditar, foto: f })} />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Nombre" required>
                <Input value={formEditar.nombre} required
                       onChange={(e) => setFormEditar({ ...formEditar, nombre: e.target.value })} />
              </Campo>
              <Campo label="Código">
                <Input value={formEditar.codigo}
                       onChange={(e) => setFormEditar({ ...formEditar, codigo: e.target.value })} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Ubicación">
                <Input value={formEditar.ubicacion}
                       onChange={(e) => setFormEditar({ ...formEditar, ubicacion: e.target.value })} />
              </Campo>
              <Campo label="Categoría">
                <Select value={formEditar.categoria_id}
                        onChange={(e) => setFormEditar({ ...formEditar, categoria_id: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Marca">
                <Input value={formEditar.marca}
                       onChange={(e) => setFormEditar({ ...formEditar, marca: e.target.value })} />
              </Campo>
              <Campo label="Modelo">
                <Input value={formEditar.modelo}
                       onChange={(e) => setFormEditar({ ...formEditar, modelo: e.target.value })} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Número de serie">
                <Input value={formEditar.serie}
                       onChange={(e) => setFormEditar({ ...formEditar, serie: e.target.value })} />
              </Campo>
              <Campo label="Capacidad">
                <Input value={formEditar.capacidad}
                       onChange={(e) => setFormEditar({ ...formEditar, capacidad: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Criticidad">
              <Select value={formEditar.criticidad}
                      onChange={(e) => setFormEditar({ ...formEditar, criticidad: e.target.value })}>
                {Object.entries(CRITICIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Campo>
            <Campo label="Notas">
              <Textarea rows={2} value={formEditar.notas}
                        onChange={(e) => setFormEditar({ ...formEditar, notas: e.target.value })} />
            </Campo>

            {formError && <Aviso tono="critical">{formError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setModalEditar(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" disabled={guardando}>
                {subiendoFoto ? 'Subiendo foto…' : guardando ? 'Guardando…' : esAdmin ? 'Guardar' : 'Enviar para aprobación'}
              </Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
