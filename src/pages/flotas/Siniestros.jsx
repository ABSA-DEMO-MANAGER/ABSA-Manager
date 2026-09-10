import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, fechaCorta } from '../../lib/format';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input, Textarea,
} from '../../components/ui';

const SUBS = {
  Siniestro: ['Colisión', 'Volcadura', 'Robo total', 'Robo parcial', 'Cristales', 'Daño a terceros', 'Otro'],
  Multa: ['Exceso de velocidad', 'Estacionamiento indebido', 'No respetar señal', 'Documentación', 'Foto-infracción', 'Otra'],
};
const ESTATUS = { reportado: 'Reportado', en_proceso: 'En proceso', cerrado: 'Cerrado', rechazado: 'Rechazado' };
const COLOR_ESTATUS = {
  reportado: 'var(--serious)', en_proceso: 'var(--series-1)', cerrado: 'var(--good)', rechazado: 'var(--critical)',
};
const COLOR_GRAV = { Leve: 'var(--good)', Moderado: 'var(--serious)', Grave: 'var(--critical)' };

const FORM_VACIO = { vehiculo_id: '', tipo: 'Siniestro', clasificacion: SUBS.Siniestro[0], gravedad: 'Leve', fecha: new Date().toISOString().slice(0, 10), ubicacion: '', monto: '', descripcion: '' };
const GESTION_VACIA = { aseguradora: '', poliza: '', costo_reparacion: '0', cubierto_seguro: '0', deducible: '0', absorbido_empresa: '0', estatus: 'reportado', motivo_rechazo: '', registrar_gasto: false };

