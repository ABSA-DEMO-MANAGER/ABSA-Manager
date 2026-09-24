import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, fechaCorta, hoyISO } from '../../lib/format';
import { subirArchivo, borrarArchivo } from '../../lib/storage';
import FotoFirmada from '../../components/FotoFirmada';
import ChecklistFotos, { PUNTOS_UNIDAD, fotosVaciasUnidad, cuentaFotosUnidad } from '../../components/ChecklistFotos';
import {
  Cargando, Aviso, Badge, Stat, Tabla, Modal, Campo, Input, Select, Textarea,
  Boton, Card,
} from '../../components/ui';

const ESTADOS = { activo: 'Activo', en_mantenimiento: 'En mantenimiento', inactivo: 'Inactivo' };
const COLOR_ESTADO = { activo: 'var(--good)', en_mantenimiento: 'var(--serious)', inactivo: 'var(--text-muted)' };

const PUNTOS_TODOS = PUNTOS_UNIDAD;
const ROLES = { admin: 'Administrador General', director: 'Director', gerente: 'Gerente', usuario: 'Usuario', pendiente: 'Pendiente' };
const conductorVacio = () => ({ persona_id: '', supervisor_id: '' });
const fotosVacias = fotosVaciasUnidad;
const cuentaFotos = cuentaFotosUnidad;

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
  placas: '', vin: '', propiedad: 'propio', estado: 'activo', km: '', valor: '', rendimiento_km_l: '',
  proximo_servicio_km: '', proximo_servicio_fecha: '', notas: '',
};

const TIPOS_DOCUMENTO = [
  'Póliza de seguro', 'Checklist de usuario', 'Factura de compra',
  'Documentación de arrendamiento', 'Refrendos', 'Tarjetas de circulación',
];
const DOC_VACIO = { tipo: '', tipoOtro: '', referencia: '', emision: '', vence: '', monto: '' };

const SERV_VACIO = {
  fecha: hoyISO(), tipo: 'preventivo', concepto: '', taller: '', km: '',
  mano_obra: '', refacciones: '', descripcion: '',
  proximo_servicio_km: '', proximo_servicio_fecha: '',
};

