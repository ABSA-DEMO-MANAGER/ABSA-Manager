import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { subirArchivo } from '../../lib/storage';
import FotoFirmada from '../../components/FotoFirmada';
import { FotoInput } from '../../components/FotoInput';
import { money, fechaCorta, hoyISO } from '../../lib/format';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input, Textarea,
} from '../../components/ui';

const CATEGORIAS = {
  mantenimiento: 'Mantenimiento', cambio_pieza: 'Cambio de pieza', compra_pieza: 'Compra de pieza',
  reparacion: 'Reparación', siniestro: 'Siniestro / multa', otro: 'Otro',
  gasolina_viaje: 'Gasolina — viaje', gasolina_extra: 'Gasolina — carga extra', tag: 'Tag / caseta',
};
const ESTATUS_TICKET = { abierto: 'Abierto', en_proceso: 'En proceso', rechazado: 'Rechazado', completado: 'Completado' };
const COLOR_TICKET = { abierto: 'var(--series-1)', en_proceso: 'var(--serious)', rechazado: 'var(--critical)', completado: 'var(--good)' };
const ESTATUS_SOLICITUD = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const COLOR_SOLICITUD = { pendiente: 'var(--serious)', aprobada: 'var(--good)', rechazada: 'var(--critical)' };
const GRUPO_LABEL = { pendiente: 'Pendientes', resuelto: 'Resueltos', rechazado: 'Rechazados' };
const KM_POR_DIA = 5;

const FORM_VACIO = {
  vehiculo_id: '', categoria: 'mantenimiento', descripcion: '',
  ciudad_origen_id: '', ciudad_destino_id: '', ida_y_vuelta: false,
  fecha_inicio: hoyISO(), fecha_regreso: '', notas: '',
  kilometraje: '', litros_solicitados: '', monto_solicitado: '', foto: null,
};

function distanciaEntre(distancias, aId, bId) {
  if (!aId || !bId || aId === bId) return null;
  const a = Math.min(Number(aId), Number(bId)), b = Math.max(Number(aId), Number(bId));
  const fila = distancias.find((d) => d.ciudad_a_id === a && d.ciudad_b_id === b);
  return fila ? Number(fila.km) : null;
}
function diasDeViaje(inicio, regreso) {
  if (!inicio || !regreso) return 1;
  const dias = Math.round((new Date(regreso) - new Date(inicio)) / 86400000) + 1;
  return dias > 0 ? dias : 1;
}
function grupoEstatus(row) {
  if (row._origen === 'ticket') {
    if (row.estatus === 'completado') return 'resuelto';
    if (row.estatus === 'rechazado') return 'rechazado';
    return 'pendiente';
  }
  if (row.estatus === 'aprobada') return 'resuelto';
  if (row.estatus === 'rechazada') return 'rechazado';
  return 'pendiente';
}
function categoriaDe(row) {
  if (row._origen === 'ticket') return CATEGORIAS[row.categoria] ?? row.categoria;
  return CATEGORIAS[row.motivo === 'viaje' ? 'gasolina_viaje' : row.motivo === 'extra' ? 'gasolina_extra' : 'tag'];
}

