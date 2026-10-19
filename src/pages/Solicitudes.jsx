import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { subirArchivo } from '../lib/storage';
import { fechaCorta, ESTATUS_SOLICITUD, PRIORIDAD_SOLICITUD } from '../lib/format';
import FotoFirmada from '../components/FotoFirmada';
import ChecklistFotos, { fotosVaciasUnidad, cuentaFotosUnidad } from '../components/ChecklistFotos';
import { Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input, Textarea } from '../components/ui';

const ESTATUS_REVISION = ['nueva', 'en_revision', 'informacion_requerida', 'aceptada', 'rechazada', 'duplicada'];

const FORM_VACIO = {
  sucursal_id: '', categoria_id: '', activo_id: '', ubicacion: '',
  descripcion: '', impacto: '', personas_afectadas: '', riesgo: false,
  prioridad_sugerida: 'P3',
};

export default function Solicitudes() {
  const { perfil, esAdmin, puedeGestionar } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [fEstatus, setFEstatus] = useState('');
  const [fSucursal, setFSucursal] = useState('');

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [fotos, setFotos] = useState(fotosVaciasUnidad());
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detalle, setDetalle] = useState(null);
  const [detalleFotos, setDetalleFotos] = useState([]);
  const [revision, setRevision] = useState({ estatus: '', categoria_id: '', prioridad_confirmada: '', motivo: '' });
  const [revisando, setRevisando] = useState(false);
  const [revisionError, setRevisionError] = useState(null);

  const [encuestaForm, setEncuestaForm] = useState({ calificacion: 5, comentario: '' });
  const [enviandoEncuesta, setEnviandoEncuesta] = useState(false);
  const [encuestaError, setEncuestaError] = useState(null);

  async function cargar() {
    const [s, suc, cat, act, per, ord, enc] = await Promise.all([
      supabase.from('solicitudes')
        .select('id, folio, sucursal_id, categoria_id, activo_id, ubicacion, descripcion, impacto, personas_afectadas, riesgo, prioridad_sugerida, prioridad_confirmada, estatus, motivo_rechazo, orden_id, solicitado_por, revisado_por, revisado_en, creado_en')
        .order('creado_en', { ascending: false }),
      supabase.from('sucursales').select('id, codigo, nombre, activa').order('codigo'),
      supabase.from('categorias').select('id, nombre').order('orden'),
      supabase.from('activos').select('id, sucursal_id, nombre, codigo').order('nombre'),
      supabase.from('perfiles').select('id, nombre'),
      supabase.from('ordenes').select('id, folio, estatus'),
      supabase.from('encuestas').select('id, orden_id, calificacion, comentario'),
    ]);
    const err = s.error || suc.error || cat.error || act.error || per.error || ord.error || enc.error;
    if (err) { setError(err.message); return; }
    setD({
      solicitudes: s.data, sucursales: suc.data, categorias: cat.data, activos: act.data, personas: per.data,
      ordenes: ord.data, encuestas: enc.data,
    });
  }
  useEffect(() => { cargar(); }, []);

  const sucById = useMemo(() => Object.fromEntries((d?.sucursales ?? []).map((s) => [s.id, s])), [d]);
  const catById = useMemo(() => Object.fromEntries((d?.categorias ?? []).map((c) => [c.id, c])), [d]);
  const activoById = useMemo(() => Object.fromEntries((d?.activos ?? []).map((a) => [a.id, a])), [d]);
  const personaById = useMemo(() => Object.fromEntries((d?.personas ?? []).map((p) => [p.id, p])), [d]);
  const ordenById = useMemo(() => Object.fromEntries((d?.ordenes ?? []).map((o) => [o.id, o])), [d]);
  const encuestaByOrden = useMemo(() => Object.fromEntries((d?.encuestas ?? []).map((e) => [e.orden_id, e])), [d]);

  const filtradas = useMemo(() => {
    if (!d) return [];
    return d.solicitudes.filter((s) =>
      (!fEstatus || s.estatus === fEstatus) &&
      (!fSucursal || String(s.sucursal_id) === fSucursal));
  }, [d, fEstatus, fSucursal]);

  const miSucursalId = perfil?.sucursal_id ? String(perfil.sucursal_id) : '';
  const activosDeSucursal = useMemo(
    () => (d?.activos ?? []).filter((a) => String(a.sucursal_id) === String(form.sucursal_id)),
    [d, form.sucursal_id],
  );

  function abrirNueva() {
    setForm({ ...FORM_VACIO, sucursal_id: miSucursalId });
    setFotos(fotosVaciasUnidad());
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.sucursal_id) return setFormError('Selecciona la sucursal.');
    if (!form.descripcion.trim()) return setFormError('Describe la necesidad.');
    setGuardando(true);
    try {
      const { data: nueva, error: err } = await supabase.from('solicitudes').insert({
        sucursal_id: Number(form.sucursal_id),
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        activo_id: form.activo_id ? Number(form.activo_id) : null,
        ubicacion: form.ubicacion.trim() || null,
        descripcion: form.descripcion.trim(),
        impacto: form.impacto.trim() || null,
        personas_afectadas: form.personas_afectadas.trim() || null,
        riesgo: form.riesgo,
        prioridad_sugerida: form.prioridad_sugerida,
        solicitado_por: perfil.id,
      }).select('id').maybeSingle();
      if (err) throw err;

      for (const file of fotos) {
        const ruta = await subirArchivo(file, `solicitudes/${nueva.id}`);
        await supabase.from('solicitudes_fotos').insert({ solicitud_id: nueva.id, archivo_path: ruta });
      }

      setModal(false); cargar();
    } catch (err) {
      setFormError(err.message || 'No se pudo enviar la solicitud.');
    } finally {
      setGuardando(false);
    }
  }

  async function abrirDetalle(s) {
    setDetalle(s);
    setRevision({
      estatus: s.estatus, categoria_id: s.categoria_id ? String(s.categoria_id) : '',
      prioridad_confirmada: s.prioridad_confirmada ?? s.prioridad_sugerida ?? 'P3', motivo: s.motivo_rechazo ?? '',
    });
    setRevisionError(null);
    setEncuestaForm({ calificacion: 5, comentario: '' });
    setEncuestaError(null);
    const { data } = await supabase.from('solicitudes_fotos').select('id, archivo_path').eq('solicitud_id', s.id);
    setDetalleFotos(data ?? []);
  }

  async function enviarEncuesta() {
    setEncuestaError(null);
    setEnviandoEncuesta(true);
    const { error: err } = await supabase.from('encuestas').insert({
      orden_id: detalle.orden_id,
      calificacion: Number(encuestaForm.calificacion),
      comentario: encuestaForm.comentario.trim() || null,
      creado_por: perfil.id,
    });
    setEnviandoEncuesta(false);
    if (err) { setEncuestaError(err.message); return; }
    cargar();
  }

  async function guardarRevision() {
    setRevisionError(null);
    if (['rechazada', 'duplicada'].includes(revision.estatus) && !revision.motivo.trim()) {
      return setRevisionError(revision.estatus === 'rechazada' ? 'Escribe el motivo de rechazo.' : 'Explica de cuál solicitud es duplicada.');
    }
    setRevisando(true);
    const { error: err } = await supabase.from('solicitudes').update({
      estatus: revision.estatus,
      categoria_id: revision.categoria_id ? Number(revision.categoria_id) : null,
      prioridad_confirmada: revision.prioridad_confirmada,
      motivo_rechazo: ['rechazada', 'duplicada'].includes(revision.estatus) ? revision.motivo.trim() : null,
      revisado_por: perfil.id, revisado_en: new Date().toISOString(),
    }).eq('id', detalle.id);
    setRevisando(false);
    if (err) { setRevisionError(err.message); return; }
    setDetalle(null); cargar();
  }

  async function convertirEnOrden() {
    if (!confirm(`¿Convertir ${detalle.folio} en una orden de trabajo?`)) return;
    setRevisando(true);
    setRevisionError(null);
    try {
      // criticidad A/B/C es un campo mas viejo que prioridad P1-P4 (llego
      // despues, paso 3 del rediseno) -- se siguen llenando los dos: la
      // lista de ordenes ya usa criticidad para su badge de color.
      const criticidad = { P1: 'A', P2: 'B', P3: 'B', P4: 'C' }[revision.prioridad_confirmada] ?? 'B';
      const { data: orden, error: errO } = await supabase.from('ordenes').insert({
        sucursal_id: detalle.sucursal_id, activo_id: detalle.activo_id,
        categoria_id: revision.categoria_id ? Number(revision.categoria_id) : null,
        titulo: detalle.descripcion.slice(0, 80),
        descripcion: detalle.descripcion, tipo: 'correctivo', criticidad,
        prioridad: revision.prioridad_confirmada, estatus: 'programada',
        creado_por: perfil.id, responsable_id: perfil.id,
      }).select('id, folio').maybeSingle();
      if (errO) throw errO;

      const { error: errS } = await supabase.from('solicitudes')
        .update({ estatus: 'convertida', orden_id: orden.id }).eq('id', detalle.id);
      if (errS) throw errS;

      setDetalle(null); cargar();
    } catch (err) {
      setRevisionError(err.message || 'No se pudo crear la orden.');
    } finally {
      setRevisando(false);
    }
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar las solicitudes: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Solicitudes</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Reporta una necesidad de tu sucursal y dale seguimiento aquí.
          </p>
        </div>
        <Boton onClick={abrirNueva}>+ Nueva solicitud</Boton>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={fEstatus} onChange={(e) => setFEstatus(e.target.value)} className="!w-auto">
          <option value="">Todos los estatus</option>
          {Object.entries(ESTATUS_SOLICITUD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        {puedeGestionar && (
          <Select value={fSucursal} onChange={(e) => setFSucursal(e.target.value)} className="!w-auto">
            <option value="">Todas las sucursales</option>
            {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        )}
      </div>

      <Card>
        <Tabla
          onRowClick={abrirDetalle}
          vacio="Aún no hay solicitudes."
          columnas={[
            { key: 'folio', header: 'Folio', nowrap: true, render: (s) => <span className="tnum">{s.folio}</span> },
            { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (s) => sucById[s.sucursal_id]?.nombre ?? '—' },
            { key: 'descripcion', header: 'Descripción', render: (s) => (
                <div className="max-w-md truncate">{s.descripcion}</div>) },
            { key: 'prioridad', header: 'Prioridad', nowrap: true, render: (s) => {
                const p = s.prioridad_confirmada ?? s.prioridad_sugerida;
                return p ? <Badge color={PRIORIDAD_SOLICITUD[p]?.color}>{p}</Badge> : '—';
              } },
            { key: 'creado_en', header: 'Fecha', nowrap: true, render: (s) => fechaCorta(s.creado_en?.slice(0, 10)) },
            { key: 'estatus', header: 'Estatus', nowrap: true, render: (s) => (
                <Badge color={ESTATUS_SOLICITUD[s.estatus]?.color}>{ESTATUS_SOLICITUD[s.estatus]?.label}</Badge>) },
          ]}
          filas={filtradas}
        />
      </Card>

      {/* ---------------- Nueva solicitud ---------------- */}
      <Modal abierto={modal} onClose={() => !guardando && setModal(false)} titulo="Nueva solicitud">
        <form onSubmit={guardar} className="space-y-3">
          {esAdmin ? (
            <Campo label="Sucursal" required>
              <Select value={form.sucursal_id} required onChange={(e) => setForm({ ...form, sucursal_id: e.target.value, activo_id: '' })}>
                <option value="">Selecciona…</option>
                {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </Select>
            </Campo>
          ) : (
            <Campo label="Sucursal" hint={miSucursalId ? undefined : 'No tienes una sucursal asignada — pídele a un administrador que te la asigne en Usuarios.'}>
              <Input value={sucById[Number(miSucursalId)]?.nombre ?? ''} disabled />
            </Campo>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Categoría" hint="Opcional">
              <Select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">Sin categoría</option>
                {d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </Campo>
            <Campo label="Activo relacionado" hint="Opcional, si se conoce">
              <Select value={form.activo_id} disabled={!form.sucursal_id} onChange={(e) => setForm({ ...form, activo_id: e.target.value })}>
                <option value="">Sin especificar</option>
                {activosDeSucursal.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </Select>
            </Campo>
          </div>
          <Campo label="Ubicación específica" hint="Opcional — ej. baño planta alta">
            <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
          </Campo>
          <Campo label="Descripción de la necesidad" required>
            <Textarea rows={3} value={form.descripcion} required onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Campo>
          <Campo label="Operación afectada" hint="Opcional">
            <Input value={form.impacto} onChange={(e) => setForm({ ...form, impacto: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Personas afectadas" hint="Opcional">
              <Input value={form.personas_afectadas} onChange={(e) => setForm({ ...form, personas_afectadas: e.target.value })} />
            </Campo>
            <Campo label="Prioridad sugerida">
              <Select value={form.prioridad_sugerida} onChange={(e) => setForm({ ...form, prioridad_sugerida: e.target.value })}>
                {Object.entries(PRIORIDAD_SOLICITUD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.riesgo} onChange={(e) => setForm({ ...form, riesgo: e.target.checked })} />
            Representa un riesgo para personas o instalaciones
          </label>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Fotos — opcional</div>
            <ChecklistFotos valor={fotos} onChange={setFotos} />
          </div>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" disabled={guardando} onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Enviando…' : 'Enviar solicitud'}</Boton>
          </div>
        </form>
      </Modal>

      {/* ---------------- Detalle / revisión ---------------- */}
      <Modal abierto={!!detalle} onClose={() => setDetalle(null)} titulo={detalle ? `${detalle.folio}` : ''}>
        {detalle && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={ESTATUS_SOLICITUD[detalle.estatus]?.color}>{ESTATUS_SOLICITUD[detalle.estatus]?.label}</Badge>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fechaCorta(detalle.creado_en?.slice(0, 10))}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Sucursal</div><div>{sucById[detalle.sucursal_id]?.nombre ?? '—'}</div></div>
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Solicitante</div><div>{personaById[detalle.solicitado_por]?.nombre ?? '—'}</div></div>
              {detalle.ubicacion && <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Ubicación</div><div>{detalle.ubicacion}</div></div>}
              {activoById[detalle.activo_id]?.nombre && <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Activo</div><div>{activoById[detalle.activo_id].nombre}</div></div>}
              {detalle.impacto && <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Operación afectada</div><div>{detalle.impacto}</div></div>}
              {detalle.personas_afectadas && <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Personas afectadas</div><div>{detalle.personas_afectadas}</div></div>}
            </div>
            {detalle.riesgo && <Aviso tono="warning">Se reportó como riesgo para personas o instalaciones.</Aviso>}
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Descripción</div>
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>{detalle.descripcion}</div>
            </div>
            {detalleFotos.length > 0 && (
              <div>
                <div className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>Fotos</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {detalleFotos.map((f) => (
                    <div key={f.id} className="aspect-square">
                      <FotoFirmada path={f.archivo_path} alt="" className="block h-full w-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {['rechazada', 'duplicada'].includes(detalle.estatus) && detalle.motivo_rechazo && (
              <Aviso tono="critical">{detalle.motivo_rechazo}</Aviso>
            )}
            {detalle.orden_id && (
              <Aviso tono="good">Convertida en la orden {ordenById[detalle.orden_id]?.folio ?? `#${detalle.orden_id}`}.</Aviso>
            )}

            {detalle.orden_id && ordenById[detalle.orden_id]?.estatus === 'realizada' && (() => {
              const encuesta = encuestaByOrden[detalle.orden_id];
              if (encuesta) {
                return (
                  <div className="space-y-1 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs font-medium" style={{ color: 'var(--series-1)' }}>Calificación del cierre</div>
                    <div>{'★'.repeat(encuesta.calificacion)}{'☆'.repeat(5 - encuesta.calificacion)}</div>
                    {encuesta.comentario && <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{encuesta.comentario}</div>}
                  </div>
                );
              }
              if (detalle.solicitado_por !== perfil.id) return null;
              return (
                <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-xs font-medium" style={{ color: 'var(--series-1)' }}>
                    Tu solicitud fue atendida — califica el cierre
                  </div>
                  <Campo label="Satisfacción">
                    <Select value={encuestaForm.calificacion}
                            onChange={(e) => setEncuestaForm({ ...encuestaForm, calificacion: e.target.value })}>
                      <option value={5}>5 — Muy satisfecho</option>
                      <option value={4}>4 — Satisfecho</option>
                      <option value={3}>3 — Neutral</option>
                      <option value={2}>2 — Insatisfecho</option>
                      <option value={1}>1 — Muy insatisfecho</option>
                    </Select>
                  </Campo>
                  <Campo label="Comentario" hint="Opcional">
                    <Textarea rows={2} value={encuestaForm.comentario}
                              onChange={(e) => setEncuestaForm({ ...encuestaForm, comentario: e.target.value })} />
                  </Campo>
                  {encuestaError && <Aviso tono="critical">{encuestaError}</Aviso>}
                  <div className="flex justify-end">
                    <Boton disabled={enviandoEncuesta} onClick={enviarEncuesta}>
                      {enviandoEncuesta ? 'Enviando…' : 'Enviar calificación'}
                    </Boton>
                  </div>
                </div>
              );
            })()}

            {puedeGestionar && detalle.estatus !== 'convertida' && (
              <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium" style={{ color: 'var(--series-1)' }}>Revisión</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo label="Categoría">
                    <Select value={revision.categoria_id} onChange={(e) => setRevision({ ...revision, categoria_id: e.target.value })}>
                      <option value="">Sin categoría</option>
                      {d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </Select>
                  </Campo>
                  <Campo label="Prioridad confirmada">
                    <Select value={revision.prioridad_confirmada} onChange={(e) => setRevision({ ...revision, prioridad_confirmada: e.target.value })}>
                      {Object.entries(PRIORIDAD_SOLICITUD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                  </Campo>
                </div>
                <Campo label="Estatus">
                  <Select value={revision.estatus} onChange={(e) => setRevision({ ...revision, estatus: e.target.value })}>
                    {ESTATUS_REVISION.map((k) => <option key={k} value={k}>{ESTATUS_SOLICITUD[k].label}</option>)}
                  </Select>
                </Campo>
                {['rechazada', 'duplicada'].includes(revision.estatus) && (
                  <Campo label={revision.estatus === 'rechazada' ? 'Motivo de rechazo' : 'Explicación'} required>
                    <Textarea rows={2} value={revision.motivo} onChange={(e) => setRevision({ ...revision, motivo: e.target.value })} />
                  </Campo>
                )}
                {revisionError && <Aviso tono="critical">{revisionError}</Aviso>}
                <div className="flex flex-wrap justify-end gap-2">
                  <Boton variant="ghost" disabled={revisando} onClick={guardarRevision}>
                    {revisando ? 'Guardando…' : 'Guardar revisión'}
                  </Boton>
                  {detalle.estatus === 'aceptada' && (
                    <Boton disabled={revisando} onClick={convertirEnOrden}>Convertir en orden</Boton>
                  )}
                </div>
              </div>
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