export default function UnidadDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { esFlotaAdmin, flotaPerfil, puedeVerEquipo } = useFlotaPerfil();

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
  const [avisoCorreo, setAvisoCorreo] = useState(null); // { correo, nombre, asunto, cuerpo } tras asignar

  // Actualizar galería sin cambiar de conductor
  const [modalGaleria, setModalGaleria] = useState(false);
  const [fotosGaleria, setFotosGaleria] = useState(fotosVacias());
  const [galeriaError, setGaleriaError] = useState(null);

  const [modalDoc, setModalDoc] = useState(false);
  const [formDoc, setFormDoc] = useState(DOC_VACIO);

  const [modalServ, setModalServ] = useState(false);
  const [formServ, setFormServ] = useState(SERV_VACIO);

  async function cargar() {
    const [v, s, docs, servs, hist, insp, bit, per] = await Promise.all([
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
      supabase.from('flota_bitacora')
        .select('id, accion, antes, despues, hecho_por, creado_en')
        .eq('vehiculo_id', id).order('creado_en', { ascending: false }).limit(30),
      supabase.rpc('flota_listar_usuarios'),
    ]);
    const err = v.error || s.error || docs.error || servs.error || hist.error || insp.error || bit.error || per.error;
    if (err) { setError(err.message); return; }
    if (!v.data) { setError('no-existe'); return; }
    setD({
      vehiculo: v.data, ciudades: s.data, documentos: docs.data, servicios: servs.data,
      historialConductores: hist.data, galeria: insp.data, bitacora: bit.data, personas: per.data ?? [],
    });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [id]);

  const ciudadById = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.id, c])), [d]);
  const personaById = useMemo(() => Object.fromEntries((d?.personas ?? []).map((p) => [p.id, p])), [d]);
  const personasAsignables = useMemo(() => (d?.personas ?? []).filter((p) => p.rol !== 'pendiente'), [d]);
  const posiblesGerentes = useMemo(
    () => (d?.personas ?? []).filter((p) => ['admin', 'director', 'gerente'].includes(p.rol)),
    [d],
  );

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
      rendimiento_km_l: v.rendimiento_km_l ?? '',
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
      rendimiento_km_l: form.rendimiento_km_l === '' ? null : Number(form.rendimiento_km_l),
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

  function seleccionarPersona(personaId) {
    const persona = personaById[personaId];
    setConductorForm({
      ...conductorForm, persona_id: personaId,
      supervisor_id: persona?.supervisor_id ?? '',
    });
  }

  async function ejecutarReasignar(e) {
    e.preventDefault();
    setReasigError(null);
    const asignaNuevo = modalReasig === 'asignar' || modalReasig === 'reasignar';

    if (!asignaNuevo && cuentaFotos(fotosNuevas) === 0) {
      return setReasigError('Sube al menos una foto del estado actual de la unidad.');
    }
    const personaNueva = asignaNuevo ? personaById[conductorForm.persona_id] : null;
    if (asignaNuevo && !personaNueva) {
      return setReasigError('Selecciona el usuario registrado que va a conducir la unidad.');
    }
    if (asignaNuevo && !personaNueva.email) {
      return setReasigError('Esta persona no tiene correo registrado — no se le puede proponer la unidad.');
    }

    setGuardando(true);
    try {
      const vehiculoIdNum = Number(id);

      if (asignaNuevo) {
        // Ya no se asigna de un jalón: se propone la unidad y la
        // persona la acepta desde "Mi unidad", llenando ella misma
        // telefono/licencia/puesto/departamento/fotos/kilometraje.
        const personaSaliente = (d.personas ?? []).find((p) => p.vehiculo_asignado_id === vehiculoIdNum);
        if (personaSaliente && personaSaliente.id !== conductorForm.persona_id) {
          await supabase.from('flota_perfiles').update({ vehiculo_asignado_id: null }).eq('perfil_id', personaSaliente.id);
        }
        // Si ya habia una propuesta pendiente para alguien mas, se cancela para esa persona
        if (v.propuesta_perfil_id && v.propuesta_perfil_id !== conductorForm.persona_id) {
          await supabase.from('flota_perfiles').update({ vehiculo_propuesto_id: null }).eq('perfil_id', v.propuesta_perfil_id);
        }

        const { error: eProp } = await supabase.from('flota_vehiculos')
          .update({ propuesta_perfil_id: conductorForm.persona_id }).eq('id', id);
        if (eProp) throw eProp;

        const { error: ePerfil } = await supabase.from('flota_perfiles').update({
          vehiculo_propuesto_id: vehiculoIdNum,
          supervisor_id: conductorForm.supervisor_id || null,
        }).eq('perfil_id', conductorForm.persona_id);
        if (ePerfil) throw ePerfil;

        const unidad = [d.vehiculo.marca, d.vehiculo.modelo].filter(Boolean).join(' ') || 'una unidad';
        const liga = `${window.location.origin}/flotas/mi-unidad`;
        const aviso = {
          correo: personaNueva.email,
          nombre: personaNueva.nombre,
          asunto: `Se te asignó la unidad ${unidad}`,
          cuerpo: `Estimado ${personaNueva.nombre}, se te ha asignado la unidad ${unidad}, por favor ingresa a la plataforma para aceptar la solicitud y llenar la información solicitada: ${liga}`,
        };
        setAvisoCorreo(aviso);
        window.location.href = `mailto:${aviso.correo}?subject=${encodeURIComponent(aviso.asunto)}&body=${encodeURIComponent(aviso.cuerpo)}`;
      } else {
        // Desasignar: el admin sigue registrando cómo se devolvió la unidad.
        const kmNum = inspKm === '' ? null : Number(inspKm);
        const patch = {
          conductor_nombre: null, conductor_telefono: null, conductor_correo: null,
          conductor_licencia: null, licencia_vence: null,
          puesto: null, departamento: null, jefe_directo: null, tipo_prestacion: null,
        };
        if (kmNum !== null) patch.km = kmNum;
        const { error: eUpd } = await supabase.from('flota_vehiculos').update(patch).eq('id', id);
        if (eUpd) throw eUpd;

        const personaSaliente = (d.personas ?? []).find((p) => p.vehiculo_asignado_id === vehiculoIdNum);
        if (personaSaliente) {
          await supabase.from('flota_perfiles').update({ vehiculo_asignado_id: null }).eq('perfil_id', personaSaliente.id);
        }

        await borrarGaleriaActual();
        await subirFotos(fotosNuevas);
        setAvisoCorreo(null);
      }

      setModalReasig(null);
      cargar();
    } catch (err) {
      setReasigError(err.message || 'No se pudo completar la operación.');
    } finally {
      setGuardando(false);
    }
  }

  async function cancelarPropuesta() {
    if (!confirm('¿Cancelar la propuesta pendiente para esta unidad?')) return;
    setGuardando(true);
    try {
      await supabase.from('flota_perfiles').update({ vehiculo_propuesto_id: null }).eq('perfil_id', d.vehiculo.propuesta_perfil_id);
      await supabase.from('flota_vehiculos').update({ propuesta_perfil_id: null }).eq('id', id);
      cargar();
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
    const tipo = formDoc.tipo === '__otro__' ? formDoc.tipoOtro.trim() : formDoc.tipo;
    if (!tipo) return setFormError('Selecciona o escribe el tipo de documento.');
    setGuardando(true);
    const { error: err } = await supabase.from('flota_documentos').insert({
      vehiculo_id: Number(id),
      tipo,
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

      {avisoCorreo && (
        <Aviso tono="good">
          Unidad propuesta a {avisoCorreo.nombre} — se abrió tu correo con el aviso listo para enviar.{' '}
          <a href={`mailto:${avisoCorreo.correo}?subject=${encodeURIComponent(avisoCorreo.asunto)}&body=${encodeURIComponent(avisoCorreo.cuerpo)}`}
             className="underline font-medium">
            ¿No se abrió? Ábrelo aquí
          </a>
          {' · '}
          <button onClick={() => setAvisoCorreo(null)} className="underline" style={{ color: 'var(--text-secondary)' }}>
            Cerrar
          </button>
        </Aviso>
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
        {v.propuesta_perfil_id && (
          <div className="mb-3 flex items-center justify-between rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--plane)' }}>
            <span>
              Propuesta pendiente para <strong>{personaById[v.propuesta_perfil_id]?.nombre ?? 'alguien'}</strong> — esperando que acepte e ingrese sus datos.
            </span>
            {esFlotaAdmin && (
              <button onClick={cancelarPropuesta} disabled={guardando} className="ml-3 shrink-0 text-xs underline" style={{ color: 'var(--critical)' }}>
                Cancelar
              </button>
            )}
          </div>
        )}
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

      {puedeVerEquipo && d.bitacora?.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold tracking-tight">Bitácora de cambios</h2>
          <div className="space-y-2">
            {d.bitacora.map((b) => (
              <Card key={b.id} className="!p-3 sm:!p-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge color={b.accion === 'baja' ? 'var(--critical)' : b.accion === 'alta' ? 'var(--good)' : 'var(--series-1)'}>
                    {b.accion === 'alta' ? 'Alta' : b.accion === 'baja' ? 'Baja' : 'Edición'}
                  </Badge>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fechaCorta(b.creado_en?.slice(0, 10))} {new Date(b.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{personaById[b.hecho_por]?.nombre ?? 'Administrador General'}
                  </span>
                </div>
                {b.accion === 'edicion' ? (
                  <ul className="space-y-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {diffCampos(b.antes, b.despues).map(({ campo, antes, despues }) => (
                      <li key={campo}><strong>{campo}</strong>: {String(antes ?? '—')} → {String(despues ?? '—')}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {b.accion === 'alta' ? 'Unidad dada de alta.' : 'Unidad dada de baja.'}
                  </p>
                )}
              </Card>
            ))}
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Valor">
                <Input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </Campo>
              <Campo label="Rendimiento (km/litro)" hint="Para el cuadre de solicitudes de gasolina">
                <Input inputMode="decimal" value={form.rendimiento_km_l} onChange={(e) => setForm({ ...form, rendimiento_km_l: e.target.value })} />
              </Campo>
            </div>

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
          <Campo label="Tipo" required>
            <Select value={formDoc.tipo} required onChange={(e) => setFormDoc({ ...formDoc, tipo: e.target.value })}>
              <option value="">Selecciona…</option>
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__otro__">Otro…</option>
            </Select>
          </Campo>
          {formDoc.tipo === '__otro__' && (
            <Campo label="¿Cuál?">
              <Input value={formDoc.tipoOtro} required onChange={(e) => setFormDoc({ ...formDoc, tipoOtro: e.target.value })} />
            </Campo>
          )}
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
            {(modalReasig === 'asignar' || modalReasig === 'reasignar') ? (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Nuevo conductor</div>
                <Campo label="Usuario registrado" required hint="Solo se puede proponer a alguien con cuenta en Flotas — recibirá un aviso para aceptar y llenar sus datos">
                  <Select value={conductorForm.persona_id} required onChange={(e) => seleccionarPersona(e.target.value)}>
                    <option value="">Selecciona…</option>
                    {personasAsignables.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} · {ROLES[p.rol]} · {p.email}</option>
                    ))}
                  </Select>
                </Campo>
                {conductorForm.persona_id && personaById[conductorForm.persona_id]?.vehiculo_asignado_id
                  && personaById[conductorForm.persona_id].vehiculo_asignado_id !== Number(id) && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--serious)' }}>
                    Esta persona ya tiene otra unidad asignada — se la vamos a quitar de ahí si acepta esta.
                  </p>
                )}
                <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <Campo label="Gerente" hint="Define su equipo — de aquí sale también su Director, si el gerente ya tiene uno asignado">
                    <Select value={conductorForm.supervisor_id} onChange={(e) => setConductorForm({ ...conductorForm, supervisor_id: e.target.value })}>
                      <option value="">Sin asignar</option>
                      {posiblesGerentes.filter((g) => g.id !== conductorForm.persona_id).map((g) => (
                        <option key={g.id} value={g.id}>{g.nombre} · {ROLES[g.rol]}</option>
                      ))}
                    </Select>
                  </Campo>
                  {conductorForm.supervisor_id && personaById[conductorForm.supervisor_id]?.supervisor_id && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Director: {personaById[personaById[conductorForm.supervisor_id].supervisor_id]?.nombre ?? '—'}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Teléfono, licencia, puesto, departamento, tipo de prestación, kilometraje y fotos del estado
                  los llena esa persona al aceptar, desde "Mi unidad".
                </p>
              </div>
            ) : (
              <>
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
                    Fotos nuevas (cómo se devuelve la unidad)
                  </div>
                  <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Obligatorio. Al confirmar, estas reemplazan a la galería anterior (las fotos pasadas se borran).
                  </p>
                  <ChecklistFotos valor={fotosNuevas} onChange={setFotosNuevas} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo label="Kilometraje actual">
                    <Input inputMode="numeric" value={inspKm} onChange={(e) => setInspKm(e.target.value)} />
                  </Campo>
                </div>
              </>
            )}

            {reasigError && <Aviso tono="critical">{reasigError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setModalReasig(null)}>Cancelar</Boton>
              <Boton type="submit" disabled={guardando}>
                {guardando ? 'Guardando…'
                  : modalReasig === 'desasignar' ? 'Confirmar devolución'
                  : modalReasig === 'asignar' ? 'Proponer y enviar correo' : 'Reasignar y enviar correo'}
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

const CAMPO_IGNORADO = new Set(['id', 'creado_en']);
const CAMPO_LABEL = {
  codigo: 'Código', ciudad_id: 'Ciudad', marca: 'Marca', modelo: 'Modelo', anio: 'Año',
  tipo: 'Tipo', motor: 'Motor', color: 'Color', placas: 'Placas', vin: 'VIN',
  propiedad: 'Propiedad', estado: 'Estado', km: 'Kilometraje', valor: 'Valor',
  conductor_nombre: 'Conductor', conductor_telefono: 'Teléfono', conductor_correo: 'Correo',
  conductor_licencia: 'Licencia', licencia_vence: 'Vence licencia',
  puesto: 'Puesto', departamento: 'Departamento', jefe_directo: 'Jefe directo', tipo_prestacion: 'Tipo de prestación',
  proximo_servicio_km: 'Próximo servicio (km)', proximo_servicio_fecha: 'Próximo servicio (fecha)',
  notas: 'Notas', cajon_pesos: 'Cajón (pesos)', cajon_litros: 'Cajón (litros)',
};

function diffCampos(antes, despues) {
  if (!antes || !despues) return [];
  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const out = [];
  campos.forEach((campo) => {
    if (CAMPO_IGNORADO.has(campo)) return;
    const a = antes[campo], b = despues[campo];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ campo: CAMPO_LABEL[campo] || campo, antes: a, despues: b });
    }
  });
  return out;
}