function mailtoDecision({ sol, decision, motivoRechazo, vehLabel, personaById, ciudadById }) {
  const persona = personaById[sol.solicitante_id];
  const supervisor = persona?.supervisor_id ? personaById[persona.supervisor_id] : null;
  const to = [persona?.email, supervisor?.email].filter(Boolean).join(',');
  const asunto = `${sol.folio} — ${decision === 'aprobada' ? 'Aprobada' : 'Rechazada'}`;
  const lineas = [
    `Folio: ${sol.folio}`,
    `Solicitante: ${persona?.nombre ?? '—'}`,
    `Unidad: ${vehLabel}`,
    `Motivo: ${categoriaDe({ ...sol, _origen: 'solicitud' })}`,
    sol.motivo === 'viaje' ? `Ruta: ${ciudadById[sol.ciudad_origen_id]?.nombre ?? '—'} → ${ciudadById[sol.ciudad_destino_id]?.nombre ?? '—'}${sol.ida_y_vuelta ? ' (ida y vuelta)' : ' (solo ida)'} — ${sol.km_calculado ?? '—'} km` : null,
    sol.motivo === 'viaje' ? `Fechas: ${sol.fecha_inicio ?? '—'} a ${sol.fecha_regreso ?? '—'}` : null,
    sol.litros_solicitados ? `Litros solicitados: ${sol.litros_solicitados}${sol.monto_estimado ? ` (≈ ${money(sol.monto_estimado)})` : ''}` : null,
    sol.monto_solicitado ? `Monto solicitado: ${money(sol.monto_solicitado)}` : null,
    sol.kilometraje ? `Kilometraje reportado: ${sol.kilometraje}` : null,
    sol.notas ? `Notas / justificación: ${sol.notas}` : null,
    '',
    `Resultado: ${decision === 'aprobada' ? 'APROBADA' : 'RECHAZADA'}`,
    decision === 'rechazada' ? `Motivo de rechazo: ${motivoRechazo}` : null,
  ].filter(Boolean).join('\n');
  return `mailto:${to}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(lineas)}`;
}

