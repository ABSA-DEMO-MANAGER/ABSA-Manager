import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { money, pct, fechaCorta, CRITICIDAD } from '../lib/format';
import {
  Cargando, Aviso, Badge, Stat, Progreso, Input,
  Modal, Campo, Boton, FiltroChips,
} from '../components/ui';
import PeriodoFiltro, { rangoMensual } from '../components/PeriodoFiltro';

const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export default function SucursalDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { esAdmin } = useAuth();

  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [fCat, setFCat] = useState('');
  const [periodo, setPeriodo] = useState(null);

  const [editPresupuesto, setEditPresupuesto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    const [s, p, g, a, c] = await Promise.all([
      supabase.from('sucursales').select('id, codigo, nombre, ciudad, activa, notas').eq('id', id).maybeSingle(),
      supabase.from('presupuestos')
        .select('id, anio, mes, monto_solicitado, monto_aprobado, notas')
        .eq('sucursal_id', id),
      supabase.from('gastos').select('monto, fecha').eq('sucursal_id', id),
      supabase.from('activos')
        .select('id, categoria_id, codigo, nombre, ubicacion, tipo, marca, modelo, serie, capacidad, criticidad, ultimo_servicio, fecha_instalacion, atributos, notas')
        .eq('sucursal_id', id).order('codigo'),
      supabase.from('categorias').select('id, nombre').order('orden'),
    ]);
    const err = s.error || p.error || g.error || a.error || c.error;
    if (err) { setError(err.message); return; }
    if (!s.data) { setError('no-existe'); return; }
    setD({ sucursal: s.data, presupuestos: p.data, gastos: g.data, activos: a.data, categorias: c.data });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [id]);

  const catById = useMemo(() => Object.fromEntries((d?.categorias ?? []).map((c) => [c.id, c])), [d]);

  const presupuestosDelPeriodo = useMemo(() => {
    if (!d || !periodo) return [];
    return d.presupuestos.filter((p) => {
      const r = rangoMensual(p.anio, p.mes);
      return r.desde <= periodo.hasta && r.hasta >= periodo.desde;
    });
  }, [d, periodo]);

  const stats = useMemo(() => {
    if (!d || !periodo) return null;
    const enPeriodo = d.gastos.filter((g) => g.fecha >= periodo.desde && g.fecha <= periodo.hasta);
    const ejercido = enPeriodo.reduce((a, g) => a + Number(g.monto), 0);
    const presupuesto = presupuestosDelPeriodo.reduce((a, p) => a + Number(p.monto_aprobado ?? 0), 0);
    return {
      ejercido, presupuesto,
      disponible: presupuesto - ejercido,
      avance: presupuesto > 0 ? (ejercido / presupuesto) * 100 : null,
      criticos: d.activos.filter((a) => a.criticidad === 'A').length,
      notas: [...new Set(presupuestosDelPeriodo.map((p) => p.notas).filter(Boolean))],
    };
  }, [d, periodo, presupuestosDelPeriodo]);

  const coinciden = (a, q) =>
    !q || [a.nombre, a.codigo, a.marca, a.modelo, a.ubicacion, a.serie]
      .some((v) => v?.toLowerCase().includes(q));

  const opcionesCategoria = useMemo(() => {
    if (!d) return [];
    const q = busca.trim().toLowerCase();
    const base = d.activos.filter((a) => coinciden(a, q));
    return d.categorias.map((c) => ({
      value: String(c.id), label: c.nombre,
      count: base.filter((a) => a.categoria_id === c.id).length,
    }));
  }, [d, busca]);

  const activosFiltrados = useMemo(() => {
    if (!d) return [];
    const q = busca.trim().toLowerCase();
    return d.activos.filter((a) => (!fCat || String(a.categoria_id) === fCat) && coinciden(a, q));
  }, [d, busca, fCat]);

  function abrirEditPresupuesto() {
    const fila = d.presupuestos.find((p) => p.anio === periodo.anio && p.mes === periodo.mes);
    setEditPresupuesto({
      id: fila?.id ?? null, anio: periodo.anio, mes: periodo.mes,
      solicitado: fila?.monto_solicitado ?? '', aprobado: fila?.monto_aprobado ?? '',
      notas: fila?.notas ?? '',
    });
    setFormError(null);
  }

  async function guardarPresupuesto(e) {
    e.preventDefault();
    setFormError(null);
    const aprobado = editPresupuesto.aprobado === '' ? null : Number(editPresupuesto.aprobado);
    const solicitado = editPresupuesto.solicitado === '' ? null : Number(editPresupuesto.solicitado);
    if (aprobado !== null && (isNaN(aprobado) || aprobado < 0)) return setFormError('Monto aprobado inválido.');

    setGuardando(true);
    const { error: err } = editPresupuesto.id
      ? await supabase.from('presupuestos')
          .update({ monto_aprobado: aprobado, monto_solicitado: solicitado, notas: editPresupuesto.notas.trim() || null })
          .eq('id', editPresupuesto.id)
      : await supabase.from('presupuestos')
          .insert({
            sucursal_id: Number(id), anio: editPresupuesto.anio, mes: editPresupuesto.mes,
            monto_aprobado: aprobado, monto_solicitado: solicitado, notas: editPresupuesto.notas.trim() || null,
          });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setEditPresupuesto(null); cargar();
  }

  async function alternarActiva() {
    const accion = d.sucursal.activa ? 'cerrar' : 'reabrir';
    if (!confirm(`¿Seguro que quieres ${accion} ${d.sucursal.nombre}? ${d.sucursal.activa ? 'Se ocultará de la lista principal pero conserva todo su historial.' : ''}`)) return;
    await supabase.from('sucursales').update({ activa: !d.sucursal.activa }).eq('id', id);
    cargar();
  }

  if (error === 'no-existe') {
    return (
      <div className="space-y-3">
        <Aviso tono="critical">Esta sucursal no existe o no tienes acceso a ella.</Aviso>
        <Link to="/sucursales" className="text-sm underline" style={{ color: 'var(--series-1)' }}>
          ← Volver a sucursales
        </Link>
      </div>
    );
  }
  if (error) return <Aviso tono="critical">No se pudo cargar la sucursal: {error}</Aviso>;
  if (!d) return <Cargando />;

  const { sucursal } = d;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/sucursales')} className="text-sm underline"
              style={{ color: 'var(--text-secondary)' }}>
        ← Sucursales
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
            style={{ background: 'var(--series-1)', color: '#fff' }} aria-hidden="true"
          >
            {sucursal.codigo}
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {sucursal.nombre}
              {!sucursal.activa && <Badge dot={false}>cerrada</Badge>}
            </h1>
            {sucursal.ciudad && (
              <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{sucursal.ciudad}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton variant="ghost" onClick={() => navigate(`/gastos?sucursal=${id}`)}>
            Ver gastos desglosados →
          </Boton>
          {esAdmin && periodo?.modo === 'mes' && (
            <Boton variant="ghost" onClick={abrirEditPresupuesto}>
              Editar presupuesto de {MESES_LARGO[periodo.mes - 1]}
            </Boton>
          )}
          {esAdmin && (
            <Boton variant={sucursal.activa ? 'danger' : 'ghost'} onClick={alternarActiva}>
              {sucursal.activa ? 'Cerrar sucursal' : 'Reabrir sucursal'}
            </Boton>
          )}
        </div>
      </div>

      <PeriodoFiltro inicial={{ modo: 'mes' }} onChange={setPeriodo} />

      {!periodo || !stats ? <Cargando /> : (
      <>
      {stats.notas.length > 0 && stats.notas.map((n, i) => <Aviso key={i} tono="warning">{n}</Aviso>)}
      {esAdmin && periodo.modo !== 'mes' && (
        <Aviso>Cambia el periodo a "Mes" para poder editar el presupuesto de un mes específico.</Aviso>
      )}

      <button
        onClick={() => navigate(`/gastos?sucursal=${id}`)}
        className="grid w-full grid-cols-2 gap-3 rounded-xl text-left lg:grid-cols-4"
        title="Ver el desglose de gastos de esta sucursal"
      >
        <Stat label="Activos registrados" value={d.activos.length} />
        <Stat label="Presupuesto" value={stats.presupuesto > 0 ? money(stats.presupuesto) : 'Sin asignar'}
              tone={stats.presupuesto > 0 ? undefined : 'critical'} />
        <Stat label="Ejercido" value={money(stats.ejercido)}
              hint={stats.avance !== null ? `${pct(stats.avance)} del presupuesto` : undefined}
              tone={stats.avance > 100 ? 'critical' : stats.avance > 85 ? 'warning' : undefined} />
        <Stat label="Disponible" value={stats.presupuesto > 0 ? money(stats.disponible) : '—'}
              tone={stats.disponible < 0 ? 'critical' : stats.presupuesto > 0 ? 'good' : undefined} />
      </button>

      {stats.avance !== null && (
        <Progreso valor={stats.avance} tono={stats.avance > 100 ? 'critical' : stats.avance > 85 ? 'warning' : undefined} />
      )}
      </>
      )}

      {/* ---------------- Activos ---------------- */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">
            Activos {activosFiltrados.length !== d.activos.length && (
              <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                ({activosFiltrados.length} de {d.activos.length})
              </span>
            )}
          </h2>
        </div>

        {d.activos.length > 0 && (
          <div className="mb-4 space-y-3">
            <Input placeholder="Buscar equipo, marca, modelo, serie…" value={busca}
                   onChange={(e) => setBusca(e.target.value)} />
            <FiltroChips opciones={opcionesCategoria} valor={fCat} onChange={setFCat} todasLabel="Todas las categorías" />
          </div>
        )}

        {d.activos.length === 0 ? (
          <Aviso tono="warning">
            Todavía no hay activos registrados en esta sucursal. Sin un catálogo de equipos no
            hay plan preventivo real — este es el primer dato que conviene levantar.
          </Aviso>
        ) : activosFiltrados.length === 0 ? (
          <Aviso>Ningún activo coincide con el filtro.</Aviso>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activosFiltrados.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`/activos/${a.id}`)}
                className="flex flex-col gap-2 rounded-xl border p-4 text-left transition hover:shadow-md"
                style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.nombre}</div>
                    {a.ubicacion && (
                      <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{a.ubicacion}</div>
                    )}
                  </div>
                  <Badge color={CRITICIDAD[a.criticidad]?.color}>{a.criticidad}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {catById[a.categoria_id]?.nombre && <span>{catById[a.categoria_id].nombre}</span>}
                  {a.marca && <span>{[a.marca, a.modelo].filter(Boolean).join(' · ')}</span>}
                </div>
                {(a.codigo || a.ultimo_servicio) && (
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{a.codigo ?? ''}</span>
                    <span>{a.ultimo_servicio ? `Último: ${fechaCorta(a.ultimo_servicio)}` : ''}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- Modal: editar presupuesto ---------------- */}
      <Modal abierto={!!editPresupuesto} onClose={() => setEditPresupuesto(null)}
             titulo={editPresupuesto ? `Presupuesto de ${MESES_LARGO[editPresupuesto.mes - 1]} ${editPresupuesto.anio} — ${sucursal.nombre}` : ''}>
        {editPresupuesto && (
          <form onSubmit={guardarPresupuesto} className="space-y-3">
            <Campo label="Monto solicitado" hint="Lo que pidió el área de mantenimiento">
              <Input inputMode="decimal" value={editPresupuesto.solicitado}
                     onChange={(e) => setEditPresupuesto({ ...editPresupuesto, solicitado: e.target.value })} />
            </Campo>
            <Campo label="Monto aprobado" hint="Lo que autorizó dirección. Vacío = sin presupuesto asignado.">
              <Input inputMode="decimal" value={editPresupuesto.aprobado}
                     onChange={(e) => setEditPresupuesto({ ...editPresupuesto, aprobado: e.target.value })} />
            </Campo>
            <Campo label="Notas">
              <Input value={editPresupuesto.notas}
                     onChange={(e) => setEditPresupuesto({ ...editPresupuesto, notas: e.target.value })} />
            </Campo>
            <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Ejercido este mes</span>
                <span className="tnum font-medium">{money(stats?.ejercido ?? 0)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Activos registrados</span>
                <span className="tnum font-medium">{d.activos.length}</span>
              </div>
            </div>
            {formError && <Aviso tono="critical">{formError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setEditPresupuesto(null)}>Cancelar</Boton>
              <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
