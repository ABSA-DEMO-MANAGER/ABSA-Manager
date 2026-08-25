import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  money, moneyCorto, pct, mesCorto, fechaCorta, hoyISO, TIPOS, CRITICIDAD,
} from '../lib/format';
import {
  Card, Stat, Cargando, Aviso, Tabla, Badge, Boton, Campo, Input, Modal, Select,
} from '../components/ui';

const ANIO = 2026;
const ORDEN_TIPOS = ['preventivo', 'correctivo', 'remodelacion', 'insumo', 'viaticos', 'otro'];
const CRIT_RANGO = { A: 3, B: 2, C: 1 };

/* Tooltip propio: hereda los tokens de texto, nunca el color de la serie */
function TipTooltip({ active, payload, label, total = false }) {
  if (!active || !payload?.length) return null;
  const suma = payload.reduce((a, p) => a + (p.value || 0), 0);
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg"
         style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
      <div className="mb-1.5 font-medium">{label}</div>
      {payload.filter((p) => p.value).map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="tnum font-medium">{money(p.value)}</span>
        </div>
      ))}
      {total && payload.filter((p) => p.value).length > 1 && (
        <div className="mt-1.5 flex justify-between gap-4 border-t pt-1.5 font-medium"
             style={{ borderColor: 'var(--border)' }}>
          <span>Total</span><span className="tnum">{money(suma)}</span>
        </div>
      )}
    </div>
  );
}

const ejeStyle = { fontSize: 11, fill: 'var(--text-muted)' };