export default function Tickets() {
  const { flotaPerfil, esFlotaAdmin, puedeVerEquipo } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [fGrupo, setFGrupo] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detalle, setDetalle] = useState(null);
  const [estatusEdit, setEstatusEdit] = useState('');
  const [motivoEdit, setMotivoEdit] = useState('');
  const [correoHref, setCorreoHref] = useState(null);

  async function cargar() {
    const [t, s, v, per, ciu, dist, precio] = await Promise.all([
      supabase.from('flota_tickets')
        .select('id, folio, vehiculo_id, categoria, descripcion, estatus, motivo_rechazo, solicitado_por, creado_en')
        .order('creado_en', { ascending: false }),
      supabase.from('flota_gasolina_solicitudes').select('*').order('creado_en', { ascending: false }),
      supabase.from('flota_vehiculos').select('id, codigo, marca, modelo, placas, rendimiento_km_l').order('codigo'),
      supabase.rpc('flota_listar_usuarios'),
      supabase.from('flota_ciudades').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('flota_distancias').select('id, ciudad_a_id, ciudad_b_id, km'),
      supabase.from('flota_precio_combustible').select('precio_litro').maybeSingle(),
    ]);
    const err = t.error || s.error || v.error || per.error || ciu.error || dist.error || precio.error;
    if (err) { setError(err.message); return; }
    setD({
      tickets: t.data, solicitudes: s.data, vehiculos: v.data, personas: per.data,
      ciudades: ciu.data, distancias: dist.data, precioLitro: Number(precio.data?.precio_litro ?? 0),
    });
  }
  useEffect(() => { cargar(); }, []);

  const vehById = useMemo(() => Object.fromEntries((d?.vehiculos ?? []).map((v) => [v.id, v])), [d]);
  const personaById = useMemo(() => Object.fromEntries((d?.personas ?? []).map((p) => [p.id, p])), [d]);
  const ciudadById = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.id, c])), [d]);
  const nombreVeh = (v) => v ? [v.codigo, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '—';

  const filas = useMemo(() => {
    if (!d) return [];
    const tix = d.tickets.map((t) => ({ ...t, _origen: 'ticket' }));
    const sol = d.solicitudes.map((s) => ({ ...s, _origen: 'solicitud' }));
    return [...tix, ...sol].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
  }, [d]);

  const filtrados = useMemo(() => filas.filter((f) => !fGrupo || grupoEstatus(f) === fGrupo), [filas, fGrupo]);

  const km = useMemo(
    () => distanciaEntre(d?.distancias ?? [], form.ciudad_origen_id, form.ciudad_destino_id),
    [d, form.ciudad_origen_id, form.ciudad_destino_id],
  );
  const kmTotal = km !== null ? km * (form.ida_y_vuelta ? 2 : 1) : null;
  const montoEstimadoForm = form.litros_solicitados && d?.precioLitro
    ? Number(form.litros_solicitados) * d.precioLitro : null;

  function abrirNuevo() {
    setForm({ ...FORM_VACIO, vehiculo_id: flotaPerfil?.vehiculo_asignado_id ? String(flotaPerfil.vehiculo_asignado_id) : '' });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.vehiculo_id) return setFormError('Selecciona la unidad.');

    const esViaje = form.categoria === 'gasolina_viaje';
    const esExtra = form.categoria === 'gasolina_extra';
    const esTag = form.categoria === 'tag';
    const esGasolina = esViaje || esExtra;

    if (esViaje) {
      if (!form.ciudad_origen_id || !form.ciudad_destino_id) return setFormError('Selecciona ciudad de origen y destino.');
      if (!form.fecha_inicio) return setFormError('Escribe la fecha de inicio del viaje.');
    }
    if (esExtra && !form.notas.trim()) return setFormError('Escribe la justificación de la carga extra.');
    if (esGasolina) {
      if (!form.kilometraje || Number(form.kilometraje) <= 0) return setFormError('Escribe tu kilometraje actual.');
      if (!form.litros_solicitados || Number(form.litros_solicitados) <= 0) return setFormError('Escribe cuántos litros necesitas.');
      if (!form.foto) return setFormError('La foto del kilometraje es obligatoria.');
    } else if (esTag) {
      if (!form.notas.trim()) return setFormError('Escribe el motivo o tramo del tag.');
      if (!form.monto_solicitado || Number(form.monto_solicitado) <= 0) return setFormError('Escribe el monto solicitado.');
    } else if (!form.descripcion.trim()) {
      return setFormError('Describe qué necesitas o qué pasó.');
    }

    setGuardando(true);
    try {
      if (esGasolina || esTag) {
        let fotoPath = null;
        if (form.foto) fotoPath = await subirArchivo(form.foto, `flota/${form.vehiculo_id}/gasolina`);
        const litros = form.litros_solicitados ? Number(form.litros_solicitados) : null;
        const montoEstimado = esTag ? null : (litros && d.precioLitro ? Math.round(litros * d.precioLitro * 100) / 100 : null);
        const { error: err } = await supabase.from('flota_gasolina_solicitudes').insert({
          vehiculo_id: Number(form.vehiculo_id), solicitante_id: flotaPerfil.perfil_id,
          motivo: esTag ? 'tag' : (esViaje ? 'viaje' : 'extra'),
          ciudad_origen_id: esViaje ? Number(form.ciudad_origen_id) : null,
          ciudad_destino_id: esViaje ? Number(form.ciudad_destino_id) : null,
          ida_y_vuelta: esViaje ? form.ida_y_vuelta : false,
          km_calculado: esViaje ? kmTotal : null,
          fecha_inicio: esViaje ? form.fecha_inicio : null,
          fecha_regreso: esViaje ? (form.fecha_regreso || null) : null,
          notas: form.notas.trim() || null,
          kilometraje: esGasolina ? Number(form.kilometraje) : null,
          foto_km_path: fotoPath,
          litros_solicitados: esGasolina ? litros : null,
          monto_solicitado: esTag ? Number(form.monto_solicitado) : null,
          monto_estimado: montoEstimado,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('flota_tickets').insert({
          vehiculo_id: Number(form.vehiculo_id), categoria: form.categoria,
          descripcion: form.descripcion.trim(), solicitado_por: flotaPerfil.perfil_id,
        });
        if (err) throw err;
      }
      setModal(false); cargar();
    } catch (err) {
      setFormError(err.message || 'No se pudo enviar la solicitud.');
    } finally {
      setGuardando(false);
    }
  }

  function abrirDetalle(row) {
    setDetalle(row); setCorreoHref(null);
    if (row._origen === 'ticket') {
      setEstatusEdit(row.estatus);
      setMotivoEdit(row.motivo_rechazo ?? '');
    } else {
      setMotivoEdit('');
    }
  }

  async function guardarEstatusTicket() {
    if (estatusEdit === 'rechazado' && !motivoEdit.trim()) {
      alert('Escribe el motivo de rechazo.');
      return;
    }
    const { error: err } = await supabase.from('flota_tickets')
      .update({ estatus: estatusEdit, motivo_rechazo: estatusEdit === 'rechazado' ? motivoEdit.trim() : null })
      .eq('id', detalle.id);
    if (err) { alert(err.message); return; }
    setDetalle(null); cargar();
  }

  async function resolverSolicitud(decision) {
    if (decision === 'rechazada' && !motivoEdit.trim()) {
      alert('Escribe el motivo de rechazo.');
      return;
    }
    const { error: err } = await supabase.from('flota_gasolina_solicitudes').update({
      estatus: decision, motivo_rechazo: decision === 'rechazada' ? motivoEdit.trim() : null,
      resuelto_por: flotaPerfil.perfil_id, resuelto_en: new Date().toISOString(),
    }).eq('id', detalle.id);
    if (err) { alert(err.message); return; }
    const actualizado = { ...detalle, estatus: decision, motivo_rechazo: motivoEdit.trim() || null };
    setDetalle(actualizado);
    setCorreoHref(mailtoDecision({
      sol: actualizado, decision, motivoRechazo: motivoEdit.trim(),
      vehLabel: nombreVeh(vehById[detalle.vehiculo_id]), personaById, ciudadById,
    }));
    cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los tickets: {error}</Aviso>;
  if (!d) return <Cargando />;

  // cuadre de la solicitud en revision (solo aplica bien a motivo=viaje con distancia + rendimiento)
  let cuadre = null;
  if (detalle && detalle._origen === 'solicitud' && detalle.motivo === 'viaje') {
    const vehiculo = vehById[detalle.vehiculo_id];
    const dias = diasDeViaje(detalle.fecha_inicio, detalle.fecha_regreso);
    const kmEsperado = detalle.km_calculado != null ? Number(detalle.km_calculado) + KM_POR_DIA * dias : null;
    const rendimiento = vehiculo?.rendimiento_km_l ? Number(vehiculo.rendimiento_km_l) : null;
    const litrosEsperados = kmEsperado != null && rendimiento ? kmEsperado / rendimiento : null;
    const litrosPedidos = Number(detalle.litros_solicitados) || 0;
    let veredicto = null;
    if (litrosEsperados) {
      const ratio = litrosPedidos / litrosEsperados;
      veredicto = ratio > 1.2 ? { texto: 'Parece alto', color: 'var(--critical)' }
        : ratio < 0.8 ? { texto: 'Parece bajo', color: 'var(--serious)' }
        : { texto: 'Razonable', color: 'var(--good)' };
    }
    cuadre = { dias, kmEsperado, rendimiento, litrosEsperados, litrosPedidos, veredicto };
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {esFlotaAdmin ? `${filtrados.length} de ${filas.length} solicitudes` : 'Mantenimiento, gasolina, tags y siniestros — todo desde aquí'}
          </p>
        </div>
        <Boton onClick={abrirNuevo}>+ Nuevo ticket</Boton>
      </div>

      {(esFlotaAdmin || puedeVerEquipo) && (
        <div className="flex flex-wrap gap-2">
          <Select value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} className="!w-auto">
            <option value="">Todos los estatus</option>
            {Object.entries(GRUPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      )}

      <Card>
        <Tabla
          onRowClick={abrirDetalle}
          vacio="Aún no hay tickets ni solicitudes."
          columnas={[
            { key: 'folio', header: 'Folio', nowrap: true, render: (t) => <span className="tnum">{t.folio}</span> },
            { key: 'vehiculo_id', header: 'Unidad', render: (t) => nombreVeh(vehById[t.vehiculo_id]) },
            ...(esFlotaAdmin || puedeVerEquipo ? [{ key: 'solicitante', header: 'Solicitante', render: (t) =>
                personaById[t._origen === 'ticket' ? t.solicitado_por : t.solicitante_id]?.nombre ?? '—' }] : []),
            { key: 'categoria', header: 'Categoría', nowrap: true, render: categoriaDe },
            { key: 'creado_en', header: 'Fecha', nowrap: true, render: (t) => fechaCorta(t.creado_en?.slice(0, 10)) },
            { key: 'estatus', header: 'Estatus', nowrap: true, render: (t) => t._origen === 'ticket'
                ? <Badge color={COLOR_TICKET[t.estatus]}>{ESTATUS_TICKET[t.estatus]}</Badge>
                : <Badge color={COLOR_SOLICITUD[t.estatus]}>{ESTATUS_SOLICITUD[t.estatus]}</Badge> },
          ]}
          filas={filtrados}
        />
      </Card>

      {/* ---------------- Nuevo ticket ---------------- */}
      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Nuevo ticket">
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Unidad" required>
            <Select value={form.vehiculo_id} required onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {d.vehiculos.map((v) => <option key={v.id} value={v.id}>{nombreVeh(v)}{v.placas ? ` · ${v.placas}` : ''}</option>)}
            </Select>
          </Campo>
          <Campo label="Categoría">
            <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Campo>

          {form.categoria === 'gasolina_viaje' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Ciudad de origen" required>
                  <Select value={form.ciudad_origen_id} required onChange={(e) => setForm({ ...form, ciudad_origen_id: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </Select>
                </Campo>
                <Campo label="Ciudad de destino" required>
                  <Select value={form.ciudad_destino_id} required onChange={(e) => setForm({ ...form, ciudad_destino_id: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </Select>
                </Campo>
              </div>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={form.ida_y_vuelta} onChange={(e) => setForm({ ...form, ida_y_vuelta: e.target.checked })} />
                Es viaje redondo (ida y vuelta)
              </label>
              {form.ciudad_origen_id && form.ciudad_destino_id && (
                km !== null
                  ? <Aviso>Distancia calculada: <strong>{kmTotal} km</strong> {form.ida_y_vuelta ? '(ida y vuelta)' : '(solo ida)'}.</Aviso>
                  : <Aviso tono="warning">No hay distancia registrada entre estas ciudades — se puede enviar igual.</Aviso>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Fecha de inicio" required>
                  <Input type="date" value={form.fecha_inicio} required onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
                </Campo>
                <Campo label="Fecha de regreso">
                  <Input type="date" value={form.fecha_regreso} onChange={(e) => setForm({ ...form, fecha_regreso: e.target.value })} />
                </Campo>
              </div>
              <Campo label="Notas adicionales" hint="Opcional">
                <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </Campo>
            </>
          )}

          {form.categoria === 'gasolina_extra' && (
            <Campo label="Justificación" required hint="Explica por qué necesitas la carga extra">
              <Textarea rows={3} value={form.notas} required onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </Campo>
          )}

          {(form.categoria === 'gasolina_viaje' || form.categoria === 'gasolina_extra') && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Kilometraje actual" required>
                <Input type="number" min="0" step="1" value={form.kilometraje} required onChange={(e) => setForm({ ...form, kilometraje: e.target.value })} />
              </Campo>
              <Campo label="Litros solicitados" required>
                <Input type="number" min="0" step="0.1" value={form.litros_solicitados} required onChange={(e) => setForm({ ...form, litros_solicitados: e.target.value })} />
              </Campo>
            </div>
          )}
          {(form.categoria === 'gasolina_viaje' || form.categoria === 'gasolina_extra') && montoEstimadoForm !== null && (
            <Aviso>Costo estimado: <strong>{money(montoEstimadoForm)}</strong> (a {money(d.precioLitro)}/litro).</Aviso>
          )}
          {(form.categoria === 'gasolina_viaje' || form.categoria === 'gasolina_extra') && (
            <Campo label="Foto del kilometraje" required hint="Obligatoria — tómala del tablero justo ahora">
              <FotoInput value={form.foto} onChange={(f) => setForm({ ...form, foto: f })} />
            </Campo>
          )}

          {form.categoria === 'tag' && (
            <>
              <Campo label="Motivo / tramo" required hint="Ej. Caseta Guadalajara-Colima">
                <Textarea rows={2} value={form.notas} required onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </Campo>
              <Campo label="Monto solicitado (MXN)" required>
                <Input type="number" min="0" step="0.01" value={form.monto_solicitado} required onChange={(e) => setForm({ ...form, monto_solicitado: e.target.value })} />
              </Campo>
              <Campo label="Foto del comprobante" hint="Opcional">
                <FotoInput value={form.foto} onChange={(f) => setForm({ ...form, foto: f })} />
              </Campo>
            </>
          )}

          {!['gasolina_viaje', 'gasolina_extra', 'tag'].includes(form.categoria) && (
            <Campo label="Descripción" required hint="Describe qué necesitas o qué pasó">
              <Textarea rows={4} value={form.descripcion} required
                        onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Campo>
          )}

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Enviando…' : 'Enviar solicitud'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Detalle: ticket normal ---------------- */}
      <Modal abierto={!!detalle && detalle._origen === 'ticket'} onClose={() => setDetalle(null)}
             titulo={detalle ? `${detalle.folio} — ${categoriaDe(detalle)}` : ''}>
        {detalle && detalle._origen === 'ticket' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge color={COLOR_TICKET[detalle.estatus]}>{ESTATUS_TICKET[detalle.estatus]}</Badge>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fechaCorta(detalle.creado_en?.slice(0, 10))}</span>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Unidad</div>
              <div className="text-sm font-medium">{nombreVeh(vehById[detalle.vehiculo_id])}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Solicitante</div>
              <div className="text-sm">{personaById[detalle.solicitado_por]?.nombre ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Descripción</div>
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>{detalle.descripcion}</div>
            </div>
            {detalle.estatus === 'rechazado' && detalle.motivo_rechazo && (
              <Aviso tono="critical"><strong>Motivo de rechazo:</strong> {detalle.motivo_rechazo}</Aviso>
            )}

            {esFlotaAdmin && (
              <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium" style={{ color: 'var(--series-1)' }}>Gestión</div>
                <Campo label="Estatus">
                  <Select value={estatusEdit} onChange={(e) => setEstatusEdit(e.target.value)}>
                    {Object.entries(ESTATUS_TICKET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Campo>
                {estatusEdit === 'rechazado' && (
                  <Campo label="Motivo de rechazo" required>
                    <Textarea rows={2} value={motivoEdit} onChange={(e) => setMotivoEdit(e.target.value)} />
                  </Campo>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Boton>
              {esFlotaAdmin && <Boton onClick={guardarEstatusTicket}>Guardar cambios</Boton>}
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------- Detalle: gasolina / tag ---------------- */}
      <Modal abierto={!!detalle && detalle._origen === 'solicitud'} onClose={() => setDetalle(null)}
             titulo={detalle ? `${detalle.folio} — ${categoriaDe(detalle)}` : ''}>
        {detalle && detalle._origen === 'solicitud' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={COLOR_SOLICITUD[detalle.estatus]}>{ESTATUS_SOLICITUD[detalle.estatus]}</Badge>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fechaCorta(detalle.creado_en?.slice(0, 10))}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Solicitante</div><div>{personaById[detalle.solicitante_id]?.nombre ?? '—'}</div></div>
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Unidad</div><div>{nombreVeh(vehById[detalle.vehiculo_id])}</div></div>
              {detalle.motivo === 'viaje' && (
                <>
                  <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Ruta</div>
                    <div>{ciudadById[detalle.ciudad_origen_id]?.nombre} → {ciudadById[detalle.ciudad_destino_id]?.nombre}{detalle.km_calculado ? ` (${detalle.km_calculado} km${detalle.ida_y_vuelta ? ', redondo' : ', solo ida'})` : ''}</div></div>
                  <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Fechas</div>
                    <div>{fechaCorta(detalle.fecha_inicio)} a {detalle.fecha_regreso ? fechaCorta(detalle.fecha_regreso) : '—'}</div></div>
                </>
              )}
              {detalle.kilometraje && <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Kilometraje reportado</div><div>{detalle.kilometraje}</div></div>}
              {detalle.litros_solicitados && (
                <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Litros solicitados</div>
                  <div>{detalle.litros_solicitados}{detalle.monto_estimado ? ` (≈ ${money(detalle.monto_estimado)})` : ''}</div></div>
              )}
              {detalle.monto_solicitado && <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Monto solicitado</div><div>{money(detalle.monto_solicitado)}</div></div>}
            </div>
            {detalle.notas && (
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{detalle.motivo === 'viaje' ? 'Notas' : detalle.motivo === 'tag' ? 'Motivo / tramo' : 'Justificación'}</div>
                <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>{detalle.notas}</div>
              </div>
            )}
            {detalle.foto_km_path && (
              <div>
                <div className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>{detalle.motivo === 'tag' ? 'Foto del comprobante' : 'Foto del kilometraje'}</div>
                <div className="w-40"><FotoFirmada path={detalle.foto_km_path} alt="Evidencia" className="block aspect-square w-full" /></div>
              </div>
            )}
            {detalle.estatus === 'rechazada' && detalle.motivo_rechazo && (
              <Aviso tono="critical"><strong>Motivo de rechazo:</strong> {detalle.motivo_rechazo}</Aviso>
            )}

            {esFlotaAdmin && detalle.motivo === 'viaje' && cuadre && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Cuadre de la solicitud</div>
                {!cuadre.kmEsperado ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No se puede calcular — falta la distancia entre estas ciudades.</p>
                ) : !cuadre.rendimiento ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Distancia esperada: {Math.round(cuadre.kmEsperado)} km ({detalle.km_calculado} km de ruta + {KM_POR_DIA}×{cuadre.dias} días de margen).
                    Falta el rendimiento (km/l) de la unidad para estimar litros.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>
                      Distancia esperada: <strong>{Math.round(cuadre.kmEsperado)} km</strong> ({detalle.km_calculado} de ruta + {KM_POR_DIA}×{cuadre.dias} días) ·{' '}
                      con {cuadre.rendimiento} km/l se esperan <strong>~{cuadre.litrosEsperados.toFixed(1)} litros</strong> · se pidieron <strong>{cuadre.litrosPedidos}</strong>.
                    </span>
                    <Badge color={cuadre.veredicto.color}>{cuadre.veredicto.texto}</Badge>
                  </div>
                )}
              </div>
            )}

            {esFlotaAdmin && detalle.estatus === 'pendiente' && (
              <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <Campo label="Motivo de rechazo" hint="Solo si vas a rechazar">
                  <Textarea rows={2} value={motivoEdit} onChange={(e) => setMotivoEdit(e.target.value)} />
                </Campo>
                <div className="flex justify-end gap-2">
                  <Boton variant="danger" onClick={() => resolverSolicitud('rechazada')}>Rechazar</Boton>
                  <Boton onClick={() => resolverSolicitud('aprobada')}>Aprobar</Boton>
                </div>
              </div>
            )}

            {correoHref && (
              <Aviso tono="good">
                Decisión guardada. <a href={correoHref} className="underline font-medium">Abrir correo de aviso</a> para enviarlo al solicitante y su supervisor.
              </Aviso>
            )}

            <div className="flex justify-end pt-1">
              <Boton type="button" variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
