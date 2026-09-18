import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { subirArchivo } from '../../lib/storage';
import FotoFirmada from '../../components/FotoFirmada';
import { money, fechaCorta } from '../../lib/format';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input, Textarea,
} from '../../components/ui';

const ESTATUS = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
const COLOR_ESTATUS = { pendiente: 'var(--serious)', aprobada: 'var(--good)', rechazada: 'var(--critical)' };
const KM_POR_DIA = 5; // margen de recorrido local por cada dia de viaje, ademas de la ruta

const FORM_VACIO = {
  motivo: 'viaje', ciudad_origen_id: '', ciudad_destino_id: '', ida_y_vuelta: false,
  fecha_inicio: new Date().toISOString().slice(0, 10), fecha_regreso: '',
  notas: '', kilometraje: '', litros_solicitados: '', foto: null,
};

function distanciaEntre(distancias, aId, bId) {
  if (!aId || !bId || aId === bId) return null;
  const a = Math.min(Number(aId), Number(bId)), b = Math.max(Number(aId), Number(bId));
  const fila = distancias.find((d) => d.ciudad_a_id === a && d.ciudad_b_id === b);
  return fila ? Number(fila.km) : null;
}

function diasDeViaje(inicio, regreso) {
  if (!inicio) return 1;
  if (!regreso) return 1;
  const dias = Math.round((new Date(regreso) - new Date(inicio)) / 86400000) + 1;
  return dias > 0 ? dias : 1;
}

function parseCSV(texto) {
  const filas = []; let fila = [], cur = '', comillas = false;
  const t = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else comillas = false; }
      else cur += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(cur); cur = ''; }
    else if (c === '\n') { fila.push(cur); filas.push(fila); fila = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || fila.length) { fila.push(cur); filas.push(fila); }
  return filas.filter((f) => f.some((v) => String(v).trim() !== ''));
}

function descargarPlantillaDistancias() {
  const filas = [['ciudad_origen', 'ciudad_destino', 'km'], ['Guadalajara', 'Hermosillo', '850']];
  const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'plantilla_distancias.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function mailtoDecision({ sol, decision, motivoRechazo, vehLabel, personaById, ciudadById }) {
  const persona = personaById[sol.solicitante_id];
  const supervisor = persona?.supervisor_id ? personaById[persona.supervisor_id] : null;
  const to = [persona?.email, supervisor?.email].filter(Boolean).join(',');
  const asunto = `Solicitud de gasolina ${sol.folio} — ${decision === 'aprobada' ? 'Aprobada' : 'Rechazada'}`;
  const lineas = [
    `Folio: ${sol.folio}`,
    `Solicitante: ${persona?.nombre ?? '—'}`,
    `Unidad: ${vehLabel}`,
    `Motivo: ${sol.motivo === 'viaje' ? 'Viaje' : 'Gasolina extra'}`,
    sol.motivo === 'viaje' ? `Ruta: ${ciudadById[sol.ciudad_origen_id]?.nombre ?? '—'} → ${ciudadById[sol.ciudad_destino_id]?.nombre ?? '—'}${sol.ida_y_vuelta ? ' (ida y vuelta)' : ' (solo ida)'} — ${sol.km_calculado ?? '—'} km` : null,
    sol.motivo === 'viaje' ? `Fechas: ${sol.fecha_inicio ?? '—'} a ${sol.fecha_regreso ?? '—'}` : null,
    `Litros solicitados: ${sol.litros_solicitados ?? '—'}${sol.monto_estimado ? ` (≈ ${money(sol.monto_estimado)})` : ''}`,
    `Kilometraje reportado: ${sol.kilometraje}`,
    sol.notas ? `Notas / justificación: ${sol.notas}` : null,
    '',
    `Resultado: ${decision === 'aprobada' ? 'APROBADA' : 'RECHAZADA'}`,
    decision === 'rechazada' ? `Motivo de rechazo: ${motivoRechazo}` : null,
  ].filter(Boolean).join('\n');
  return `mailto:${to}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(lineas)}`;
}

