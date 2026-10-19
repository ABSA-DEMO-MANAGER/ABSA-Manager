import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { subirArchivo, urlFirmada, borrarArchivo } from '../lib/storage';
import { useAuth } from '../lib/auth';
import { money, fechaCorta, COBERTURA, ESTATUS_PAGO, ESTATUS_ORDEN, TIPO_DOCUMENTO_PROVEEDOR } from '../lib/format';
import { FotoOPdfInput } from '../components/FotoInput';
import {
  Cargando, Aviso, Badge, Stat, Tabla, Modal, Campo, Input, Select, Textarea, Boton, Card,
} from '../components/ui';

const FORM_EDITAR_VACIO = {
  nombre: '', servicio: '', ciudad: '', cobertura: '', factura: '', contacto: '', telefono: '', notas: '',
};

const FORM_DOC_VACIO = { tipo: 'cfdi', descripcion: '', archivo: null };

export default function ProveedorDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil, esAdmin, puedeGestionar } = useAuth();

  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [modalEditar, setModalEditar] = useState(false);
  const [formEditar, setFormEditar] = useState(FORM_EDITAR_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [modalDoc, setModalDoc] = useState(false);
  const [formDoc, setFormDoc] = useState(FORM_DOC_VACIO);
  const [guardandoDoc, setGuardandoDoc] = useState(false);
  const [docError, setDocError] = useState(null);

  async function cargar() {
    const [p, ord, cot, gas, doc, cambios, perfiles] = await Promise.all([
      supabase.from('proveedores')
        .select('id, nombre, servicio, es_fijo, ciudad, cobertura, factura, contacto, telefono, notas')
        .eq('id', id).maybeSingle(),
      supabase.from('ordenes')
        .select('id, folio, titulo, estatus, fecha_programada, fecha_realizada')
        .eq('proveedor_id', id).order('fecha_programada', { ascending: false, nullsFirst: false }),
      supabase.from('cotizaciones')
        .select('id, orden_id, monto, total, vigencia, cumple_alcance, archivo_path, creado_en')
        .eq('proveedor_id', id).order('creado_en', { ascending: false }),
      supabase.from('gastos')
        .select('id, fecha, concepto, monto, estatus_pago, orden_id')
        .eq('proveedor_id', id).order('fecha', { ascending: false }),
      supabase.from('proveedores_documentos')
        .select('id, tipo, descripcion, archivo_path, creado_en')
        .eq('proveedor_id', id).order('creado_en', { ascending: false }),
      supabase.from('proveedores_cambios')
        .select('id, datos, estatus, solicitado_por, solicitado_en, resuelto_por, resuelto_en, nota_resolucion')
        .eq('proveedor_id', id).order('solicitado_en', { ascending: false }),
      supabase.from('perfiles').select('id, nombre'),
    ]);
    const err = p.error || ord.error || cot.error || gas.error || doc.error || cambios.error || perfiles.error;
    if (err) { setError(err.message); return; }
    if (!p.data) { setError('no-existe'); return; }
    setD({
      proveedor: p.data, ordenes: ord.data, cotizaciones: cot.data, gastos: gas.data,
      documentos: doc.data, cambios: cambios.data, perfiles: perfiles.data,
    });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [id]);

  const ordenById = useMemo(() => Object.fromEntries((d?.ordenes ?? []).map((o) => [o.id, o])), [d]);
  const perfilById = useMemo(() => Object.fromEntries((d?.perfiles ?? []).map((p) => [p.id, p])), [d]);
  const cambioPendiente = useMemo(() => (d?.cambios ?? []).find((c) => c.estatus === 'pendiente'), [d]);

  const stats = useMemo(() => {
    if (!d) return null;
    const gastoTotal = d.gastos.reduce((a, g) => a + Number(g.monto), 0);
    return {
      servicios: d.ordenes.length,
      cotizaciones: d.cotizaciones.length,
      gastoTotal,
    };
  }, [d]);

  // ---------------------------------------------------------- editar datos
  function abrirEditar() {
    const p = d.proveedor;
    setFormEditar({
      nombre: p.nombre, servicio: p.servicio ?? '', ciudad: p.ciudad ?? '', cobertura: p.cobertura ?? '',
      factura: p.factura === null ? '' : p.factura ? 'si' : 'no',
      contacto: p.contacto ?? '', telefono: p.telefono ?? '', notas: p.notas ?? '',
    });
    setFormError(null); setModalEditar(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setFormError(null);
    if (!formEditar.nombre.trim()) return setFormError('El nombre no puede quedar vacío.');

    const datos = {
      nombre: formEditar.nombre.trim(),
      servicio: formEditar.servicio.trim() || null,
      ciudad: formEditar.ciudad.trim() || null,
      cobertura: formEditar.cobertura || null,
      factura: formEditar.factura === '' ? null : formEditar.factura === 'si',
      contacto: formEditar.contacto.trim() || null,
      telefono: formEditar.telefono.trim() || null,
      notas: formEditar.notas.trim() || null,
    };

    setGuardando(true);
    const { error: err } = esAdmin
      ? await supabase.from('proveedores').update(datos).eq('id', d.proveedor.id)
      : await supabase.from('proveedores_cambios').insert({ proveedor_id: d.proveedor.id, datos, solicitado_por: perfil.id });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModalEditar(false); cargar();
  }

  async function resolverCambio(cambio, aprobar) {
    if (!aprobar) {
      const motivo = prompt('¿Por qué se rechaza este cambio? (opcional)') ?? '';
      await supabase.from('proveedores_cambios')
        .update({ estatus: 'rechazado', resuelto_por: perfil.id, resuelto_en: new Date().toISOString(), nota_resolucion: motivo || null })
        .eq('id', cambio.id);
      cargar();
      return;
    }
    const { error: err } = await supabase.from('proveedores').update(cambio.datos).eq('id', d.proveedor.id);
    if (err) { alert(err.message); return; }
    await supabase.from('proveedores_cambios')
      .update({ estatus: 'aprobado', resuelto_por: perfil.id, resuelto_en: new Date().toISOString() })
      .eq('id', cambio.id);
    cargar();
  }

  // -------------------------------------------------------------- documentos
  function abrirNuevoDoc() {
    setFormDoc(FORM_DOC_VACIO);
    setDocError(null); setModalDoc(true);
  }

  async function guardarDoc(e) {
    e.preventDefault();
    setDocError(null);
    if (!formDoc.archivo) return setDocError('Toma una foto o sube el archivo.');

    setGuardandoDoc(true);
    try {
      const ruta = await subirArchivo(formDoc.archivo, `proveedores/${d.proveedor.id}/documentos`);
      const { error: err } = await supabase.from('proveedores_documentos').insert({
        proveedor_id: d.proveedor.id, tipo: formDoc.tipo,
        descripcion: formDoc.descripcion.trim() || null, archivo_path: ruta, creado_por: perfil.id,
      });
      if (err) throw err;
      setModalDoc(false); cargar();
    } catch (err) {
      setDocError(err.message);
    } finally {
      setGuardandoDoc(false);
    }
  }

  async function quitarDoc(doc) {
    if (!confirm('¿Eliminar este documento?')) return;
    await supabase.from('proveedores_documentos').delete().eq('id', doc.id);
    await borrarArchivo(doc.archivo_path);
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
        <Aviso tono="critical">Este proveedor no existe o no tienes acceso a él.</Aviso>
        <Link to="/mantenimiento/proveedores" className="text-sm underline" style={{ color: 'var(--series-1)' }}>
          ← Volver a proveedores
        </Link>
      </div>
    );
  }
  if (error) return <Aviso tono="critical">No se pudo cargar el proveedor: {error}</Aviso>;
  if (!d) return <Cargando />;

  const { proveedor } = d;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="text-sm underline" style={{ color: 'var(--text-secondary)' }}>
        ← Volver
      </button>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{proveedor.nombre}</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {proveedor.servicio}{proveedor.ciudad && ` · ${proveedor.ciudad}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {proveedor.es_fijo && <Badge dot={false}>fijo</Badge>}
          {proveedor.cobertura && <Badge dot={false}>{COBERTURA[proveedor.cobertura]}</Badge>}
          {proveedor.factura !== null && <Badge dot={false}>{proveedor.factura ? 'Sí factura' : 'No factura'}</Badge>}
        </div>
      </div>

      {puedeGestionar && (
        <div className="flex flex-wrap gap-2">
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Servicios (órdenes)" value={stats.servicios} />
        <Stat label="Cotizaciones" value={stats.cotizaciones} />
        <Stat label="Gasto acumulado" value={money(stats.gastoTotal)} />
      </div>

      <Card title="Contacto">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[['Contacto', proveedor.contacto], ['Teléfono', proveedor.telefono]]
            .filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                <dt style={{ color: 'var(--text-secondary)' }}>{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
        </dl>
        {proveedor.notas && (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{proveedor.notas}</p>
        )}
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Documentos</h2>
          {puedeGestionar && <Boton onClick={abrirNuevoDoc}>+ Agregar documento</Boton>}
        </div>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin documentos registrados (CFDI, contratos, etc.)."
              columnas={[
                { key: 'tipo', header: 'Tipo', nowrap: true, render: (doc) => <Badge dot={false}>{TIPO_DOCUMENTO_PROVEEDOR[doc.tipo]}</Badge> },
                { key: 'descripcion', header: 'Descripción', render: (doc) => doc.descripcion ?? '—' },
                { key: 'creado_en', header: 'Fecha', nowrap: true, render: (doc) => fechaCorta(doc.creado_en?.slice(0, 10)) },
                { key: 'accion', header: '', nowrap: true, render: (doc) => (
                    <div className="flex justify-end gap-3 text-xs">
                      <button onClick={() => verArchivo(doc.archivo_path)} className="underline" style={{ color: 'var(--series-1)' }}>Ver</button>
                      {puedeGestionar && (
                        <button onClick={() => quitarDoc(doc)} className="underline" style={{ color: 'var(--critical)' }}>Eliminar</button>
                      )}
                    </div>) },
              ]}
              filas={d.documentos}
            />
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold tracking-tight">Historial de cotizaciones</h2>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin cotizaciones de este proveedor todavía."
              columnas={[
                { key: 'creado_en', header: 'Fecha', nowrap: true, render: (c) => fechaCorta(c.creado_en?.slice(0, 10)) },
                { key: 'orden', header: 'Orden', render: (c) => (
                    ordenById[c.orden_id] ? `${ordenById[c.orden_id].folio ? ordenById[c.orden_id].folio + ' · ' : ''}${ordenById[c.orden_id].titulo}` : '—') },
                { key: 'total', header: 'Monto', align: 'right', render: (c) => money(c.total) },
                { key: 'cumple_alcance', header: 'Cumple alcance', nowrap: true,
                  render: (c) => <Badge color={c.cumple_alcance ? 'var(--good)' : 'var(--critical)'}>{c.cumple_alcance ? 'Sí' : 'No'}</Badge> },
                { key: 'accion', header: '', nowrap: true, render: (c) => c.archivo_path && (
                    <button onClick={() => verArchivo(c.archivo_path)} className="text-xs underline" style={{ color: 'var(--series-1)' }}>Ver</button>) },
              ]}
              filas={d.cotizaciones}
            />
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold tracking-tight">Historial de servicios</h2>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin órdenes asignadas a este proveedor todavía."
              columnas={[
                { key: 'fecha', header: 'Fecha', nowrap: true, render: (o) => fechaCorta(o.fecha_realizada ?? o.fecha_programada) },
                { key: 'titulo', header: 'Orden', render: (o) => (
                    <>{o.folio && <span className="tnum" style={{ color: 'var(--text-muted)' }}>{o.folio} · </span>}{o.titulo}</>) },
                { key: 'estatus', header: 'Estatus', nowrap: true, render: (o) => <Badge dot={false}>{ESTATUS_ORDEN[o.estatus]}</Badge> },
              ]}
              filas={d.ordenes}
            />
          </div>
        </Card>
      </div>

      {d.gastos.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold tracking-tight">Gastos relacionados</h2>
          <Card className="!p-0">
            <div className="p-4 sm:p-5">
              <Tabla
                columnas={[
                  { key: 'fecha', header: 'Fecha', nowrap: true, render: (g) => fechaCorta(g.fecha) },
                  { key: 'concepto', header: 'Concepto', render: (g) => g.concepto },
                  { key: 'monto', header: 'Monto', align: 'right', render: (g) => money(g.monto) },
                  { key: 'estatus_pago', header: 'Estatus', nowrap: true, render: (g) => <Badge dot={false}>{ESTATUS_PAGO[g.estatus_pago]}</Badge> },
                ]}
                filas={d.gastos}
              />
            </div>
          </Card>
        </div>
      )}

      {d.cambios.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold tracking-tight">Historial de cambios</h2>
          <Card className="!p-0">
            <div className="p-4 sm:p-5">
              <Tabla
                columnas={[
                  { key: 'solicitado_en', header: 'Solicitado', nowrap: true, render: (c) => fechaCorta(c.solicitado_en?.slice(0, 10)) },
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

      {/* ---------------- Editar datos ---------------- */}
      <Modal abierto={modalEditar} onClose={() => !guardando && setModalEditar(false)}
             titulo={esAdmin ? 'Editar proveedor' : 'Proponer cambio de proveedor'}>
        <form onSubmit={guardarEdicion} className="space-y-3">
          <Campo label="Nombre" required>
            <Input value={formEditar.nombre} required onChange={(e) => setFormEditar({ ...formEditar, nombre: e.target.value })} />
          </Campo>
          <Campo label="Servicio">
            <Input value={formEditar.servicio} onChange={(e) => setFormEditar({ ...formEditar, servicio: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Ciudad">
              <Input value={formEditar.ciudad} onChange={(e) => setFormEditar({ ...formEditar, ciudad: e.target.value })} />
            </Campo>
            <Campo label="Cobertura">
              <Select value={formEditar.cobertura} onChange={(e) => setFormEditar({ ...formEditar, cobertura: e.target.value })}>
                <option value="">Sin definir</option>
                {Object.entries(COBERTURA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
          </div>
          <Campo label="¿Factura?">
            <Select value={formEditar.factura} onChange={(e) => setFormEditar({ ...formEditar, factura: e.target.value })}>
              <option value="">Sin especificar</option>
              <option value="si">Sí factura</option>
              <option value="no">No factura</option>
            </Select>
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Contacto">
              <Input value={formEditar.contacto} onChange={(e) => setFormEditar({ ...formEditar, contacto: e.target.value })} />
            </Campo>
            <Campo label="Teléfono">
              <Input value={formEditar.telefono} onChange={(e) => setFormEditar({ ...formEditar, telefono: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Notas">
            <Textarea rows={2} value={formEditar.notas} onChange={(e) => setFormEditar({ ...formEditar, notas: e.target.value })} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setModalEditar(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : esAdmin ? 'Guardar' : 'Enviar para aprobación'}
            </Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Nuevo documento ---------------- */}
      <Modal abierto={modalDoc} onClose={() => !guardandoDoc && setModalDoc(false)} titulo="Agregar documento">
        <form onSubmit={guardarDoc} className="space-y-3">
          <Campo label="Tipo" required>
            <Select value={formDoc.tipo} onChange={(e) => setFormDoc({ ...formDoc, tipo: e.target.value })}>
              {Object.entries(TIPO_DOCUMENTO_PROVEEDOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Campo>
          <Campo label="Descripción" hint="Opcional — ej. CFDI de octubre, contrato 2026">
            <Input value={formDoc.descripcion} onChange={(e) => setFormDoc({ ...formDoc, descripcion: e.target.value })} />
          </Campo>
          <Campo label="Archivo" required>
            <FotoOPdfInput value={formDoc.archivo} onChange={(f) => setFormDoc({ ...formDoc, archivo: f })} />
          </Campo>

          {docError && <Aviso tono="critical">{docError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" disabled={guardandoDoc} onClick={() => setModalDoc(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardandoDoc}>{guardandoDoc ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
