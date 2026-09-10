import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, fechaCorta, hoyISO } from '../../lib/format';
import { subirArchivo, borrarArchivo } from '../../lib/storage';
import FotoFirmada from '../../components/FotoFirmada';
import {
  Cargando, Aviso, Badge, Stat, Tabla, Modal, Campo, Input, Select, Textarea,
  Boton, Card,
} from '../../components/ui';

const ESTADOS = { activo: 'Activo', en_mantenimiento: 'En mantenimiento', inactivo: 'Inactivo' };
const COLOR_ESTADO = { activo: 'var(--good)', en_mantenimiento: 'var(--serious)', inactivo: 'var(--text-muted)' };

const PUNTOS = ['Puertas delante', 'Puertas detrás', 'Espejos', 'Interiores'];
const PUNTOS_TODOS = [...PUNTOS, 'Otras'];
const conductorVacio = () => ({
  nombre: '', telefono: '', correo: '', licencia: '', licencia_vence: '',
  puesto: '', departamento: '', jefe_directo: '', tipo_prestacion: '',
});
const fotosVacias = () => Object.fromEntries(PUNTOS_TODOS.map((p) => [p, []]));
const cuentaFotos = (f) => Object.values(f).reduce((a, arr) => a + arr.length, 0);

function estatusDoc(vence) {
  if (!vence) return null;
  const hoy = hoyISO();
  if (vence < hoy) return { label: 'Vencido', color: 'var(--critical)' };
  const dias = Math.ceil((new Date(vence) - new Date(hoy)) / 86400000);
  if (dias <= 45) return { label: `Vence en ${dias} d`, color: 'var(--serious)' };
  return { label: 'Vigente', color: 'var(--good)' };
}

const FORM_VACIO = {
  codigo: '', ciudad_id: '', marca: '', modelo: '', anio: '', tipo: '', motor: '', color: '',
  placas: '', vin: '', propiedad: 'propio', estado: 'activo', km: '', valor: '',
  proximo_servicio_km: '', proximo_servicio_fecha: '', notas: '',
};

const DOC_VACIO = { tipo: '', referencia: '', emision: '', vence: '', monto: '' };

const SERV_VACIO = {
  fecha: hoyISO(), tipo: 'preventivo', concepto: '', taller: '', km: '',
  mano_obra: '', refacciones: '', descripcion: '',
  proximo_servicio_km: '', proximo_servicio_fecha: '',
};