export default function Siniestros() {
  const { flotaPerfil, esFlotaAdmin } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [fEstatus, setFEstatus] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detalle, setDetalle] = useState(null);
  const [gestion, setGestion] = useState(GESTION_VACIA);

  async function cargar() {
    const [s, v, p] = await Promise.all([
      supabase.from('flota_siniestros')
        .select('id, folio, vehiculo_id, tipo, clasificacion, gravedad, fecha, ubicacion, conductor, descripcion, monto, estatus, motivo_rechazo, aseguradora, poliza, costo_reparacion, cubierto_seguro, deducible, absorbido_empresa, gasto_registrado, reportado_por, creado_en')
        .order('creado_en', { ascending: false }),
      supabase.from('flota_vehiculos').select('id, codigo, marca, modelo, placas, conductor_nombre').order('codigo'),
      supabase.from('perfiles').select('id, nombre'),
    ]);
    const err = s.error || v.error || p.error;
    if (err) { setError(err.message); return; }
    setD({ siniestros: s.data, vehiculos: v.data, perfiles: p.data });
  }
  useEffect(() => { cargar(); }, []);

  const vehById = useMemo(() => Object.fromEntries((d?.vehiculos ?? []).map((v) => [v.id, v])), [d]);
  const perfilById = useMemo(() => Object.fromEntries((d?.perfiles ?? []).map((p) => [p.id, p])), [d]);
  const nombreVeh = (v) => v ? [v.codigo, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '—';

  const filtrados = useMemo(() => {
    if (!d) return [];
    return d.siniestros.filter((s) => !fEstatus || s.estatus === fEstatus);
  }, [d, fEstatus]);

  function abrirNuevo() {
    const vehiculo_id = !esFlotaAdmin && flotaPerfil?.vehiculo_asignado_id ? String(flotaPerfil.vehiculo_asignado_id) : '';
    setForm({ ...FORM_VACIO, vehiculo_id });
    setFormError(null); setModal(true);
  }

  function cambiarTipo(tipo) {
    setForm({ ...form, tipo, clasificacion: SUBS[tipo][0] });
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.vehiculo_id) return setFormError('Selecciona la unidad.');
    if (!form.descripcion.trim()) return setFormError('Escribe una descripción de qué pasó.');

    setGuardando(true);
    const veh = vehById[form.vehiculo_id];
    const { error: err } = await supabase.from('flota_siniestros').insert({
      vehiculo_id: Number(form.vehiculo_id),
      tipo: form.tipo,
      clasificacion: form.clasificacion,
      gravedad: form.tipo === 'Siniestro' ? form.gravedad : null,
      fecha: form.fecha,
      ubicacion: form.ubicacion.trim() || null,
      conductor: veh?.conductor_nombre || null,
      descripcion: form.descripcion.trim(),
      monto: form.tipo === 'Multa' ? Number(form.monto) || 0 : 0,
      reportado_por: flotaPerfil.perfil_id,
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  function abrirDetalle(s) {
    setDetalle(s);
    setGestion({
      aseguradora: s.aseguradora ?? '', poliza: s.poliza ?? '',
      costo_reparacion: String(s.costo_reparacion ?? 0), cubierto_seguro: String(s.cubierto_seguro ?? 0),
      deducible: String(s.deducible ?? 0), absorbido_empresa: String(s.absorbido_empresa ?? 0),
      estatus: s.estatus, motivo_rechazo: s.motivo_rechazo ?? '', registrar_gasto: false,
    });
  }

  async function guardarGestion() {
    if (gestion.estatus === 'rechazado' && !gestion.motivo_rechazo.trim()) {
      alert('Escribe el motivo de rechazo.');
      return;
    }
    const patch = {
      aseguradora: gestion.aseguradora.trim() || null, poliza: gestion.poliza.trim() || null,
      costo_reparacion: Number(gestion.costo_reparacion) || 0, cubierto_seguro: Number(gestion.cubierto_seguro) || 0,
      deducible: Number(gestion.deducible) || 0, absorbido_empresa: Number(gestion.absorbido_empresa) || 0,
      estatus: gestion.estatus, motivo_rechazo: gestion.estatus === 'rechazado' ? gestion.motivo_rechazo.trim() : null,
    };
    const { error: err } = await supabase.from('flota_siniestros').update(patch).eq('id', detalle.id);
    if (err) { alert(err.message); return; }

    if (gestion.registrar_gasto && !detalle.gasto_registrado) {
      const monto = detalle.tipo === 'Multa' ? Number(detalle.monto) || 0 : (patch.absorbido_empresa || patch.deducible || 0);
      if (monto > 0) {
        const fecha = detalle.fecha || new Date().toISOString().slice(0, 10);
        const { error: errG } = await supabase.from('flota_gastos').insert({
          vehiculo_id: detalle.vehiculo_id, categoria: detalle.tipo === 'Multa' ? 'Multa' : 'Siniestro',
          monto, fecha, mes: fecha.slice(0, 7),
          descripcion: `${detalle.tipo === 'Multa' ? 'Multa' : 'Siniestro'}: ${detalle.clasificacion || ''} · ${detalle.folio}`,
          estatus: 'aprobado', origen: 'manual', registrado_por: flotaPerfil.perfil_id,
        });
        if (!errG) await supabase.from('flota_siniestros').update({ gasto_registrado: true }).eq('id', detalle.id);
      }
    }
    setDetalle(null); cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los siniestros: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Siniestros</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {esFlotaAdmin ? `${filtrados.length} de ${d.siniestros.length} reportes` : 'Siniestros y multas que has reportado'}
          </p>
        </div>
        <Boton onClick={abrirNuevo}>+ Reportar siniestro / multa</Boton>
      </div>

      {esFlotaAdmin && (
        <div className="flex flex-wrap gap-2">
          <Select value={fEstatus} onChange={(e) => setFEstatus(e.target.value)} className="!w-auto">
            <option value="">Todos los estatus</option>
            {Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      )}

      <Card>
        <Tabla
          onRowClick={abrirDetalle}
          vacio={esFlotaAdmin ? 'Sin siniestros registrados.' : 'Aún no has reportado nada — mejor así.'}
          columnas={[
            { key: 'folio', header: 'Folio', nowrap: true, render: (s) => <span className="tnum">{s.folio}</span> },
            { key: 'vehiculo_id', header: 'Unidad', render: (s) => nombreVeh(vehById[s.vehiculo_id]) },
            { key: 'tipo', header: 'Tipo', nowrap: true, render: (s) => (
                <span>{s.tipo}{s.clasificacion ? <span style={{ color: 'var(--text-muted)' }}> · {s.clasificacion}</span> : ''}</span>
              ) },
            { key: 'fecha', header: 'Fecha', nowrap: true, render: (s) => fechaCorta(s.fecha) },
            { key: 'monto', header: 'Monto/Deducible', align: 'right', render: (s) => money(s.tipo === 'Multa' ? s.monto : s.deducible) },
            { key: 'estatus', header: 'Estatus', nowrap: true,
              render: (s) => <Badge color={COLOR_ESTATUS[s.estatus]}>{ESTATUS[s.estatus]}</Badge> },
          ]}
          filas={filtrados}
        />
      </Card>

      {/* ---------------- Reportar ---------------- */}
      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Reportar siniestro / multa">
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Unidad" required>
            {esFlotaAdmin ? (
              <Select value={form.vehiculo_id} required onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}>
                <option value="">Selecciona…</option>
                {d.vehiculos.map((v) => <option key={v.id} value={v.id}>{nombreVeh(v)}{v.placas ? ` · ${v.placas}` : ''}</option>)}
              </Select>
            ) : (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--plane)' }}>
                {vehById[form.vehiculo_id] ? nombreVeh(vehById[form.vehiculo_id]) : 'No tienes una unidad asignada — pide a un administrador que te asigne una.'}
              </div>
            )}
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Tipo">
              <Select value={form.tipo} onChange={(e) => cambiarTipo(e.target.value)}>
                <option>Siniestro</option>
                <option>Multa</option>
              </Select>
            </Campo>
            <Campo label="Clasificación">
              <Select value={form.clasificacion} onChange={(e) => setForm({ ...form, clasificacion: e.target.value })}>
                {SUBS[form.tipo].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Campo>
            <Campo label="Fecha">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Campo>
            {form.tipo === 'Siniestro' ? (
              <Campo label="Gravedad">
                <Select value={form.gravedad} onChange={(e) => setForm({ ...form, gravedad: e.target.value })}>
                  <option>Leve</option><option>Moderado</option><option>Grave</option>
                </Select>
              </Campo>
            ) : (
              <Campo label="Importe de la multa (MXN)">
                <Input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
              </Campo>
            )}
            <Campo label="Ubicación">
              <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Descripción" required hint="¿Qué pasó?">
            <Textarea rows={3} value={form.descripcion} required onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Campo>
          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Enviando…' : 'Reportar'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Detalle / gestión ---------------- */}
      <Modal abierto={!!detalle} onClose={() => setDetalle(null)} titulo={detalle ? `${detalle.tipo} · ${detalle.folio}` : ''} ancho="max-w-xl">
        {detalle && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={COLOR_ESTATUS[detalle.estatus]}>{ESTATUS[detalle.estatus]}</Badge>
              {detalle.gravedad && <Badge color={COLOR_GRAV[detalle.gravedad]}>{detalle.gravedad}</Badge>}
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fechaCorta(detalle.fecha)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Info label="Unidad" valor={nombreVeh(vehById[detalle.vehiculo_id])} />
              <Info label="Clasificación" valor={detalle.clasificacion} />
              <Info label="Ubicación" valor={detalle.ubicacion} />
              <Info label="Conductor" valor={detalle.conductor} />
              <Info label="Reportó" valor={perfilById[detalle.reportado_por]?.nombre} />
              {detalle.tipo === 'Multa' && detalle.monto > 0 && <Info label="Importe de la multa" valor={money(detalle.monto)} />}
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Descripción</div>
              <div className="mt-1 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>{detalle.descripcion}</div>
            </div>
            {detalle.estatus === 'rechazado' && detalle.motivo_rechazo && (
              <Aviso tono="critical"><strong>Motivo de rechazo:</strong> {detalle.motivo_rechazo}</Aviso>
            )}

            {esFlotaAdmin && (
              <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium" style={{ color: 'var(--series-1)' }}>Gestión</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo label="Aseguradora">
                    <Input value={gestion.aseguradora} onChange={(e) => setGestion({ ...gestion, aseguradora: e.target.value })} />
                  </Campo>
                  <Campo label="Póliza / reporte">
                    <Input value={gestion.poliza} onChange={(e) => setGestion({ ...gestion, poliza: e.target.value })} />
                  </Campo>
                  <Campo label="Costo reparación">
                    <Input type="number" min="0" step="0.01" value={gestion.costo_reparacion} onChange={(e) => setGestion({ ...gestion, costo_reparacion: e.target.value })} />
                  </Campo>
                  <Campo label="Cubierto por seguro">
                    <Input type="number" min="0" step="0.01" value={gestion.cubierto_seguro} onChange={(e) => setGestion({ ...gestion, cubierto_seguro: e.target.value })} />
                  </Campo>
                  <Campo label="Deducible">
                    <Input type="number" min="0" step="0.01" value={gestion.deducible} onChange={(e) => setGestion({ ...gestion, deducible: e.target.value })} />
                  </Campo>
                  <Campo label="Absorbido por empresa">
                    <Input type="number" min="0" step="0.01" value={gestion.absorbido_empresa} onChange={(e) => setGestion({ ...gestion, absorbido_empresa: e.target.value })} />
                  </Campo>
                </div>
                <Campo label="Estatus">
                  <Select value={gestion.estatus} onChange={(e) => setGestion({ ...gestion, estatus: e.target.value })}>
                    {Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Campo>
                {gestion.estatus === 'rechazado' && (
                  <Campo label="Motivo de rechazo" required>
                    <Textarea rows={2} value={gestion.motivo_rechazo} onChange={(e) => setGestion({ ...gestion, motivo_rechazo: e.target.value })} />
                  </Campo>
                )}
                {detalle.gasto_registrado ? (
                  <p className="text-xs" style={{ color: 'var(--good)' }}>✓ El costo ya se registró en Costos.</p>
                ) : (
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={gestion.registrar_gasto} onChange={(e) => setGestion({ ...gestion, registrar_gasto: e.target.checked })} />
                    Registrar el costo en Costos ({detalle.tipo === 'Multa' ? 'Multa' : 'Siniestro'}) para el resumen
                  </label>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Boton>
              {esFlotaAdmin && <Boton onClick={guardarGestion}>Guardar cambios</Boton>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, valor }) {
  if (!valor) return null;
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}
