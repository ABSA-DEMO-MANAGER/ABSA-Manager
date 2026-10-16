import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fechaCorta, hoyISO, money, ESTATUS_SOLICITUD, PRIORIDAD_SOLICITUD } from '../lib/format';
import { Card, Tabla, Boton, Campo, Input, Select, Textarea, Modal, Cargando, Aviso, Badge } from '../components/ui';

const TIPOS_DELEGACION = { gastos: 'Gastos', cotizaciones: 'Cotizaciones', solicitudes: 'Solicitudes', todas: 'Todas' };

const DELEGACION_VACIA = { persona_id: '', tipo_operacion: 'gastos', monto_maximo: '', vigente_desde: hoyISO(), vigente_hasta: '', notas: '' };

export default function Aprobaciones() {
  const { perfil, esAdmin } = useAuth();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [detalle, setDetalle] = useState(null);
  const [comentario, setComentario] = useState('');
  const [resolviendo, setResolviendo] = useState(false);
  const [resolverError, setResolverError] = useState(null);

  const [modalDeleg, setModalDeleg] = useState(false);
  const [formDeleg, setFormDeleg] = useState(DELEGACION_VACIA);
  const [guardandoDeleg, setGuardandoDeleg] = useState(false);
  const [delegError, setDelegError] = useState(null);

  async function cargar() {
    const [sol, gas, suc, prov, per, deleg] = await Promise.all([
      supabase.from('solicitudes')
        .select('id, folio, sucursal_id, descripcion, prioridad_sugerida, prioridad_confirmada, estatus, creado_en')
        .in('estatus', ['nueva', 'en_revision', 'informacion_requerida'])
        .order('creado_en', { ascending: false }),
      supabase.from('gastos')
        .select('id, fecha, sucursal_id, concepto, monto, orden_id, proveedor_id, estatus_pago, creado_por')
        .eq('estatus_pago', 'a_enviar').order('fecha', { ascending: false }),
      supabase.from('sucursales').select('id, codigo, nombre'),
      supabase.from('proveedores').select('id, nombre'),
      supabase.from('perfiles').select('id, nombre'),
      esAdmin
        ? supabase.from('delegaciones').select('id, persona_id, tipo_operacion, monto_maximo, vigente_desde, vigente_hasta, notas').order('creado_en', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    const err = sol.error || gas.error || suc.error || prov.error || per.error;
    if (err) { setError(err.message); return; }
    setD({ solicitudes: sol.data, gastos: gas.data, sucursales: suc.data, proveedores: prov.data, personas: per.data, delegaciones: deleg.data ?? [] });
  }
  useEffect(() => { cargar(); }, [esAdmin]);

  const sucById = useMemo(() => Object.fromEntries((d?.sucursales ?? []).map((s) => [s.id, s])), [d]);
  const provById = useMemo(() => Object.fromEntries((d?.proveedores ?? []).map((p) => [p.id, p])), [d]);
  const personaById = useMemo(() => Object.fromEntries((d?.personas ?? []).map((p) => [p.id, p])), [d]);

  async function resolverGasto(decision) {
    setResolverError(null);
    if (decision === 'rechazado' && !comentario.trim()) return setResolverError('Escribe el motivo de rechazo.');
    setResolviendo(true);
    const { error: err } = await supabase.from('gastos').update({
      estatus_pago: decision,
      autorizado_por: perfil.id, autorizado_en: new Date().toISOString(),
      comentario_autorizacion: comentario.trim() || null,
    }).eq('id', detalle.id);
    setResolviendo(false);
    if (err) { setResolverError(err.message); return; }
    setDetalle(null); setComentario(''); cargar();
  }

  function abrirNuevaDelegacion() {
    setFormDeleg(DELEGACION_VACIA); setDelegError(null); setModalDeleg(true);
  }

  async function guardarDelegacion(e) {
    e.preventDefault();
    setDelegError(null);
    if (!formDeleg.persona_id) return setDelegError('Selecciona a la persona.');
    setGuardandoDeleg(true);
    const { error: err } = await supabase.from('delegaciones').insert({
      persona_id: formDeleg.persona_id,
      tipo_operacion: formDeleg.tipo_operacion,
      monto_maximo: formDeleg.monto_maximo === '' ? null : Number(formDeleg.monto_maximo),
      vigente_desde: formDeleg.vigente_desde || hoyISO(),
      vigente_hasta: formDeleg.vigente_hasta || null,
      notas: formDeleg.notas.trim() || null,
      creado_por: perfil.id,
    });
    setGuardandoDeleg(false);
    if (err) { setDelegError(err.message); return; }
    setModalDeleg(false); cargar();
  }

  async function quitarDelegacion(id) {
    if (!confirm('¿Quitar esta delegación?')) return;
    await supabase.from('delegaciones').delete().eq('id', id);
    cargar();
  }

  if (error) return <Aviso tono="critical">No se pudo cargar Aprobaciones: {error}</Aviso>;
  if (!d) return <Cargando />;

  const totalPendientes = d.solicitudes.length + d.gastos.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Aprobaciones</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {totalPendientes} pendientes de decisión.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold tracking-tight">Solicitudes por revisar</h2>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              onRowClick={() => navigate('/mantenimiento/solicitudes')}
              vacio="Sin solicitudes pendientes."
              columnas={[
                { key: 'folio', header: 'Folio', nowrap: true, render: (s) => <span className="tnum">{s.folio}</span> },
                { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (s) => sucById[s.sucursal_id]?.nombre ?? '—' },
                { key: 'descripcion', header: 'Descripción', render: (s) => <div className="max-w-md truncate">{s.descripcion}</div> },
                { key: 'prioridad', header: 'Prioridad', nowrap: true, render: (s) => {
                    const p = s.prioridad_confirmada ?? s.prioridad_sugerida;
                    return p ? <Badge color={PRIORIDAD_SOLICITUD[p]?.color}>{p}</Badge> : '—';
                  } },
                { key: 'estatus', header: 'Estatus', nowrap: true, render: (s) => (
                    <Badge color={ESTATUS_SOLICITUD[s.estatus]?.color}>{ESTATUS_SOLICITUD[s.estatus]?.label}</Badge>) },
              ]}
              filas={d.solicitudes}
            />
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold tracking-tight">Gastos por autorizar</h2>
        <Card className="!p-0">
          <div className="p-4 sm:p-5">
            <Tabla
              onRowClick={(g) => { setDetalle(g); setComentario(''); setResolverError(null); }}
              vacio="Sin gastos pendientes de autorización."
              columnas={[
                { key: 'fecha', header: 'Fecha', nowrap: true, render: (g) => fechaCorta(g.fecha) },
                { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (g) => sucById[g.sucursal_id]?.nombre ?? '—' },
                { key: 'concepto', header: 'Concepto', render: (g) => (
                    <div>
                      <div>{g.concepto}</div>
                      {provById[g.proveedor_id]?.nombre && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{provById[g.proveedor_id].nombre}</div>)}
                    </div>) },
                { key: 'monto', header: 'Monto', align: 'right', render: (g) => money(g.monto) },
              ]}
              filas={d.gastos}
            />
          </div>
        </Card>
      </div>

      {esAdmin && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Delegaciones</h2>
            <button onClick={abrirNuevaDelegacion} className="text-xs underline" style={{ color: 'var(--series-1)' }}>
              + Nueva delegación
            </button>
          </div>
          <Card className="!p-0">
            <div className="p-4 sm:p-5">
              <Tabla
                vacio="Sin delegaciones registradas."
                columnas={[
                  { key: 'persona_id', header: 'Persona', render: (x) => personaById[x.persona_id]?.nombre ?? '—' },
                  { key: 'tipo_operacion', header: 'Tipo', nowrap: true, render: (x) => TIPOS_DELEGACION[x.tipo_operacion] },
                  { key: 'monto_maximo', header: 'Monto máximo', align: 'right', render: (x) => x.monto_maximo ? money(x.monto_maximo) : 'Sin límite' },
                  { key: 'vigencia', header: 'Vigencia', nowrap: true, render: (x) => `${fechaCorta(x.vigente_desde)} – ${x.vigente_hasta ? fechaCorta(x.vigente_hasta) : 'indefinida'}` },
                  { key: 'accion', header: '', nowrap: true, render: (x) => (
                      <button onClick={() => quitarDelegacion(x.id)} className="text-xs underline" style={{ color: 'var(--critical)' }}>
                        Quitar
                      </button>) },
                ]}
                filas={d.delegaciones}
              />
            </div>
          </Card>
        </div>
      )}

      {/* ---------------- Resolver gasto ---------------- */}
      <Modal abierto={!!detalle} onClose={() => setDetalle(null)} titulo={detalle ? `Autorizar — ${detalle.concepto}` : ''}>
        {detalle && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Sucursal</div><div>{sucById[detalle.sucursal_id]?.nombre ?? '—'}</div></div>
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Proveedor</div><div>{provById[detalle.proveedor_id]?.nombre ?? '—'}</div></div>
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Monto</div><div className="tnum">{money(detalle.monto)}</div></div>
              <div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Fecha</div><div>{fechaCorta(detalle.fecha)}</div></div>
            </div>
            <Campo label="Comentario" hint="Obligatorio solo si vas a rechazar">
              <Textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            </Campo>
            {resolverError && <Aviso tono="critical">{resolverError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" disabled={resolviendo} onClick={() => setDetalle(null)}>Cerrar</Boton>
              <Boton variant="danger" disabled={resolviendo} onClick={() => resolverGasto('rechazado')}>Rechazar</Boton>
              <Boton disabled={resolviendo} onClick={() => resolverGasto('aprobado')}>Aprobar</Boton>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------- Nueva delegación ---------------- */}
      <Modal abierto={modalDeleg} onClose={() => setModalDeleg(false)} titulo="Nueva delegación">
        <form onSubmit={guardarDelegacion} className="space-y-3">
          <Campo label="Persona" required>
            <Select value={formDeleg.persona_id} required onChange={(e) => setFormDeleg({ ...formDeleg, persona_id: e.target.value })}>
              <option value="">Selecciona…</option>
              {(d.personas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Tipo de operación">
              <Select value={formDeleg.tipo_operacion} onChange={(e) => setFormDeleg({ ...formDeleg, tipo_operacion: e.target.value })}>
                {Object.entries(TIPOS_DELEGACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
            <Campo label="Monto máximo" hint="Vacío = sin límite">
              <Input inputMode="decimal" value={formDeleg.monto_maximo} onChange={(e) => setFormDeleg({ ...formDeleg, monto_maximo: e.target.value })} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Vigente desde">
              <Input type="date" value={formDeleg.vigente_desde} onChange={(e) => setFormDeleg({ ...formDeleg, vigente_desde: e.target.value })} />
            </Campo>
            <Campo label="Vigente hasta" hint="Vacío = indefinida">
              <Input type="date" value={formDeleg.vigente_hasta} onChange={(e) => setFormDeleg({ ...formDeleg, vigente_hasta: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Notas" hint="Opcional">
            <Textarea rows={2} value={formDeleg.notas} onChange={(e) => setFormDeleg({ ...formDeleg, notas: e.target.value })} />
          </Campo>
          {delegError && <Aviso tono="critical">{delegError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" disabled={guardandoDeleg} onClick={() => setModalDeleg(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardandoDeleg}>{guardandoDeleg ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