export default function Dashboard() {
  const { puedeEditar } = useAuth();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [verTabla, setVerTabla] = useState(false);

  const [ordenarRealizados, setOrdenarRealizados] = useState('costo'); // costo | criticidad
  const [tabGastos, setTabGastos] = useState('compania'); // compania | caja_chica
  const [desde, setDesde] = useState(`${ANIO}-01-01`);
  const [hasta, setHasta] = useState(hoyISO());

  const [editCaja, setEditCaja] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    const [s, p, cc, g, o, prov, act] = await Promise.all([
      supabase.from('sucursales').select('id, codigo, nombre, activa').order('codigo'),
      supabase.from('presupuestos').select('sucursal_id, anio, monto_aprobado, monto_solicitado').eq('anio', ANIO),
      supabase.from('caja_chica').select('id, anio, monto_asignado, notas').eq('anio', ANIO).maybeSingle(),
      supabase.from('gastos')
        .select('id, fecha, sucursal_id, tipo, unidad_pago, monto, requiere_revision, orden_id, proveedor_id, concepto')
        .order('fecha', { ascending: false }),
      supabase.from('ordenes')
        .select('id, sucursal_id, activo_id, tipo, criticidad, estatus, fecha_programada, fecha_realizada, costo_estimado, titulo, proveedor_id'),
      supabase.from('proveedores').select('id, nombre'),
      supabase.from('activos').select('id'),
    ]);
    const err = s.error || p.error || cc.error || g.error || o.error || prov.error || act.error;
    if (err) { setError(err.message); return; }
    setDatos({
      sucursales: s.data, presupuestos: p.data, cajaChica: cc.data, gastos: g.data,
      ordenes: o.data, proveedores: prov.data, activos: act.data,
    });
  }
  useEffect(() => { cargar(); }, []);

  const sucById = useMemo(() => Object.fromEntries((datos?.sucursales ?? []).map((s) => [s.id, s])), [datos]);
  const provById = useMemo(() => Object.fromEntries((datos?.proveedores ?? []).map((p) => [p.id, p])), [datos]);

  const m = useMemo(() => {
    if (!datos) return null;
    const { sucursales, presupuestos, cajaChica, gastos, ordenes, activos } = datos;
    const presuPorId = Object.fromEntries(presupuestos.map((p) => [p.sucursal_id, p]));
    const hoy = hoyISO();

    const delAnio = gastos.filter((g) => g.fecha?.startsWith(String(ANIO)));
    const dePresupuesto = delAnio.filter((g) => g.unidad_pago !== 'caja_chica');
    const deCajaChica = delAnio.filter((g) => g.unidad_pago === 'caja_chica');

    const presupuestoTotal = presupuestos.reduce((a, p) => a + Number(p.monto_aprobado ?? 0), 0);
    const presupuestoConsumido = dePresupuesto.reduce((a, g) => a + Number(g.monto), 0);
    const cajaChicaTotal = Number(cajaChica?.monto_asignado ?? 0);
    const cajaChicaConsumida = deCajaChica.reduce((a, g) => a + Number(g.monto), 0);

    // por tipo (todo el gasto, sin importar la fuente de pago)
    const porTipo = {};
    delAnio.forEach((g) => { porTipo[g.tipo] = (porTipo[g.tipo] || 0) + Number(g.monto); });
    const preventivo = porTipo.preventivo ?? 0;
    const correctivo = porTipo.correctivo ?? 0;

    // presupuesto por sucursal (la caja chica es un fondo aparte, no cuenta aqui)
    const porSucursal = sucursales.map((s) => {
      const gs = dePresupuesto.filter((g) => g.sucursal_id === s.id);
      const ej = gs.reduce((a, g) => a + Number(g.monto), 0);
      const pr = Number(presuPorId[s.id]?.monto_aprobado ?? 0);
      return {
        id: s.id, codigo: s.codigo, nombre: s.nombre, activa: s.activa,
        presupuesto: pr, ejercido: ej, disponible: pr - ej,
        avance: pr > 0 ? (ej / pr) * 100 : null,
        movimientos: gs.length,
      };
    }).filter((s) => s.presupuesto > 0 || s.ejercido !== 0)
      .sort((a, b) => b.ejercido - a.ejercido);

    // gasto mensual por tipo (todo, para ver la mezcla preventivo/correctivo)
    const meses = {};
    delAnio.forEach((g) => {
      const k = g.fecha.slice(0, 7) + '-01';
      meses[k] ??= { mes: k, etiqueta: mesCorto(k), total: 0 };
      meses[k][g.tipo] = (meses[k][g.tipo] || 0) + Number(g.monto);
      meses[k].total += Number(g.monto);
    });
    const serieMeses = Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes));
    const tiposPresentes = ORDEN_TIPOS.filter((t) => delAnio.some((g) => g.tipo === t));
    const ultimoMes = serieMeses.at(-1)?.mes;

    // activos: proximo / atrasado / en curso, contados por equipo (no por orden)
    const ordenesConActivo = ordenes.filter((o) => o.activo_id);
    const activa = (arr) => new Set(arr.map((o) => o.activo_id)).size;
    const enCurso = activa(ordenesConActivo.filter((o) => o.estatus === 'en_proceso'));
    const atrasados = activa(ordenesConActivo.filter((o) =>
      o.estatus !== 'en_proceso' && !['realizada', 'cancelada'].includes(o.estatus) &&
      (o.estatus === 'pospuesta' || !o.fecha_programada || o.fecha_programada < hoy)));
    const proximos = activa(ordenesConActivo.filter((o) =>
      o.estatus === 'programada' && o.fecha_programada && o.fecha_programada >= hoy));

    // costo real por orden (para top10 de realizados)
    const costoRealPorOrden = {};
    gastos.forEach((g) => { if (g.orden_id) costoRealPorOrden[g.orden_id] = (costoRealPorOrden[g.orden_id] || 0) + Number(g.monto); });

    const realizados = ordenes.filter((o) => o.estatus === 'realizada')
      .map((o) => ({ ...o, costoReal: costoRealPorOrden[o.id] || 0 }));
    const pendientes = ordenes.filter((o) => ['programada', 'en_proceso', 'pospuesta'].includes(o.estatus));

    return {
      presupuestoTotal, presupuestoConsumido, presupuestoDisponible: presupuestoTotal - presupuestoConsumido,
      avancePresupuesto: presupuestoTotal > 0 ? (presupuestoConsumido / presupuestoTotal) * 100 : null,
      cajaChicaTotal, cajaChicaConsumida, cajaChicaDisponible: cajaChicaTotal - cajaChicaConsumida,
      avanceCajaChica: cajaChicaTotal > 0 ? (cajaChicaConsumida / cajaChicaTotal) * 100 : null,
      preventivo, correctivo,
      razon: preventivo > 0 ? correctivo / preventivo : null,
      pctPreventivo: (preventivo + correctivo) > 0 ? (preventivo / (preventivo + correctivo)) * 100 : 0,
      porSucursal, serieMeses, tiposPresentes,
      porRevisar: gastos.filter((g) => g.requiere_revision).length,
      sinPresupuesto: porSucursal.filter((s) => s.activa && s.presupuesto === 0 && s.ejercido !== 0),
      sobregiro: porSucursal.filter((s) => s.presupuesto > 0 && s.ejercido > s.presupuesto),
      ultimoMes,
      totalMovimientos: delAnio.length,
      activosTotal: activos.length, activosEnCurso: enCurso, activosAtrasados: atrasados, activosProximos: proximos,
      realizados, pendientes,
    };
  }, [datos]);

  const top10Realizados = useMemo(() => {
    if (!m) return [];
    return [...m.realizados].sort((a, b) => ordenarRealizados === 'criticidad'
      ? (CRIT_RANGO[b.criticidad] || 0) - (CRIT_RANGO[a.criticidad] || 0)
      : b.costoReal - a.costoReal
    ).slice(0, 10);
  }, [m, ordenarRealizados]);

  const top10Pendientes = useMemo(() => {
    if (!m) return [];
    return [...m.pendientes].sort((a, b) => (Number(b.costo_estimado) || 0) - (Number(a.costo_estimado) || 0)).slice(0, 10);
  }, [m]);

  const top10Gastos = useMemo(() => {
    if (!datos) return [];
    return datos.gastos
      .filter((g) => (!desde || g.fecha >= desde) && (!hasta || g.fecha <= hasta))
      .filter((g) => tabGastos === 'caja_chica' ? g.unidad_pago === 'caja_chica' : g.unidad_pago !== 'caja_chica')
      .sort((a, b) => Number(b.monto) - Number(a.monto))
      .slice(0, 10);
  }, [datos, desde, hasta, tabGastos]);

  function abrirEditCaja() {
    setEditCaja({ monto: m.cajaChicaTotal || '', notas: datos.cajaChica?.notas ?? '' });
    setFormError(null);
  }

  async function guardarCaja(e) {
    e.preventDefault();
    setFormError(null);
    const monto = Number(editCaja.monto);
    if (isNaN(monto) || monto < 0) return setFormError('Captura un monto válido.');

    setGuardando(true);
    const { error: err } = datos.cajaChica
      ? await supabase.from('caja_chica').update({ monto_asignado: monto, notas: editCaja.notas.trim() || null }).eq('id', datos.cajaChica.id)
      : await supabase.from('caja_chica').insert({ anio: ANIO, monto_asignado: monto, notas: editCaja.notas.trim() || null });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setEditCaja(null); cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los datos: {error}</Aviso>;
  if (!m) return <Cargando />;

  const mesesSinCaptura = m.ultimoMes
    ? Math.max(0, (new Date().getFullYear() * 12 + new Date().getMonth())
        - (+m.ultimoMes.slice(0, 4) * 12 + (+m.ultimoMes.slice(5, 7) - 1)))
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tablero {ANIO}</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {m.totalMovimientos} movimientos registrados
        </p>
      </div>

      {/* ---------------- Alertas ---------------- */}
      {(mesesSinCaptura >= 1 || m.porRevisar > 0 || m.sinPresupuesto.length > 0 || m.sobregiro.length > 0) && (
        <div className="space-y-2">
          {mesesSinCaptura >= 1 && (
            <Aviso tono="critical">
              El último gasto capturado es de <strong>{mesCorto(m.ultimoMes)}</strong>
              {mesesSinCaptura === 1 ? ' — hay un mes sin detalle.' : ` — hay ${mesesSinCaptura} meses sin detalle.`}{' '}
              <Link to="/gastos" className="underline">Capturar ahora</Link>
            </Aviso>
          )}
          {m.sobregiro.map((s) => (
            <Aviso key={s.id} tono="critical">
              <strong>{s.nombre}</strong> excedió su presupuesto: {money(s.ejercido)} de {money(s.presupuesto)}.
            </Aviso>
          ))}
          {m.sinPresupuesto.map((s) => (
            <Aviso key={s.id} tono="warning">
              <strong>{s.nombre}</strong> tiene {money(s.ejercido)} ejercidos y <strong>ningún presupuesto aprobado</strong>.
            </Aviso>
          ))}
          {m.porRevisar > 0 && (
            <Aviso tono="warning">
              {m.porRevisar} {m.porRevisar === 1 ? 'movimiento marcado' : 'movimientos marcados'} para revisión
              (montos en negativo o fecha ilegible en el Excel original).{' '}
              <Link to="/gastos?revisar=1" className="underline">Ver</Link>
            </Aviso>
          )}
        </div>
      )}

      {/* ---------------- Activos ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Activos registrados" value={m.activosTotal} />
        <Stat label="En mantenimiento" value={m.activosEnCurso} tone={m.activosEnCurso ? 'warning' : undefined} />
        <Stat label="Atrasados" value={m.activosAtrasados} tone={m.activosAtrasados ? 'critical' : 'good'} />
        <Stat label="Próximos" value={m.activosProximos} />
      </div>

      {/* ---------------- Presupuesto ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Presupuesto aprobado" value={money(m.presupuestoTotal)} hint={`Ejercicio ${ANIO}`} />
        <Stat label="Presupuesto consumido" value={money(m.presupuestoConsumido)}
              hint={m.avancePresupuesto !== null ? `${pct(m.avancePresupuesto)} del total` : undefined}
              tone={m.avancePresupuesto > 100 ? 'critical' : m.avancePresupuesto > 85 ? 'warning' : undefined} />
        <Stat label="Presupuesto disponible" value={money(m.presupuestoDisponible)}
              tone={m.presupuestoDisponible < 0 ? 'critical' : 'good'} />
        <Stat label="Correctivo por cada $1 preventivo"
              value={m.razon ? `$${m.razon.toFixed(2)}` : '—'}
              hint={`Preventivo: ${pct(m.pctPreventivo)} del gasto`}
              tone={m.razon > 2 ? 'critical' : m.razon > 1 ? 'warning' : 'good'} />
      </div>

      {/* ---------------- Caja chica ---------------- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-secondary)' }}>Caja chica</h2>
          {puedeEditar && <button onClick={abrirEditCaja} className="text-xs underline" style={{ color: 'var(--text-secondary)' }}>Editar</button>}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Asignada" value={m.cajaChicaTotal > 0 ? money(m.cajaChicaTotal) : 'Sin asignar'}
                tone={m.cajaChicaTotal > 0 ? undefined : 'critical'} />
          <Stat label="Consumida" value={money(m.cajaChicaConsumida)}
                hint={m.avanceCajaChica !== null ? `${pct(m.avanceCajaChica)} del total` : undefined}
                tone={m.avanceCajaChica > 100 ? 'critical' : m.avanceCajaChica > 85 ? 'warning' : undefined} />
          <Stat label="Disponible" value={m.cajaChicaTotal > 0 ? money(m.cajaChicaDisponible) : '—'}
                tone={m.cajaChicaTotal > 0 ? (m.cajaChicaDisponible < 0 ? 'critical' : 'good') : undefined} />
        </div>
      </div>

      {/* ---------------- Presupuesto vs ejercido ---------------- */}
      <Card
        title="Presupuesto vs ejercido por sucursal"
        subtitle="No incluye caja chica — es un fondo aparte."
        right={
          <button onClick={() => setVerTabla(!verTabla)} className="text-xs underline"
                  style={{ color: 'var(--text-secondary)' }}>
            {verTabla ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        }
      >
        {verTabla ? (
          <Tabla
            columnas={[
              { key: 'nombre', header: 'Sucursal', render: (f) => (
                  <span className="flex items-center gap-2">
                    {f.nombre}
                    {!f.activa && <Badge dot={false}>cerrada</Badge>}
                  </span>) },
              { key: 'presupuesto', header: 'Presupuesto', align: 'right', render: (f) => money(f.presupuesto) },
              { key: 'ejercido', header: 'Ejercido', align: 'right', render: (f) => money(f.ejercido) },
              { key: 'disponible', header: 'Disponible', align: 'right', render: (f) => (
                  <span style={{ color: f.disponible < 0 ? 'var(--critical)' : undefined }}>
                    {money(f.disponible)}
                  </span>) },
              { key: 'avance', header: 'Avance', align: 'right', render: (f) => f.avance === null ? '—' : pct(f.avance) },
              { key: 'movimientos', header: 'Movs.', align: 'right' },
            ]}
            filas={m.porSucursal}
          />
        ) : (
          <div style={{ height: Math.max(220, m.porSucursal.length * 52) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.porSucursal} layout="vertical" margin={{ top: 4, right: 64, left: 4, bottom: 4 }}
                        barGap={2}>
                <CartesianGrid horizontal={false} stroke="var(--grid)" />
                <XAxis type="number" tickFormatter={moneyCorto} tick={ejeStyle}
                       axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis type="category" dataKey="codigo" width={44} tick={ejeStyle}
                       axisLine={false} tickLine={false} />
                <Tooltip content={<TipTooltip />} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} iconType="circle" iconSize={8} />
                <Bar dataKey="presupuesto" name="Presupuesto" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="ejercido" name="Ejercido" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {m.porSucursal.map((s) => (
                    <Cell key={s.id}
                          fill={s.presupuesto > 0 && s.ejercido > s.presupuesto ? 'var(--critical)' : 'var(--series-2)'} />
                  ))}
                  <LabelList dataKey="ejercido" position="right" formatter={moneyCorto}
                             style={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ---------------- Gasto mensual por tipo ---------------- */}
      <Card
        title="Gasto mensual por tipo"
        subtitle="Apilado. El preventivo debería crecer y el correctivo bajar."
      >
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.serieMeses} margin={{ top: 16, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="etiqueta" tick={ejeStyle} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
              <YAxis tickFormatter={moneyCorto} tick={ejeStyle} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<TipTooltip total />} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} iconType="circle" iconSize={8} />
              {m.tiposPresentes.map((t, i) => (
                <Bar
                  key={t} dataKey={t} name={TIPOS[t].label} stackId="g"
                  fill={TIPOS[t].color}
                  stroke="var(--surface-1)" strokeWidth={2}
                  radius={i === m.tiposPresentes.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={56}
                >
                  {i === m.tiposPresentes.length - 1 && (
                    <LabelList dataKey="total" position="top" formatter={moneyCorto}
                               style={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4">
          <Tabla
            columnas={[
              { key: 'etiqueta', header: 'Mes', nowrap: true },
              ...m.tiposPresentes.map((t) => ({
                key: t, header: TIPOS[t].label, align: 'right',
                render: (f) => (f[t] ? money(f[t]) : '—'),
              })),
              { key: 'total', header: 'Total', align: 'right', render: (f) => <strong>{money(f.total)}</strong> },
            ]}
            filas={m.serieMeses}
          />
        </div>
      </Card>

      {/* ---------------- Top 10 mantenimientos realizados ---------------- */}
      <Card
        title="Top 10 mantenimientos realizados"
        right={
          <Select value={ordenarRealizados} onChange={(e) => setOrdenarRealizados(e.target.value)} className="!w-auto">
            <option value="costo">Ordenar por costo</option>
            <option value="criticidad">Ordenar por criticidad</option>
          </Select>
        }
      >
        <Tabla
          vacio="Sin mantenimientos realizados todavía."
          columnas={[
            { key: 'fecha_realizada', header: 'Fecha', nowrap: true, render: (o) => fechaCorta(o.fecha_realizada) },
            { key: 'titulo', header: 'Orden', render: (o) => o.titulo },
            { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (o) => sucById[o.sucursal_id]?.codigo ?? '—' },
            { key: 'tipo', header: 'Tipo', nowrap: true, render: (o) => <Badge color={TIPOS[o.tipo]?.color}>{TIPOS[o.tipo]?.label}</Badge> },
            { key: 'criticidad', header: 'Criticidad', nowrap: true,
              render: (o) => o.criticidad ? <Badge color={CRITICIDAD[o.criticidad]?.color}>{o.criticidad}</Badge> : '—' },
            { key: 'proveedor', header: 'Proveedor', render: (o) => provById[o.proveedor_id]?.nombre ?? '—' },
            { key: 'costoReal', header: 'Costo', align: 'right', render: (o) => money(o.costoReal) },
          ]}
          filas={top10Realizados}
        />
      </Card>

      {/* ---------------- Top 10 mantenimientos pendientes ---------------- */}
      <Card title="Top 10 mantenimientos pendientes" subtitle="Ordenado por impacto en costo estimado">
        <Tabla
          vacio="Sin mantenimientos pendientes."
          columnas={[
            { key: 'fecha_programada', header: 'Programada', nowrap: true, render: (o) => fechaCorta(o.fecha_programada) },
            { key: 'titulo', header: 'Orden', render: (o) => o.titulo },
            { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (o) => sucById[o.sucursal_id]?.codigo ?? '—' },
            { key: 'tipo', header: 'Tipo', nowrap: true, render: (o) => <Badge color={TIPOS[o.tipo]?.color}>{TIPOS[o.tipo]?.label}</Badge> },
            { key: 'criticidad', header: 'Criticidad', nowrap: true,
              render: (o) => o.criticidad ? <Badge color={CRITICIDAD[o.criticidad]?.color}>{o.criticidad}</Badge> : '—' },
            { key: 'costo_estimado', header: 'Costo estimado', align: 'right', render: (o) => o.costo_estimado ? money(o.costo_estimado) : '—' },
          ]}
          filas={top10Pendientes}
        />
      </Card>

      {/* ---------------- Top 10 gastos ---------------- */}
      <Card title="Top 10 gastos">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border p-1"
               style={{ borderColor: 'var(--border)', background: 'var(--plane)' }}>
            {[['compania', 'Presupuesto'], ['caja_chica', 'Caja chica']].map(([k, l]) => (
              <button key={k} onClick={() => setTabGastos(k)}
                      className="rounded-md px-3 py-1.5 text-xs"
                      style={{
                        background: tabGastos === k ? 'var(--surface-1)' : 'transparent',
                        color: tabGastos === k ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: tabGastos === k ? 500 : 400,
                      }}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>Del</span>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="!w-auto" />
            <span>al</span>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="!w-auto" />
          </div>
        </div>
        <Tabla
          vacio="Sin gastos en el rango de fechas."
          columnas={[
            { key: 'fecha', header: 'Fecha', nowrap: true, render: (g) => fechaCorta(g.fecha) },
            { key: 'concepto', header: 'Concepto', render: (g) => g.concepto },
            { key: 'sucursal_id', header: 'Sucursal', nowrap: true, render: (g) => sucById[g.sucursal_id]?.codigo ?? '—' },
            { key: 'tipo', header: 'Tipo', nowrap: true, render: (g) => <Badge color={TIPOS[g.tipo]?.color}>{TIPOS[g.tipo]?.label}</Badge> },
            { key: 'proveedor_id', header: 'Proveedor', render: (g) => provById[g.proveedor_id]?.nombre ?? '—' },
            { key: 'monto', header: 'Monto', align: 'right', render: (g) => money(g.monto, 2) },
          ]}
          filas={top10Gastos}
        />
      </Card>

      {/* ---------------- Editar caja chica ---------------- */}
      <Modal abierto={!!editCaja} onClose={() => setEditCaja(null)} titulo={`Caja chica ${ANIO}`}>
        {editCaja && (
          <form onSubmit={guardarCaja} className="space-y-3">
            <Campo label="Monto asignado" hint="Fondo único de la empresa para todo el año">
              <Input inputMode="decimal" value={editCaja.monto}
                     onChange={(e) => setEditCaja({ ...editCaja, monto: e.target.value })} />
            </Campo>
            <Campo label="Notas">
              <Input value={editCaja.notas} onChange={(e) => setEditCaja({ ...editCaja, notas: e.target.value })} />
            </Campo>
            {formError && <Aviso tono="critical">{formError}</Aviso>}
            <div className="flex justify-end gap-2 pt-1">
              <Boton type="button" variant="ghost" onClick={() => setEditCaja(null)}>Cancelar</Boton>
              <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