export default function Gasolina() {
  const { flotaPerfil, esFlotaAdmin, puedeVerEquipo } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detalle, setDetalle] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [correoHref, setCorreoHref] = useState(null);

  const [distForm, setDistForm] = useState({ ciudad_a: '', ciudad_b: '', km: '' });
  const [distFilas, setDistFilas] = useState(null);
  const [importandoDist, setImportandoDist] = useState(false);

  const [precioForm, setPrecioForm] = useState('');
  const [editandoPrecio, setEditandoPrecio] = useState(false);

  async function cargar() {
    const [s, c, dist, veh, per, precio] = await Promise.all([
      supabase.from('flota_gasolina_solicitudes').select('*').order('creado_en', { ascending: false }),
      supabase.from('flota_ciudades').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('flota_distancias').select('id, ciudad_a_id, ciudad_b_id, km'),
      supabase.from('flota_vehiculos').select('id, codigo, marca, modelo, placas, rendimiento_km_l'),
      supabase.rpc('flota_listar_usuarios'),
      supabase.from('flota_precio_combustible').select('precio_litro').maybeSingle(),
    ]);
    const err = s.error || c.error || dist.error || veh.error || per.error || precio.error;
    if (err) { setError(err.message); return; }
    setD({ solicitudes: s.data, ciudades: c.data, distancias: dist.data, vehiculos: veh.data, personas: per.data, precioLitro: Number(precio.data?.precio_litro ?? 0) });
  }
  useEffect(() => { cargar(); }, []);

  const ciudadById = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.id, c])), [d]);
  const vehById = useMemo(() => Object.fromEntries((d?.vehiculos ?? []).map((v) => [v.id, v])), [d]);
  const personaById = useMemo(() => Object.fromEntries((d?.personas ?? []).map((p) => [p.id, p])), [d]);
  const nombreVeh = (v) => v ? [v.codigo, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '—';

  const km = useMemo(
    () => distanciaEntre(d?.distancias ?? [], form.ciudad_origen_id, form.ciudad_destino_id),
    [d, form.ciudad_origen_id, form.ciudad_destino_id],
  );
  const kmTotal = km !== null ? km * (form.ida_y_vuelta ? 2 : 1) : null;
  const montoEstimadoForm = form.litros_solicitados && d?.precioLitro
    ? Number(form.litros_solicitados) * d.precioLitro : null;

  const misSolicitudes = useMemo(
    () => (d?.solicitudes ?? []).filter((s) => s.solicitante_id === flotaPerfil?.perfil_id),
    [d, flotaPerfil],
  );
  const deMiEquipo = useMemo(
    () => (d?.solicitudes ?? []).filter((s) => s.solicitante_id !== flotaPerfil?.perfil_id),
    [d, flotaPerfil],
  );
  const porAprobar = useMemo(() => (d?.solicitudes ?? []).filter((s) => s.estatus === 'pendiente'), [d]);

  const distanciaPorId = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.nombre.trim().toLowerCase(), c.id])), [d]);

  function abrirNueva() {
    setForm(FORM_VACIO); setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    const vehiculo_id = flotaPerfil?.vehiculo_asignado_id;
    if (!vehiculo_id) return setFormError('No tienes una unidad asignada.');
    if (form.motivo === 'viaje') {
      if (!form.ciudad_origen_id || !form.ciudad_destino_id) return setFormError('Selecciona ciudad de origen y destino.');
      if (!form.fecha_inicio) return setFormError('Escribe la fecha de inicio del viaje.');
    } else if (!form.notas.trim()) {
      return setFormError('Escribe la justificación de la carga extra.');
    }
    if (!form.kilometraje || Number(form.kilometraje) <= 0) return setFormError('Escribe tu kilometraje actual.');
    if (!form.litros_solicitados || Number(form.litros_solicitados) <= 0) return setFormError('Escribe cuántos litros necesitas.');
    if (!form.foto) return setFormError('La foto del kilometraje es obligatoria.');

    setGuardando(true);
    try {
      const ruta = await subirArchivo(form.foto, `flota/${vehiculo_id}/gasolina`);
      const litros = Number(form.litros_solicitados);
      const { error: err } = await supabase.from('flota_gasolina_solicitudes').insert({
        vehiculo_id, solicitante_id: flotaPerfil.perfil_id, motivo: form.motivo,
        ciudad_origen_id: form.motivo === 'viaje' ? Number(form.ciudad_origen_id) : null,
        ciudad_destino_id: form.motivo === 'viaje' ? Number(form.ciudad_destino_id) : null,
        ida_y_vuelta: form.motivo === 'viaje' ? form.ida_y_vuelta : false,
        km_calculado: form.motivo === 'viaje' ? kmTotal : null,
        fecha_inicio: form.motivo === 'viaje' ? form.fecha_inicio : null,
        fecha_regreso: form.motivo === 'viaje' ? (form.fecha_regreso || null) : null,
        notas: form.notas.trim() || null,
        kilometraje: Number(form.kilometraje), foto_km_path: ruta,
        litros_solicitados: litros, monto_estimado: d.precioLitro ? Math.round(litros * d.precioLitro * 100) / 100 : null,
      });
      if (err) throw err;
      setModal(false); cargar();
    } catch (err) {
      setFormError(err.message || 'No se pudo enviar la solicitud.');
    } finally {
      setGuardando(false);
    }
  }

  function abrirDetalle(s) {
    setDetalle(s); setMotivoRechazo(''); setCorreoHref(null);
  }

  async function resolver(decision) {
    if (decision === 'rechazada' && !motivoRechazo.trim()) {
      alert('Escribe el motivo de rechazo.');
      return;
    }
    const { error: err } = await supabase.from('flota_gasolina_solicitudes').update({
      estatus: decision, motivo_rechazo: decision === 'rechazada' ? motivoRechazo.trim() : null,
      resuelto_por: flotaPerfil.perfil_id, resuelto_en: new Date().toISOString(),
    }).eq('id', detalle.id);
    if (err) { alert(err.message); return; }
    const actualizado = { ...detalle, estatus: decision, motivo_rechazo: motivoRechazo.trim() || null };
    setDetalle(actualizado);
    setCorreoHref(mailtoDecision({
      sol: actualizado, decision, motivoRechazo: motivoRechazo.trim(),
      vehLabel: nombreVeh(vehById[detalle.vehiculo_id]), personaById, ciudadById,
    }));
    cargar();
  }

  async function agregarDistancia(e) {
    e.preventDefault();
    if (!distForm.ciudad_a || !distForm.ciudad_b || distForm.ciudad_a === distForm.ciudad_b) {
      alert('Selecciona dos ciudades distintas.'); return;
    }
    const kmVal = Number(distForm.km);
    if (!kmVal || kmVal <= 0) { alert('Escribe una distancia válida.'); return; }
    const a = Math.min(Number(distForm.ciudad_a), Number(distForm.ciudad_b));
    const b = Math.max(Number(distForm.ciudad_a), Number(distForm.ciudad_b));
    const { error: err } = await supabase.from('flota_distancias')
      .upsert({ ciudad_a_id: a, ciudad_b_id: b, km: kmVal }, { onConflict: 'ciudad_a_id,ciudad_b_id' });
    if (err) { alert(err.message); return; }
    setDistForm({ ciudad_a: '', ciudad_b: '', km: '' });
    cargar();
  }

  function onArchivoDistancias(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result));
      if (grid.length < 2) { alert('El archivo no tiene datos'); return; }
      const encabezado = grid[0].map((h) => h.trim().toLowerCase());
      const filas = grid.slice(1).map((fila) => {
        const o = {};
        encabezado.forEach((col, i) => { o[col] = fila[i]; });
        const origenTexto = String(o.ciudad_origen ?? '').trim();
        const destinoTexto = String(o.ciudad_destino ?? '').trim();
        const origenId = distanciaPorId[origenTexto.toLowerCase()] ?? null;
        const destinoId = distanciaPorId[destinoTexto.toLowerCase()] ?? null;
        const km = parseFloat(String(o.km ?? '').replace(/[^\d.]/g, ''));
        return { origenTexto, destinoTexto, origenId, destinoId, km: isNaN(km) ? null : km };
      });
      setDistFilas(filas);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  async function importarDistancias() {
    const validas = distFilas.filter((f) => f.origenId && f.destinoId && f.origenId !== f.destinoId && f.km > 0);
    if (!validas.length) return;
    setImportandoDist(true);
    let okN = 0;
    for (const f of validas) {
      const a = Math.min(f.origenId, f.destinoId), b = Math.max(f.origenId, f.destinoId);
      const { error: err } = await supabase.from('flota_distancias')
        .upsert({ ciudad_a_id: a, ciudad_b_id: b, km: f.km }, { onConflict: 'ciudad_a_id,ciudad_b_id' });
      if (!err) okN++;
    }
    setImportandoDist(false);
    setDistFilas(null);
    alert(`${okN} distancia(s) guardadas.`);
    cargar();
  }

  function abrirPrecio() {
    setPrecioForm(String(d.precioLitro || ''));
    setEditandoPrecio(true);
  }
  async function guardarPrecio(e) {
    e.preventDefault();
    const { error: err } = await supabase.from('flota_precio_combustible')
      .update({ precio_litro: Number(precioForm) || 0, actualizado_en: new Date().toISOString() }).eq('id', true);
    if (err) { alert(err.message); return; }
    setEditandoPrecio(false);
    cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar las solicitudes de gasolina: {error}</Aviso>;
  if (!d) return <Cargando />;

  const columnasSolicitud = (mostrarSolicitante) => [
    { key: 'folio', header: 'Folio', nowrap: true, render: (s) => <span className="tnum">{s.folio}</span> },
    ...(mostrarSolicitante ? [{ key: 'solicitante', header: 'Solicitante', render: (s) => personaById[s.solicitante_id]?.nombre ?? '—' }] : []),
    { key: 'vehiculo', header: 'Unidad', render: (s) => nombreVeh(vehById[s.vehiculo_id]) },
    { key: 'motivo', header: 'Motivo', nowrap: true, render: (s) => s.motivo === 'viaje' ? 'Viaje' : 'Extra' },
    { key: 'litros', header: 'Litros', align: 'right', render: (s) => s.litros_solicitados ?? '—' },
    { key: 'monto', header: 'Costo est.', align: 'right', render: (s) => s.monto_estimado ? money(s.monto_estimado) : '—' },
    { key: 'fecha', header: 'Fecha', nowrap: true, render: (s) => fechaCorta(s.creado_en?.slice(0, 10)) },
    { key: 'estatus', header: 'Estatus', nowrap: true, render: (s) => <Badge color={COLOR_ESTATUS[s.estatus]}>{ESTATUS[s.estatus]}</Badge> },
  ];

  // ---- "cuadre" del detalle en revision (solo aplica bien a motivo=viaje con distancia + rendimiento) ----
  let cuadre = null;
  if (detalle && detalle.motivo === 'viaje') {
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
          <h1 className="text-xl font-semibold tracking-tight">Gasolina</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Solicita un viaje o una carga extra de combustible.
          </p>
        </div>
        <Boton onClick={abrirNueva}>+ Nueva solicitud</Boton>
      </div>

      {!flotaPerfil?.vehiculo_asignado_id && (
        <Aviso tono="warning">No tienes una unidad asignada — pídele a un administrador de Flotas que te asigne una para poder solicitar gasolina.</Aviso>
      )}

      {esFlotaAdmin && porAprobar.length > 0 && (
        <Card title={`Por aprobar · ${porAprobar.length}`}>
          <Tabla onRowClick={abrirDetalle} columnas={columnasSolicitud(true)} filas={porAprobar} />
        </Card>
      )}

      <Card title="Mis solicitudes">
        <Tabla onRowClick={abrirDetalle} vacio="Aún no has hecho solicitudes." columnas={columnasSolicitud(false)} filas={misSolicitudes} />
      </Card>

      {puedeVerEquipo && deMiEquipo.length > 0 && (
        <Card title={esFlotaAdmin ? 'Todas las solicitudes' : 'Solicitudes de mi equipo'}>
          <Tabla onRowClick={abrirDetalle} columnas={columnasSolicitud(true)} filas={deMiEquipo} />
        </Card>
      )}

      {esFlotaAdmin && (
        <Card title="Precio de la gasolina" subtitle="Se usa para calcular el costo estimado de cada solicitud.">
          {editandoPrecio ? (
            <form onSubmit={guardarPrecio} className="flex flex-wrap items-end gap-2">
              <Campo label="Precio por litro (MXN)">
                <Input type="number" min="0" step="0.01" value={precioForm} onChange={(e) => setPrecioForm(e.target.value)} className="!w-32" />
              </Campo>
              <Boton type="submit">Guardar</Boton>
              <Boton type="button" variant="ghost" onClick={() => setEditandoPrecio(false)}>Cancelar</Boton>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold tracking-tight">{money(d.precioLitro)} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>/ litro</span></span>
              <Boton variant="ghost" onClick={abrirPrecio}>Actualizar precio</Boton>
            </div>
          )}
        </Card>
      )}

      {esFlotaAdmin && (
        <Card title="Distancias entre ciudades" subtitle="Se usan para calcular los km de un viaje. Agrega los pares que falten, uno por uno o por CSV.">
          <form onSubmit={agregarDistancia} className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Select value={distForm.ciudad_a} onChange={(e) => setDistForm({ ...distForm, ciudad_a: e.target.value })}>
              <option value="">Ciudad A</option>
              {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
            <Select value={distForm.ciudad_b} onChange={(e) => setDistForm({ ...distForm, ciudad_b: e.target.value })}>
              <option value="">Ciudad B</option>
              {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
            <Input type="number" min="0" step="0.1" placeholder="Km" value={distForm.km} onChange={(e) => setDistForm({ ...distForm, km: e.target.value })} />
            <Boton type="submit">Guardar distancia</Boton>
          </form>

          <div className="mb-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Carga masiva:</span>
            <Boton variant="ghost" onClick={descargarPlantillaDistancias}>Descargar plantilla CSV</Boton>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: 'var(--series-1)' }}>
              Subir CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onArchivoDistancias} />
            </label>
          </div>

          {distFilas && (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>{distFilas.filter((f) => f.origenId && f.destinoId && f.km > 0).length} de {distFilas.length} filas listas</span>
                <div className="flex-1" />
                <Boton disabled={importandoDist} onClick={importarDistancias}>{importandoDist ? 'Importando…' : 'Importar distancias'}</Boton>
              </div>
              <Tabla
                columnas={[
                  { key: 'origen', header: 'Origen', render: (f) => f.origenId ? f.origenTexto : <span style={{ color: 'var(--critical)' }}>{f.origenTexto} (no encontrada)</span> },
                  { key: 'destino', header: 'Destino', render: (f) => f.destinoId ? f.destinoTexto : <span style={{ color: 'var(--critical)' }}>{f.destinoTexto} (no encontrada)</span> },
                  { key: 'km', header: 'Km', align: 'right', render: (f) => f.km ?? <span style={{ color: 'var(--critical)' }}>—</span> },
                ]}
                filas={distFilas.slice(0, 50)}
              />
              {distFilas.length > 50 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>…y {distFilas.length - 50} más</p>}
            </div>
          )}

          <Tabla
            vacio="Sin distancias registradas todavía."
            columnas={[
              { key: 'a', header: 'Ciudad A', render: (r) => ciudadById[r.ciudad_a_id]?.nombre ?? '—' },
              { key: 'b', header: 'Ciudad B', render: (r) => ciudadById[r.ciudad_b_id]?.nombre ?? '—' },
              { key: 'km', header: 'Km', align: 'right', render: (r) => r.km },
            ]}
            filas={d.distancias}
          />
        </Card>
      )}

      {/* ---------------- Nueva solicitud ---------------- */}
      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Nueva solicitud de gasolina">
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Motivo">
            <Select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
              <option value="viaje">Viaje</option>
              <option value="extra">Gasolina extra</option>
            </Select>
          </Campo>

          {form.motivo === 'viaje' ? (
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
                  : <Aviso tono="warning">No hay distancia registrada entre estas ciudades — se puede enviar igual, pídele al administrador que la agregue.</Aviso>
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
          ) : (
            <Campo label="Justificación" required hint="Explica por qué necesitas la carga extra">
              <Textarea rows={3} value={form.notas} required onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </Campo>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Kilometraje actual" required>
              <Input type="number" min="0" step="1" value={form.kilometraje} required onChange={(e) => setForm({ ...form, kilometraje: e.target.value })} />
            </Campo>
            <Campo label="Litros solicitados" required>
              <Input type="number" min="0" step="0.1" value={form.litros_solicitados} required onChange={(e) => setForm({ ...form, litros_solicitados: e.target.value })} />
            </Campo>
          </div>
          {montoEstimadoForm !== null && (
            <Aviso>Costo estimado: <strong>{money(montoEstimadoForm)}</strong> (a {money(d.precioLitro)}/litro).</Aviso>
          )}

          <Campo label="Foto del kilometraje" required hint="Obligatoria — tómala del tablero justo ahora">
            <input type="file" accept="image/*" capture="environment" required
                   onChange={(e) => setForm({ ...form, foto: e.target.files?.[0] ?? null })}
                   className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--series-1)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
                   style={{ color: 'var(--text-secondary)' }} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Enviando…' : 'Enviar solicitud'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Detalle / aprobación ---------------- */}
      <Modal abierto={!!detalle} onClose={() => setDetalle(null)} titulo={detalle ? `${detalle.folio} — ${detalle.motivo === 'viaje' ? 'Viaje' : 'Gasolina extra'}` : ''}>
        {detalle && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={COLOR_ESTATUS[detalle.estatus]}>{ESTATUS[detalle.estatus]}</Badge>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fechaCorta(detalle.creado_en?.slice(0, 10))}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Solicitante</div><div>{personaById[detalle.solicitante_id]?.nombre ?? '—'}</div></div>
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Unidad</div><div>{nombreVeh(vehById[detalle.vehiculo_id])}</div></div>
              {detalle.motivo === 'viaje' ? (
                <>
                  <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Ruta</div>
                    <div>{ciudadById[detalle.ciudad_origen_id]?.nombre} → {ciudadById[detalle.ciudad_destino_id]?.nombre}{detalle.km_calculado ? ` (${detalle.km_calculado} km${detalle.ida_y_vuelta ? ', redondo' : ', solo ida'})` : ''}</div></div>
                  <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Fechas</div>
                    <div>{fechaCorta(detalle.fecha_inicio)} a {detalle.fecha_regreso ? fechaCorta(detalle.fecha_regreso) : '—'}</div></div>
                </>
              ) : null}
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Kilometraje reportado</div><div>{detalle.kilometraje}</div></div>
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Litros solicitados</div>
                <div>{detalle.litros_solicitados ?? '—'}{detalle.monto_estimado ? ` (≈ ${money(detalle.monto_estimado)})` : ''}</div></div>
            </div>
            {detalle.notas && (
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{detalle.motivo === 'viaje' ? 'Notas' : 'Justificación'}</div>
                <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>{detalle.notas}</div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>Foto del kilometraje</div>
              <div className="w-40"><FotoFirmada path={detalle.foto_km_path} alt="Kilometraje" className="block aspect-square w-full" /></div>
            </div>
            {detalle.estatus === 'rechazada' && detalle.motivo_rechazo && (
              <Aviso tono="critical"><strong>Motivo de rechazo:</strong> {detalle.motivo_rechazo}</Aviso>
            )}

            {esFlotaAdmin && detalle.motivo === 'viaje' && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Cuadre de la solicitud</div>
                {!cuadre.kmEsperado ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No se puede calcular — falta la distancia entre estas ciudades.</p>
                ) : !cuadre.rendimiento ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Distancia esperada: {Math.round(cuadre.kmEsperado)} km ({detalle.km_calculado} km de ruta + {KM_POR_DIA}×{cuadre.dias} días de margen).
                    Falta el rendimiento (km/l) de la unidad para estimar litros — se define en "Editar unidad".
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
                  <Textarea rows={2} value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} />
                </Campo>
                <div className="flex justify-end gap-2">
                  <Boton variant="danger" onClick={() => resolver('rechazada')}>Rechazar</Boton>
                  <Boton onClick={() => resolver('aprobada')}>Aprobar</Boton>
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
