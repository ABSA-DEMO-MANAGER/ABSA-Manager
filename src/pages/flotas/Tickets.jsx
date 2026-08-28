import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { fechaCorta, hoyISO } from '../../lib/format';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input, Textarea,
} from '../../components/ui';

const CATEGORIAS = {
  mantenimiento: 'Mantenimiento', cambio_pieza: 'Cambio de pieza', compra_pieza: 'Compra de pieza',
  reparacion: 'Reparación', siniestro: 'Siniestro / multa', otro: 'Otro',
};
const ESTATUS = { abierto: 'Abierto', en_proceso: 'En proceso', rechazado: 'Rechazado', completado: 'Completado' };
const COLOR_ESTATUS = {
  abierto: 'var(--series-1)', en_proceso: 'var(--serious)', rechazado: 'var(--critical)', completado: 'var(--good)',
};

const FORM_VACIO = { vehiculo_id: '', categoria: 'mantenimiento', descripcion: '' };

export default function Tickets() {
  const { flotaPerfil, esFlotaAdmin } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [fEstatus, setFEstatus] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detalle, setDetalle] = useState(null);
  const [estatusEdit, setEstatusEdit] = useState('');
  const [motivoEdit, setMotivoEdit] = useState('');

  async function cargar() {
    const [t, v, p] = await Promise.all([
      supabase.from('flota_tickets')
        .select('id, folio, vehiculo_id, categoria, descripcion, estatus, motivo_rechazo, solicitado_por, creado_en')
        .order('creado_en', { ascending: false }),
      supabase.from('flota_vehiculos').select('id, codigo, marca, modelo, placas').order('codigo'),
      supabase.from('perfiles').select('id, nombre'),
    ]);
    const err = t.error || v.error || p.error;
    if (err) { setError(err.message); return; }
    setD({ tickets: t.data, vehiculos: v.data, perfiles: p.data });
  }
  useEffect(() => { cargar(); }, []);

  const vehById = useMemo(() => Object.fromEntries((d?.vehiculos ?? []).map((v) => [v.id, v])), [d]);
  const perfilById = useMemo(() => Object.fromEntries((d?.perfiles ?? []).map((p) => [p.id, p])), [d]);
  const nombreVeh = (v) => v ? [v.codigo, [v.marca, v.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' — ') : '—';

  const filtrados = useMemo(() => {
    if (!d) return [];
    return d.tickets.filter((t) => !fEstatus || t.estatus === fEstatus);
  }, [d, fEstatus]);

  function abrirNuevo() {
    setForm({ ...FORM_VACIO, vehiculo_id: flotaPerfil?.vehiculo_asignado_id ? String(flotaPerfil.vehiculo_asignado_id) : '' });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.vehiculo_id) return setFormError('Selecciona la unidad.');
    if (!form.descripcion.trim()) return setFormError('Describe qué necesitas o qué pasó.');

    setGuardando(true);
    const { error: err } = await supabase.from('flota_tickets').insert({
      vehiculo_id: Number(form.vehiculo_id),
      categoria: form.categoria,
      descripcion: form.descripcion.trim(),
      solicitado_por: flotaPerfil.perfil_id,
    });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  function abrirDetalle(t) {
    setDetalle(t);
    setEstatusEdit(t.estatus);
    setMotivoEdit(t.motivo_rechazo ?? '');
  }

  async function guardarEstatus() {
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

  if (error) return <Aviso tono="critical">No se pudieron cargar los tickets: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {esFlotaAdmin ? `${filtrados.length} de ${d.tickets.length} solicitudes` : 'Tus solicitudes sobre unidades de flota'}
          </p>
        </div>
        <Boton onClick={abrirNuevo}>+ Nuevo ticket</Boton>
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
          vacio={esFlotaAdmin ? 'Sin tickets todavía.' : 'Aún no has abierto tickets.'}
          columnas={[
            { key: 'folio', header: 'Folio', nowrap: true, render: (t) => <span className="tnum">{t.folio}</span> },
            { key: 'vehiculo_id', header: 'Unidad', render: (t) => nombreVeh(vehById[t.vehiculo_id]) },
            ...(esFlotaAdmin ? [{ key: 'solicitado_por', header: 'Solicitante', render: (t) => perfilById[t.solicitado_por]?.nombre ?? '—' }] : []),
            { key: 'categoria', header: 'Categoría', nowrap: true, render: (t) => CATEGORIAS[t.categoria] },
            { key: 'creado_en', header: 'Fecha', nowrap: true, render: (t) => fechaCorta(t.creado_en?.slice(0, 10)) },
            { key: 'estatus', header: 'Estatus', nowrap: true,
              render: (t) => <Badge color={COLOR_ESTATUS[t.estatus]}>{ESTATUS[t.estatus]}</Badge> },
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
          <Campo label="Descripción" required hint="Describe qué necesitas o qué pasó">
            <Textarea rows={4} value={form.descripcion} required
                      onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Campo>
          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Enviando…' : 'Enviar solicitud'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Detalle / gestión ---------------- */}
      <Modal abierto={!!detalle} onClose={() => setDetalle(null)} titulo={detalle ? `${detalle.folio} — ${CATEGORIAS[detalle.categoria]}` : ''}>
        {detalle && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge color={COLOR_ESTATUS[detalle.estatus]}>{ESTATUS[detalle.estatus]}</Badge>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fechaCorta(detalle.creado_en?.slice(0, 10))}</span>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Unidad</div>
              <div className="text-sm font-medium">{nombreVeh(vehById[detalle.vehiculo_id])}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Solicitante</div>
              <div className="text-sm">{perfilById[detalle.solicitado_por]?.nombre ?? '—'}</div>
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
                    {Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
              {esFlotaAdmin && <Boton onClick={guardarEstatus}>Guardar cambios</Boton>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