export default function UnidadDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { esFlotaAdmin, flotaPerfil } = useFlotaPerfil();

  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [modalEditar, setModalEditar] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  // Asignar / reasignar / desasignar conductor con galería de fotos
  const [modalReasig, setModalReasig] = useState(null); // 'asignar' | 'reasignar' | 'desasignar'
  const [conductorForm, setConductorForm] = useState(conductorVacio());
  const [inspKm, setInspKm] = useState('');
  const [fotosNuevas, setFotosNuevas] = useState(fotosVacias());
  const [reasigError, setReasigError] = useState(null);

  // Actualizar galería sin cambiar de conductor
  const [modalGaleria, setModalGaleria] = useState(false);
  const [fotosGaleria, setFotosGaleria] = useState(fotosVacias());
  const [galeriaError, setGaleriaError] = useState(null);

  const [modalDoc, setModalDoc] = useState(false);
  const [formDoc, setFormDoc] = useState(DOC_VACIO);

  const [modalServ, setModalServ] = useState(false);
  const [formServ, setFormServ] = useState(SERV_VACIO);

  async function cargar() {
    const [v, s, docs, servs, hist, insp] = await Promise.all([
      supabase.from('flota_vehiculos').select('*').eq('id', id).maybeSingle(),
      supabase.from('flota_ciudades').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('flota_documentos').select('id, tipo, referencia, emision, vence, monto').eq('vehiculo_id', id).order('vence'),
      supabase.from('flota_servicios')
        .select('id, fecha, tipo, concepto, descripcion, taller, km, mano_obra, refacciones')
        .eq('vehiculo_id', id).order('fecha', { ascending: false }),
      supabase.from('flota_conductor_historial')
        .select('id, conductor_nombre, conductor_telefono, puesto, departamento, jefe_directo, tipo_prestacion, hasta')
        .eq('vehiculo_id', id).order('hasta', { ascending: false }),
      supabase.from('flota_vehiculo_fotos')
        .select('id, punto, archivo_path, creado_en')
        .eq('vehiculo_id', id).order('creado_en', { ascending: true }),
    ]);
    const err = v.error || s.error || docs.error || servs.error || hist.error || insp.error;
    if (err) { setError(err.message); return; }
    if (!v.data) { setError('no-existe'); return; }
    setD({
      vehiculo: v.data, ciudades: s.data, documentos: docs.data, servicios: servs.data,
      historialConductores: hist.data, galeria: insp.data,
    });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [id]);

  const ciudadById = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.id, c])), [d]);

  const alertas = useMemo(() => {
    if (!d) return [];
    const hoy = hoyISO();
    const out = [];
    const v = d.vehiculo;
    if (v.proximo_servicio_fecha && v.proximo_servicio_fecha < hoy) out.push('Servicio de mantenimiento vencido');
    if (v.proximo_servicio_km && Number(v.km) >= Number(v.proximo_servicio_km)) out.push('Kilometraje de servicio alcanzado');
    if (v.licencia_vence && v.licencia_vence < hoy) out.push('Licencia del conductor vencida');
    d.documentos.forEach((doc) => { if (doc.vence && doc.vence < hoy) out.push(`${doc.tipo} vencido`); });
    return out;
  }, [d]);

  function abrirEditar() {
    const v = d.vehiculo;
    setForm({
      codigo: v.codigo ?? '', ciudad_id: v.ciudad_id ? String(v.ciudad_id) : '',
      marca: v.marca ?? '', modelo: v.modelo ?? '', anio: v.anio ?? '', tipo: v.tipo ?? '',
      motor: v.motor ?? '', color: v.color ?? '', placas: v.placas ?? '', vin: v.vin ?? '',
      propiedad: v.propiedad, estado: v.estado, km: v.km ?? '', valor: v.valor ?? '',
      proximo_servicio_km: v.proximo_servicio_km ?? '', proximo_servicio_fecha: v.proximo_servicio_fecha ?? '',
      notas: v.notas ?? '',
    });
    setFormError(null); setModalEditar(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setFormError(null);
    setGuardando(true);
    const { error: err } = await supabase.from('flota_vehiculos').update({
      codigo: form.codigo.trim() || null,
      ciudad_id: form.ciudad_id ? Number(form.ciudad_id) : null,
      marca: form.marca.trim() || null, modelo: form.modelo.trim() || null,
      anio: form.anio ? Number(form.anio) : null, tipo: form.tipo.trim() || null,
      motor: form.motor.trim() || null, color: form.color.trim() || null,
      placas: form.placas.trim() || null, vin: form.vin.trim() || null,
      propiedad: form.propiedad, estado: form.estado,
      km: form.km === '' ? 0 : Number(form.km), valor: form.valor === '' ? null : Number(form.valor),
      proximo_servicio_km: form.proximo_servicio_km === '' ? null : Number(form.proximo_servicio_km),
      proximo_servicio_fecha: form.proximo_servicio_fecha || null,
      notas: form.notas.trim() || null,
    }).eq('id', id);
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModalEditar(false); cargar();
  }

  // ---- Galería de fotos del estado de la unidad ----
  async function subirFotos(fotos) {
    for (const punto of PUNTOS_TODOS) {
      for (const file of fotos[punto]) {
        const ruta = await subirArchivo(file, `flota/${id}/galeria`);
        await supabase.from('flota_vehiculo_fotos').insert({ vehiculo_id: Number(id), punto, archivo_path: ruta });
      }
    }
  }

  async function borrarGaleriaActual() {
    const actuales = d.galeria ?? [];
    if (actuales.length === 0) return;
    for (const f of actuales) { try { await borrarArchivo(f.archivo_path); } catch { /* ignora */ } }
    await supabase.from('flota_vehiculo_fotos').delete().in('id', actuales.map((f) => f.id));
  }

  // ---- Asignar / reasignar / desasignar conductor ----
  function abrirReasignar(modo) {
    const v = d.vehiculo;
    setModalReasig(modo);
    setReasigError(null);
    setInspKm(v.km ?? '');
    setFotosNuevas(fotosVacias());
    setConductorForm(conductorVacio());
  }

  async function ejecutarReasignar(e) {
    e.preventDefault();
    setReasigError(null);
    const asignaNuevo = modalReasig === 'asignar' || modalReasig === 'reasignar';

    if (cuentaFotos(fotosNuevas) === 0) {
      return setReasigError('Sube al menos una foto del estado actual de la unidad.');
    }
    if (asignaNuevo && !conductorForm.nombre.trim()) {
      return setReasigError('Escribe el nombre del nuevo conductor.');
    }

    setGuardando(true);
    try {
      const kmNum = inspKm === '' ? null : Number(inspKm);

      // 1. Actualizar la unidad (dispara el archivado del conductor saliente)
      const patch = asignaNuevo
        ? {
            conductor_nombre: conductorForm.nombre.trim(),
            conductor_telefono: conductorForm.telefono.trim() || null,
            conductor_correo: conductorForm.correo.trim() || null,
            conductor_licencia: conductorForm.licencia.trim() || null,
            licencia_vence: conductorForm.licencia_vence || null,
            puesto: conductorForm.puesto.trim() || null,
            departamento: conductorForm.departamento.trim() || null,
            jefe_directo: conductorForm.jefe_directo.trim() || null,
            tipo_prestacion: conductorForm.tipo_prestacion.trim() || null,
          }
        : {
            conductor_nombre: null, conductor_telefono: null, conductor_correo: null,
            conductor_licencia: null, licencia_vence: null,
            puesto: null, departamento: null, jefe_directo: null, tipo_prestacion: null,
          };
      if (kmNum !== null) patch.km = kmNum;
      const { error: eUpd } = await supabase.from('flota_vehiculos').update(patch).eq('id', id);
      if (eUpd) throw eUpd;

      // 2. La galería nueva reemplaza a la anterior (se borran las fotos pasadas)
      await borrarGaleriaActual();
      await subirFotos(fotosNuevas);

      setModalReasig(null);
      cargar();
    } catch (err) {
      setReasigError(err.message || 'No se pudo completar la operación.');
    } finally {
      setGuardando(false);
    }
  }

  function abrirGaleria() {
    setGaleriaError(null);
    setFotosGaleria(fotosVacias());
    setModalGaleria(true);
  }

  async function guardarGaleria(e) {
    e.preventDefault();
    setGaleriaError(null);
    if (cuentaFotos(fotosGaleria) === 0) return setGaleriaError('Sube al menos una foto.');
    setGuardando(true);
    try {
      await borrarGaleriaActual();
      await subirFotos(fotosGaleria);
      setModalGaleria(false);
      cargar();
    } catch (err) {
      setGaleriaError(err.message || 'No se pudieron guardar las fotos.');
    } finally {
      setGuardando(false);
    }
  }

  function abrirDoc() {
    setFormDoc(DOC_VACIO); setFormError(null); setModalDoc(true);
  }

  async function guardarDoc(e) {
    e.preventDefault();
    setFormError(null);
    if (!formDoc.tipo.trim()) return setFormError('Escribe el tipo de documento.');
    setGuardando(true);
    const { error: err } = await supabase.from('flota_documentos').insert({
      vehiculo_id: Number(id),
      tipo: formDoc.tipo.trim(),
      referencia: formDoc.referencia.trim() || null,
      emision: formDoc.emision || null,
      vence: formDoc.vence || null,
      monto: formDoc.monto === '' ? null : Number(formDoc.monto),
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModalDoc(false); cargar();
  }

  async function borrarDoc(docId) {
    if (!confirm('¿Borrar este documento?')) return;
    await supabase.from('flota_documentos').delete().eq('id', docId);
    cargar();
  }

  function abrirServicio() {
    setFormServ({ ...SERV_VACIO, km: d.vehiculo.km ?? '' });
    setFormError(null); setModalServ(true);
  }

  async function guardarServicio(e) {
    e.preventDefault();
    setFormError(null);
    if (!formServ.concepto.trim()) return setFormError('Escribe el concepto del servicio.');

    setGuardando(true);
    const { error: errServ } = await supabase.from('flota_servicios').insert({
      vehiculo_id: Number(id),
      fecha: formServ.fecha, tipo: formServ.tipo, concepto: formServ.concepto.trim(),
      descripcion: formServ.descripcion.trim() || null, taller: formServ.taller.trim() || null,
      km: formServ.km === '' ? null : Number(formServ.km),
      mano_obra: formServ.mano_obra === '' ? 0 : Number(formServ.mano_obra),
      refacciones: formServ.refacciones === '' ? 0 : Number(formServ.refacciones),
    });
    if (errServ) { setGuardando(false); return setFormError(errServ.message); }

    // igual que en la versión original: si el km del servicio es mayor, actualiza
    // el kilometraje de la unidad, y si se captura próximo servicio, lo guarda.
    const patch = {};
    const kmServ = formServ.km === '' ? null : Number(formServ.km);
    if (kmServ !== null && kmServ > Number(d.vehiculo.km ?? 0)) patch.km = kmServ;
    if (formServ.proximo_servicio_km !== '') patch.proximo_servicio_km = Number(formServ.proximo_servicio_km);
    if (formServ.proximo_servicio_fecha !== '') patch.proximo_servicio_fecha = formServ.proximo_servicio_fecha;
    if (Object.keys(patch).length > 0) {
      await supabase.from('flota_vehiculos').update(patch).eq('id', id);
    }

    setGuardando(false);
    setModalServ(false); cargar();
  }

  if (error === 'no-existe') {
    return (
      <div className="space-y-3">
        <Aviso tono="critical">Esta unidad no existe o no tienes acceso a ella.</Aviso>
        <Link to="/flotas" className="text-sm underline" style={{ color: 'var(--series-1)' }}>← Volver a unidades</Link>
      </div>
    );
  }
  if (error) return <Aviso tono="critical">No se pudo cargar la unidad: {error}</Aviso>;
  if (!d) return <Cargando />;

  const { vehiculo: v } = d;
  const nombre = [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Unidad sin datos';

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/flotas')} className="text-sm underline" style={{ color: 'var(--text-secondary)' }}>
        ← Unidades
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {nombre}
            <Badge color={COLOR_ESTADO[v.estado]}>{ESTADOS[v.estado]}</Badge>
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {[v.codigo, v.placas, ciudadById[v.ciudad_id]?.nombre].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
          </p>
        </div>
        {esFlotaAdmin && <Boton variant="ghost" onClick={abrirEditar}>Editar unidad</Boton>}
      </div>

      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => <Aviso key={i} tono="critical">{a}</Aviso>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kilometraje" value={v.km ? `${Number(v.km).toLocaleString('es-MX')} km` : '—'} />
        <Stat label="Próximo servicio" value={v.proximo_servicio_fecha ? fechaCorta(v.proximo_servicio_fecha) : '—'}
              hint={v.proximo_servicio_km ? `${Number(v.proximo_servicio_km).toLocaleString('es-MX')} km` : undefined} />
        <Stat label="Propiedad" value={v.propiedad === 'arrendado' ? 'Arrendado' : 'Propio'} />
        <Stat label="Valor" value={v.valor ? money(v.valor) : '—'} />
      </div>

      <Card title="Datos técnicos">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['Tipo', v.tipo], ['Motor', v.motor], ['Color', v.color],
            ['Placas', v.placas], ['VIN', v.vin],
          ].filter(([, val]) => val).map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <dt style={{ color: 'var(--text-secondary)' }}>{k}</dt>
              <dd className="text-right font-medium">{val}</dd>
            </div>
          ))}
        </dl>
        {v.notas && <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{v.notas}</p>}
      </Card>

      <Card
        title="Conductor asignado"
        right={esFlotaAdmin && (
          v.conductor_nombre ? (
            <div className="flex gap-2">
              <Boton variant="ghost" onClick={() => abrirReasignar('reasignar')}>Reasignar</Boton>
              <Boton variant="danger" onClick={() => abrirReasignar('desasignar')}>Desasignar</Boton>
            </div>
          ) : (
            <Boton variant="ghost" onClick={() => abrirReasignar('asignar')}>Asignar conductor</Boton>
          )
        )}
      >
        {v.conductor_nombre ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ['Nombre', v.conductor_nombre], ['Teléfono', v.conductor_telefono], ['Correo', v.conductor_correo],
              ['Licencia', v.conductor_licencia],
              ['Vence licencia', v.licencia_vence && fechaCorta(v.licencia_vence)],
              ['Puesto', v.puesto], ['Departamento', v.departamento],
              ['Jefe directo', v.jefe_directo], ['Tipo de prestación', v.tipo_prestacion],
            ].filter(([, val]) => val).map(([k, val]) => (
              <div key={k} className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                <dt style={{ color: 'var(--text-secondary)' }}>{k}</dt>
                <dd className="text-right font-medium">{val}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin conductor asignado.</p>
        )}
      </Card>

      <Card
        title="Galería del vehículo"
        subtitle="Estado actual de la unidad. Al reasignar o desasignar se toman fotos nuevas y estas se reemplazan."
        right={esFlotaAdmin && (d.galeria?.length > 0) && (
          <Boton variant="ghost" onClick={abrirGaleria}>Actualizar fotos</Boton>
        )}
      >
        {d.galeria?.length > 0 ? (
          PUNTOS_TODOS.map((punto) => {
            const fotos = d.galeria.filter((f) => f.punto === punto);
            if (fotos.length === 0) return null;
            return (
              <div key={punto} className="mb-3">
                <div className="mb-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{punto}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {fotos.map((f) => (
                    <div key={f.id} className="aspect-square">
                      <FotoFirmada path={f.archivo_path} alt={punto} className="block h-full w-full" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Sin fotos todavía. Se cargan al asignar un conductor.
          </p>
        )}
      </Card>

      {d.historialConductores.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold tracking-tight">Historial de conductores</h2>
          <Card className="!p-0">
            <div className="p-4 sm:p-5">
              <Tabla
                columnas={[
                  { key: 'conductor_nombre', header: 'Conductor', render: (h) => (
                      <div>
                        <div>{h.conductor_nombre || '—'}</div>
                        {h.conductor_telefono && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{h.conductor_telefono}</div>}
                      </div>) },
                  { key: 'puesto', header: 'Puesto', render: (h) => h.puesto || '—' },
                  { key: 'departamento', header: 'Departamento', render: (h) => h.departamento || '—' },
                  { key: 'jefe_directo', header: 'Jefe directo', render: (h) => h.jefe_directo || '—' },
                  { key: 'tipo_prestacion', header: 'Tipo de prestación', render: (h) => h.tipo_prestacion || '—' },
                  { key: 'hasta', header: 'Hasta', nowrap: true, render: (h) => fechaCorta(h.hasta?.slice(0, 10)) },
                ]}
                filas={d.historialConductores}
              />
            </div>
          </Card>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Documentos</h2>
          {esFlotaAdmin && <button onClick={abrirDoc} className="text-xs underline" style={{ color: 'var(--series-1)' }}>+ Agregar documento</button>}
        </div>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              vacio="Sin documentos registrados."
              columnas={[
                { key: 'tipo', header: 'Tipo', render: (doc) => doc.tipo },
                { key: 'referencia', header: 'Referencia', render: (doc) => doc.referencia ?? '—' },
                { key: 'vence', header: 'Vence', nowrap: true, render: (doc) => doc.vence ? fechaCorta(doc.vence) : '—' },
                { key: 'estatus', header: 'Estatus', nowrap: true, render: (doc) => {
                    const e = estatusDoc(doc.vence);
                    return e ? <Badge color={e.color}>{e.label}</Badge> : '—';
                  } },
                { key: 'monto', header: 'Monto', align: 'right', render: (doc) => doc.monto ? money(doc.monto) : '—' },
                ...(esFlotaAdmin ? [{ key: 'accion', header: '', nowrap: true, render: (doc) => (
                    <button onClick={() => borrarDoc(doc.id)} className="text-xs underline" style={{ color: 'var(--critical)' }}>
                      Borrar
                    </button>) }] : []),
              ]}
              filas={d.documentos}
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Servicios</h2>
          {esFlotaAdmin && <button onClick={abrirServicio} className="text-xs underline" style={{ color: 'var(--series-1)' }}>+ Registrar servicio</button>}
        </div>
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
                { key: 'total', header: 'Costo', align: 'right', render: (s) => money(Number(s.mano_obra) + Number(s.refacciones)) },
              ]}
              filas={d.servicios}
            />
          </div>
        </Card>
      </div>

      {/* ---------------- Editar unidad ---------------- */}
      <Modal abierto={modalEditar} onClose={() => setModalEditar(false)} titulo="Editar unidad" ancho="max-w-2xl">
        {form && (
          <form onSubmit={guardarEdicion} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Código / No. económico">
                <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              </Campo>
              <Campo label="Ciudad">
                <Select value={form.ciudad_id} onChange={(e) => setForm({ ...form, ciudad_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
              </Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="Marca"><Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></Campo>
              <Campo label="Modelo"><Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></Campo>
              <Campo label="Año"><Input inputMode="numeric" value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} /></Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="Tipo"><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></Campo>
              <Campo label="Motor"><Input value={form.motor} onChange={(e) => setForm({ ...form, motor: e.target.value })} /></Campo>
              <Campo label="Color"><Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Placas"><Input value={form.placas} onChange={(e) => setForm({ ...form, placas: e.target.value })} /></Campo>
              <Campo label="VIN"><Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></Campo>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="Propiedad">
                <Select value={form.propiedad} onChange={(e) => setForm({ ...form, propiedad: e.target.value })}>
                  <option value="propio">Propio</option>
                  <option value="arrendado">Arrendado</option>
                </Select>
              </Campo>
              <Campo label="Estado">
                <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                  {Object.entries(ESTADOS).map(([k, val]) => <option key={k} value={k}>{val}</option>)}
                </Select>
              </Campo>
              <Campo label="Kilometraje"><Input inputMode="numeric" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} /></Campo>
            </div>
            <Campo label="Valor">
              <Input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </Campo>

            <p className="rounded-lg border p-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              El conductor y sus datos se cambian con <strong>Asignar / Reasignar / Desasignar</strong> en la tarjeta
              "Conductor asignado", donde se registra la inspección de fotos.
            </p>

            <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Próximo servicio</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Kilometraje"><Input inputMode="numeric" value={form.proximo_servicio_km} onChange={(e) => setForm({ ...form, proximo_servicio_km: e.target.value })} /></Campo>
                <Campo label="Fecha"><Input type="date" value={form.proximo_servicio_fecha} onChange={(e) => setForm({ ...form, proximo_servicio_fecha: e.target.value })} /></Campo>
              </div>
            </div>

            <Campo label="Notas">
              <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </Campo>

            {formError && <Aviso tono="critical">{formError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setModalEditar(false)}>Cancelar</Boton>
              <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- Agregar documento ---------------- */}
      <Modal abierto={modalDoc} onClose={() => setModalDoc(false)} titulo="Agregar documento">
        <form onSubmit={guardarDoc} className="space-y-3">
          <Campo label="Tipo" required hint="Ej. Póliza de seguro, Verificación vehicular, Tarjeta de circulación">
            <Input value={formDoc.tipo} required onChange={(e) => setFormDoc({ ...formDoc, tipo: e.target.value })} />
          </Campo>
          <Campo label="Referencia / folio">
            <Input value={formDoc.referencia} onChange={(e) => setFormDoc({ ...formDoc, referencia: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Emisión">
              <Input type="date" value={formDoc.emision} onChange={(e) => setFormDoc({ ...formDoc, emision: e.target.value })} />
            </Campo>
            <Campo label="Vencimiento">
              <Input type="date" value={formDoc.vence} onChange={(e) => setFormDoc({ ...formDoc, vence: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Monto" hint="Opcional">
            <Input inputMode="decimal" value={formDoc.monto} onChange={(e) => setFormDoc({ ...formDoc, monto: e.target.value })} />
          </Campo>
          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModalDoc(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Agregar'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Registrar servicio ---------------- */}
      <Modal abierto={modalServ} onClose={() => setModalServ(false)} titulo="Registrar servicio">
        <form onSubmit={guardarServicio} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Fecha" required>
              <Input type="date" value={formServ.fecha} required onChange={(e) => setFormServ({ ...formServ, fecha: e.target.value })} />
            </Campo>
            <Campo label="Tipo">
              <Select value={formServ.tipo} onChange={(e) => setFormServ({ ...formServ, tipo: e.target.value })}>
                <option value="preventivo">Preventivo</option>
                <option value="correctivo">Correctivo</option>
              </Select>
            </Campo>
          </div>
          <Campo label="Concepto" required hint="Ej. Servicio 80,000 km">
            <Input value={formServ.concepto} required onChange={(e) => setFormServ({ ...formServ, concepto: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Taller">
              <Input value={formServ.taller} onChange={(e) => setFormServ({ ...formServ, taller: e.target.value })} />
            </Campo>
            <Campo label="Kilometraje">
              <Input inputMode="numeric" value={formServ.km} onChange={(e) => setFormServ({ ...formServ, km: e.target.value })} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Mano de obra">
              <Input inputMode="decimal" value={formServ.mano_obra} placeholder="0.00" onChange={(e) => setFormServ({ ...formServ, mano_obra: e.target.value })} />
            </Campo>
            <Campo label="Refacciones">
              <Input inputMode="decimal" value={formServ.refacciones} placeholder="0.00" onChange={(e) => setFormServ({ ...formServ, refacciones: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Descripción">
            <Textarea rows={2} value={formServ.descripcion} onChange={(e) => setFormServ({ ...formServ, descripcion: e.target.value })} />
          </Campo>
          <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Próximo servicio (opcional)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Kilometraje">
                <Input inputMode="numeric" value={formServ.proximo_servicio_km} onChange={(e) => setFormServ({ ...formServ, proximo_servicio_km: e.target.value })} />
              </Campo>
              <Campo label="Fecha">
                <Input type="date" value={formServ.proximo_servicio_fecha} onChange={(e) => setFormServ({ ...formServ, proximo_servicio_fecha: e.target.value })} />
              </Campo>
            </div>
          </div>
          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModalServ(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar servicio'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Asignar / reasignar / desasignar conductor ---------------- */}
      <Modal
        abierto={!!modalReasig}
        onClose={() => !guardando && setModalReasig(null)}
        ancho="max-w-2xl"
        titulo={modalReasig === 'asignar' ? 'Asignar conductor'
          : modalReasig === 'desasignar' ? 'Desasignar conductor' : 'Reasignar conductor'}
      >
        {modalReasig && (
          <form onSubmit={ejecutarReasignar} className="space-y-4">
            {d.galeria?.length > 0 && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Cómo se entregó {v.conductor_nombre ? `a ${v.conductor_nombre}` : ''} (galería actual)
                </div>
                {PUNTOS_TODOS.map((punto) => {
                  const fotos = d.galeria.filter((f) => f.punto === punto);
                  if (fotos.length === 0) return null;
                  return (
                    <div key={punto} className="mb-2">
                      <div className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>{punto}</div>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {fotos.map((f) => (
                          <div key={f.id} className="aspect-square">
                            <FotoFirmada path={f.archivo_path} alt={punto} className="block h-full w-full" />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2 text-xs font-medium" style={{ color: 'var(--good)' }}>
                {v.conductor_nombre ? 'Fotos nuevas (cómo se devuelve la unidad)' : 'Fotos del estado actual de la unidad'}
              </div>
              <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                Obligatorio. Al aceptar, estas reemplazan a la galería anterior (las fotos pasadas se borran).
              </p>
              <ChecklistFotos valor={fotosNuevas} onChange={setFotosNuevas} />
            </div>

            {(modalReasig === 'asignar' || modalReasig === 'reasignar') && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Nuevo conductor</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo label="Nombre" required>
                    <Input value={conductorForm.nombre} required onChange={(e) => setConductorForm({ ...conductorForm, nombre: e.target.value })} />
                  </Campo>
                  <Campo label="Teléfono">
                    <Input value={conductorForm.telefono} onChange={(e) => setConductorForm({ ...conductorForm, telefono: e.target.value })} />
                  </Campo>
                  <Campo label="Correo">
                    <Input value={conductorForm.correo} onChange={(e) => setConductorForm({ ...conductorForm, correo: e.target.value })} />
                  </Campo>
                  <Campo label="Licencia">
                    <Input value={conductorForm.licencia} onChange={(e) => setConductorForm({ ...conductorForm, licencia: e.target.value })} />
                  </Campo>
                  <Campo label="Vence licencia">
                    <Input type="date" value={conductorForm.licencia_vence} onChange={(e) => setConductorForm({ ...conductorForm, licencia_vence: e.target.value })} />
                  </Campo>
                  <Campo label="Puesto">
                    <Input value={conductorForm.puesto} onChange={(e) => setConductorForm({ ...conductorForm, puesto: e.target.value })} />
                  </Campo>
                  <Campo label="Departamento">
                    <Input value={conductorForm.departamento} onChange={(e) => setConductorForm({ ...conductorForm, departamento: e.target.value })} />
                  </Campo>
                  <Campo label="Jefe directo">
                    <Input value={conductorForm.jefe_directo} onChange={(e) => setConductorForm({ ...conductorForm, jefe_directo: e.target.value })} />
                  </Campo>
                  <Campo label="Tipo de prestación">
                    <Input value={conductorForm.tipo_prestacion} onChange={(e) => setConductorForm({ ...conductorForm, tipo_prestacion: e.target.value })} />
                  </Campo>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Kilometraje actual">
                <Input inputMode="numeric" value={inspKm} onChange={(e) => setInspKm(e.target.value)} />
              </Campo>
            </div>

            {reasigError && <Aviso tono="critical">{reasigError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setModalReasig(null)}>Cancelar</Boton>
              <Boton type="submit" disabled={guardando}>
                {guardando ? 'Guardando…'
                  : modalReasig === 'desasignar' ? 'Confirmar devolución'
                  : modalReasig === 'asignar' ? 'Asignar' : 'Reasignar'}
              </Boton>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- Actualizar galería ---------------- */}
      <Modal abierto={modalGaleria} onClose={() => !guardando && setModalGaleria(false)} ancho="max-w-2xl" titulo="Actualizar fotos del vehículo">
        <form onSubmit={guardarGaleria} className="space-y-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Las fotos nuevas reemplazan por completo la galería actual (las anteriores se borran).
          </p>
          <ChecklistFotos valor={fotosGaleria} onChange={setFotosGaleria} />
          {galeriaError && <Aviso tono="critical">{galeriaError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setModalGaleria(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar fotos'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ChecklistFotos({ valor, onChange }) {
  function agregar(punto, fileList) {
    const nuevos = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!nuevos.length) return;
    onChange({ ...valor, [punto]: [...valor[punto], ...nuevos] });
  }
  function quitar(punto, i) {
    onChange({ ...valor, [punto]: valor[punto].filter((_, idx) => idx !== i) });
  }
  return (
    <div className="space-y-3">
      {PUNTOS_TODOS.map((punto) => (
        <div key={punto}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{punto}</span>
            <label className="cursor-pointer text-xs underline" style={{ color: 'var(--series-1)' }}>
              + Fotos
              <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                     onChange={(e) => { agregar(punto, e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          {valor[punto].length > 0 && (
            <div className="flex flex-wrap gap-2">
              {valor[punto].map((file, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(file)} alt="" className="h-14 w-14 rounded-lg border object-cover"
                       style={{ borderColor: 'var(--border)' }} />
                  <button type="button" onClick={() => quitar(punto, i)}
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
                          style={{ background: 'var(--critical)' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
