import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, moneyCorto, mesCorto, fechaCorta, hoyISO, normalizarTexto } from '../../lib/format';
import { descargarCSV } from '../../lib/flotasCSV';
import { ROLES_FLOTA } from '../../lib/rolesFlotas';
import { Card, Tabla, Select, Cargando, Aviso, Badge, Stat, Input, Boton } from '../../components/ui';

const mesActual = () => new Date().toISOString().slice(0, 7);
const ejeStyle = { fontSize: 11, fill: 'var(--text-muted)' };

const CATEGORIAS = ['Mantenimiento', 'Reparación', 'Gasolina', 'Tag', 'Multa', 'Siniestro', 'Administrativo'];
const COLOR_CATEGORIA = {
  Mantenimiento: 'var(--series-1)', Reparación: 'var(--series-5)', Gasolina: 'var(--series-3)',
  Tag: 'var(--series-2)', Multa: 'var(--serious)', Siniestro: 'var(--critical)', Administrativo: 'var(--text-muted)',
};
const COLOR_ESTADO_SERVICIO = {
  vencido: 'var(--critical)', proximo: 'var(--serious)', programado: 'var(--series-1)', sin_dato: 'var(--text-muted)',
};
const LABEL_ESTADO_SERVICIO = { vencido: 'Vencido', proximo: 'Próximo (30 días)', programado: 'Programado', sin_dato: 'Sin dato' };

const VISTAS = [
  ['resumen', 'Resumen'],
  ['calendario', 'Calendario de servicios'],
  ['historial', 'Historial de mantenimientos'],
  ['gasolina', 'Gasolina y costos'],
];

function haceMeses(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/* Tooltip propio: hereda los tokens de texto, nunca el color de la serie */
function TipTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
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
    </div>
  );
}

export default function Tablero() {
  const { puedeVerEquipo } = useFlotaPerfil();
  const navigate = useNavigate();
  const [vista, setVista] = useState('resumen');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [mes, setMes] = useState(mesActual());
  const [fCiudad, setFCiudad] = useState('');
  const [fPersona, setFPersona] = useState('');

  const [histDesde, setHistDesde] = useState(haceMeses(12));
  const [histHasta, setHistHasta] = useState(hoyISO());
  const [histTipo, setHistTipo] = useState('');
  const [histBusca, setHistBusca] = useState('');

  async function cargar() {
    const [v, c, g, u, docs, servs, arch] = await Promise.all([
      supabase.from('flota_vehiculos')
        .select('id, codigo, ciudad_id, marca, modelo, conductor_nombre, estado, km, proximo_servicio_km, proximo_servicio_fecha, licencia_vence')
        .order('codigo'),
      supabase.from('flota_ciudades').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('flota_gastos').select('vehiculo_id, categoria, monto, mes, estatus, origen'),
      supabase.rpc('flota_listar_usuarios'),
      supabase.from('flota_documentos').select('vehiculo_id, tipo, vence'),
      supabase.from('flota_servicios')
        .select('id, vehiculo_id, fecha, tipo, concepto, taller, km, mano_obra, refacciones, estatus')
        .order('fecha', { ascending: false }),
      supabase.from('flota_servicio_archivos').select('id, servicio_id'),
    ]);
    const err = v.error || c.error || g.error || u.error || docs.error || servs.error || arch.error;
    if (err) { setError(err.message); return; }
    setD({
      vehiculos: v.data, ciudades: c.data, gastos: g.data, personas: u.data,
      documentos: docs.data, servicios: servs.data, archivos: arch.data,
    });
  }
  useEffect(() => { cargar(); }, []);

  const ciudadById = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.id, c])), [d]);
  const personaById = useMemo(() => Object.fromEntries((d?.personas ?? []).map((p) => [p.id, p])), [d]);
  const vehiculoById = useMemo(() => Object.fromEntries((d?.vehiculos ?? []).map((v) => [v.id, v])), [d]);

  // vehiculo_id -> perfil_id de quien lo trae asignado (para poder filtrar por persona/equipo)
  // solo quienes tienen cuenta en el portal aparecen en "personas"; el resto queda sin filtro de persona.
  const personaPorConductor = useMemo(() => {
    const m = {};
    (d?.personas ?? []).forEach((p) => { m[p.nombre?.trim().toLowerCase()] = p; });
    return m;
  }, [d]);

  // equipo (descendientes, incluido el mismo) de cada persona, calculado con lo que ya llego filtrado por RLS
  const descendientes = useMemo(() => {
    if (!d) return {};
    const hijosDe = {};
    d.personas.forEach((p) => {
      if (p.supervisor_id) (hijosDe[p.supervisor_id] ??= []).push(p.id);
    });
    const memo = {};
    function calcular(id) {
      if (memo[id]) return memo[id];
      const set = new Set([id]);
      (hijosDe[id] || []).forEach((hijoId) => calcular(hijoId).forEach((x) => set.add(x)));
      memo[id] = set;
      return set;
    }
    d.personas.forEach((p) => calcular(p.id));
    return memo;
  }, [d]);

  // unidades dentro del alcance de los filtros de ciudad/persona -- compartido por las 4 pestañas
  const vehiculosEnAlcance = useMemo(() => {
    if (!d) return [];
    const equipoFiltro = fPersona ? descendientes[fPersona] : null;
    return d.vehiculos
      .filter((v) => !fCiudad || String(v.ciudad_id) === fCiudad)
      .filter((v) => {
        if (!equipoFiltro) return true;
        const persona = personaPorConductor[v.conductor_nombre?.trim().toLowerCase()];
        return persona && equipoFiltro.has(persona.id);
      });
  }, [d, fCiudad, fPersona, descendientes, personaPorConductor]);

  const idsEnAlcance = useMemo(() => new Set(vehiculosEnAlcance.map((v) => v.id)), [vehiculosEnAlcance]);

  const documentoVencidoPorVehiculo = useMemo(() => {
    if (!d) return {};
    const hoy = hoyISO();
    const m = {};
    d.documentos.forEach((doc) => { if (doc.vence && doc.vence < hoy) m[doc.vehiculo_id] = true; });
    return m;
  }, [d]);

  const gastosMes = useMemo(() => (d?.gastos ?? []).filter((g) => g.estatus === 'aprobado' && g.mes === mes), [d, mes]);

  // -------------------------------------------------------------- Resumen
  const filasResumen = useMemo(() => {
    if (!d) return [];
    const hoy = hoyISO();
    return vehiculosEnAlcance.map((v) => {
      const gv = gastosMes.filter((g) => g.vehiculo_id === v.id);
      const costo = gv.filter((g) => g.categoria !== 'Gasolina' && g.categoria !== 'Tag').reduce((a, g) => a + Number(g.monto), 0);
      const gasolina = gv.filter((g) => g.categoria === 'Gasolina').reduce((a, g) => a + Number(g.monto), 0);
      const tags = gv.filter((g) => g.categoria === 'Tag').reduce((a, g) => a + Number(g.monto), 0);
      const alertas = [];
      if (v.proximo_servicio_fecha && v.proximo_servicio_fecha < hoy) alertas.push('servicio vencido');
      if (v.proximo_servicio_km && Number(v.km) >= Number(v.proximo_servicio_km)) alertas.push('km de servicio');
      if (v.licencia_vence && v.licencia_vence < hoy) alertas.push('licencia vencida');
      if (documentoVencidoPorVehiculo[v.id]) alertas.push('documento vencido');
      const persona = personaPorConductor[v.conductor_nombre?.trim().toLowerCase()];
      return { v, persona, ciudad: ciudadById[v.ciudad_id]?.nombre ?? '—', costo, gasolina, tags, total: costo + gasolina + tags, alertas };
    }).sort((a, b) => b.total - a.total);
  }, [d, vehiculosEnAlcance, gastosMes, ciudadById, personaPorConductor, documentoVencidoPorVehiculo]);

  const totalesResumen = filasResumen.reduce((a, f) => ({
    costo: a.costo + f.costo, gasolina: a.gasolina + f.gasolina, tags: a.tags + f.tags, alertas: a.alertas + (f.alertas.length > 0 ? 1 : 0),
  }), { costo: 0, gasolina: 0, tags: 0, alertas: 0 });

  // ------------------------------------------------------------ Calendario
  const calendario = useMemo(() => {
    if (!d) return [];
    const hoy = hoyISO();
    const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const orden = { vencido: 0, proximo: 1, programado: 2, sin_dato: 3 };
    return vehiculosEnAlcance.map((v) => {
      const kmAlcanzado = v.proximo_servicio_km && Number(v.km) >= Number(v.proximo_servicio_km);
      let estado = 'sin_dato';
      if (kmAlcanzado || (v.proximo_servicio_fecha && v.proximo_servicio_fecha < hoy)) estado = 'vencido';
      else if (v.proximo_servicio_fecha && v.proximo_servicio_fecha <= en30) estado = 'proximo';
      else if (v.proximo_servicio_fecha || v.proximo_servicio_km) estado = 'programado';
      return { v, estado, kmAlcanzado, ciudad: ciudadById[v.ciudad_id]?.nombre ?? '—' };
    }).sort((a, b) => orden[a.estado] - orden[b.estado] || (a.v.proximo_servicio_fecha || '9999').localeCompare(b.v.proximo_servicio_fecha || '9999'));
  }, [d, vehiculosEnAlcance, ciudadById]);

  function descargarCalendario() {
    const header = ['Código', 'Unidad', 'Ciudad', 'Conductor', 'Estado', 'Próximo servicio (km)', 'Kilometraje actual', 'Próximo servicio (fecha)'];
    const filas = calendario.map((f) => [
      f.v.codigo ?? '', [f.v.marca, f.v.modelo].filter(Boolean).join(' '), f.ciudad, f.v.conductor_nombre ?? '',
      LABEL_ESTADO_SERVICIO[f.estado], f.v.proximo_servicio_km ?? '', f.v.km ?? '', f.v.proximo_servicio_fecha ?? '',
    ]);
    descargarCSV(`calendario_servicios_${hoyISO()}.csv`, [header, ...filas]);
  }

  // -------------------------------------------------------------- Historial
  const archivosCountPorServicio = useMemo(() => {
    const m = {};
    (d?.archivos ?? []).forEach((a) => { m[a.servicio_id] = (m[a.servicio_id] || 0) + 1; });
    return m;
  }, [d]);

  const historial = useMemo(() => {
    if (!d) return [];
    const q = normalizarTexto(histBusca.trim());
    return d.servicios
      .filter((s) => idsEnAlcance.has(s.vehiculo_id))
      .filter((s) => (!histDesde || s.fecha >= histDesde) && (!histHasta || s.fecha <= histHasta))
      .filter((s) => !histTipo || s.tipo === histTipo)
      .filter((s) => {
        if (!q) return true;
        const v = vehiculoById[s.vehiculo_id];
        const texto = normalizarTexto([s.concepto, s.taller, v?.codigo, v?.marca, v?.modelo].filter(Boolean).join(' '));
        return texto.includes(q);
      })
      .map((s) => ({ ...s, _vehiculo: vehiculoById[s.vehiculo_id], _archivos: archivosCountPorServicio[s.id] ?? 0, _costo: Number(s.mano_obra) + Number(s.refacciones) }));
  }, [d, idsEnAlcance, histDesde, histHasta, histTipo, histBusca, vehiculoById, archivosCountPorServicio]);

  const totalHistorial = historial.reduce((a, s) => a + s._costo, 0);

  function descargarHistorial() {
    const header = ['Fecha', 'Código', 'Unidad', 'Ciudad', 'Tipo', 'Concepto', 'Taller', 'Km', 'Mano de obra', 'Refacciones', 'Costo total', 'Archivos'];
    const filas = historial.map((s) => [
      s.fecha, s._vehiculo?.codigo ?? '', [s._vehiculo?.marca, s._vehiculo?.modelo].filter(Boolean).join(' '),
      ciudadById[s._vehiculo?.ciudad_id]?.nombre ?? '', s.tipo, s.concepto, s.taller ?? '', s.km ?? '',
      s.mano_obra, s.refacciones, s._costo, s._archivos,
    ]);
    descargarCSV(`historial_mantenimientos_${hoyISO()}.csv`, [header, ...filas]);
  }

  // ---------------------------------------------------------- Gasolina/costos
  const serieGasolinaTags = useMemo(() => {
    if (!d) return [];
    const porMes = {};
    d.gastos
      .filter((g) => g.estatus === 'aprobado' && idsEnAlcance.has(g.vehiculo_id) && (g.categoria === 'Gasolina' || g.categoria === 'Tag'))
      .forEach((g) => {
        porMes[g.mes] ??= { mes: g.mes, Gasolina: 0, Tag: 0 };
        porMes[g.mes][g.categoria] += Number(g.monto);
      });
    return Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6)
      .map((x) => ({ ...x, etiqueta: mesCorto(x.mes) }));
  }, [d, idsEnAlcance]);

  const costosPorCategoria = useMemo(() => {
    if (!d) return [];
    const porCat = {};
    gastosMes.filter((g) => idsEnAlcance.has(g.vehiculo_id)).forEach((g) => {
      porCat[g.categoria] = (porCat[g.categoria] || 0) + Number(g.monto);
    });
    return CATEGORIAS.map((cat) => ({ categoria: cat, monto: porCat[cat] ?? 0 })).filter((x) => x.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [d, gastosMes, idsEnAlcance]);

  const totalCostosMes = costosPorCategoria.reduce((a, c) => a + c.monto, 0);

  if (!puedeVerEquipo) return <Aviso tono="critical">Esta vista es solo para Administrador General, Administrador Flotas y Gerente.</Aviso>;
  if (error) return <Aviso tono="critical">No se pudo cargar el tablero: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tablero</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {vehiculosEnAlcance.length} de {d.vehiculos.length} unidades en tu alcance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fCiudad} onChange={(e) => setFCiudad(e.target.value)} className="!w-auto">
            <option value="">Todas las ciudades</option>
            {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Select value={fPersona} onChange={(e) => setFPersona(e.target.value)} className="!w-auto">
            <option value="">Todas las personas</option>
            {d.personas.filter((p) => p.rol !== 'pendiente').map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} · {ROLES_FLOTA[p.rol]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border p-1"
           style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', width: 'fit-content' }}>
        {VISTAS.map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)}
                  className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm"
                  style={{
                    background: vista === k ? 'var(--plane)' : 'transparent',
                    color: vista === k ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: vista === k ? 500 : 400,
                  }}>
            {l}
          </button>
        ))}
      </div>

      {vista === 'resumen' && (
        <>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="!w-auto" />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Unidades" value={filasResumen.length} />
            <Stat label="En mantenimiento" value={filasResumen.filter((f) => f.v.estado === 'en_mantenimiento').length} />
            <Stat label="Con alerta" value={totalesResumen.alertas} tone={totalesResumen.alertas ? 'critical' : 'good'} />
            <Stat label="Costo del mes" value={money(Math.round(totalesResumen.costo))} />
            <Stat label="Gasolina + tags del mes" value={money(Math.round(totalesResumen.gasolina + totalesResumen.tags))} />
          </div>

          <Card title="Por unidad" subtitle="Costo de mantenimiento, gasolina, tags y alertas del mes seleccionado.">
            {filasResumen.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Ninguna unidad coincide con el filtro.
              </p>
            ) : (
              <Tabla
                onRowClick={(f) => navigate(`/flotas/unidades/${f.v.id}`)}
                columnas={[
                  { key: 'unidad', header: 'Unidad', render: (f) => (
                      <div>
                        <div className="font-medium">{[f.v.marca, f.v.modelo].filter(Boolean).join(' ') || f.v.codigo}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.v.codigo}</div>
                      </div>) },
                  { key: 'ciudad', header: 'Ciudad', nowrap: true, render: (f) => f.ciudad },
                  { key: 'persona', header: 'Conductor', render: (f) => (
                      <div>
                        <div>{f.v.conductor_nombre || 'Sin asignar'}</div>
                        {f.persona && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{ROLES_FLOTA[f.persona.rol]}</div>}
                      </div>) },
                  { key: 'costo', header: 'Costo', align: 'right', render: (f) => money(Math.round(f.costo)) },
                  { key: 'gasolina', header: 'Gasolina', align: 'right', render: (f) => money(Math.round(f.gasolina)) },
                  { key: 'tags', header: 'Tags', align: 'right', render: (f) => money(Math.round(f.tags)) },
                  { key: 'total', header: 'Total', align: 'right', render: (f) => <strong className="tnum">{money(Math.round(f.total))}</strong> },
                  { key: 'alertas', header: 'Alertas', render: (f) => (
                      f.alertas.length ? <Badge color="var(--critical)">{f.alertas.join(', ')}</Badge> : null) },
                ]}
                filas={filasResumen}
              />
            )}
          </Card>
        </>
      )}

      {vista === 'calendario' && (
        <Card title="Calendario de próximos mantenimientos"
              subtitle="Ordenado por urgencia: vencidos primero, luego los de los próximos 30 días."
              right={<Boton variant="ghost" onClick={descargarCalendario}>⇩ Descargar CSV</Boton>}>
          {calendario.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Ninguna unidad coincide con el filtro.</p>
          ) : (
            <Tabla
              onRowClick={(f) => navigate(`/flotas/unidades/${f.v.id}`)}
              columnas={[
                { key: 'estado', header: 'Estado', nowrap: true, render: (f) => <Badge color={COLOR_ESTADO_SERVICIO[f.estado]}>{LABEL_ESTADO_SERVICIO[f.estado]}</Badge> },
                { key: 'unidad', header: 'Unidad', render: (f) => (
                    <div>
                      <div className="font-medium">{[f.v.marca, f.v.modelo].filter(Boolean).join(' ') || f.v.codigo}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.v.codigo}</div>
                    </div>) },
                { key: 'ciudad', header: 'Ciudad', nowrap: true, render: (f) => f.ciudad },
                { key: 'km', header: 'Kilometraje', align: 'right', render: (f) => (
                    <span style={{ color: f.kmAlcanzado ? 'var(--critical)' : undefined }}>
                      {Number(f.v.km).toLocaleString('es-MX')}{f.v.proximo_servicio_km ? ` / ${Number(f.v.proximo_servicio_km).toLocaleString('es-MX')}` : ''}
                    </span>) },
                { key: 'fecha', header: 'Próximo servicio', nowrap: true, render: (f) => f.v.proximo_servicio_fecha ? fechaCorta(f.v.proximo_servicio_fecha) : '—' },
              ]}
              filas={calendario}
            />
          )}
        </Card>
      )}

      {vista === 'historial' && (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <div className="mb-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Desde</div>
                <Input type="date" value={histDesde} onChange={(e) => setHistDesde(e.target.value)} className="!w-auto" />
              </div>
              <div>
                <div className="mb-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Hasta</div>
                <Input type="date" value={histHasta} onChange={(e) => setHistHasta(e.target.value)} className="!w-auto" />
              </div>
              <Select value={histTipo} onChange={(e) => setHistTipo(e.target.value)} className="!w-auto">
                <option value="">Preventivo y correctivo</option>
                <option value="preventivo">Preventivo</option>
                <option value="correctivo">Correctivo</option>
              </Select>
              <Input placeholder="Buscar unidad, taller, concepto…" value={histBusca}
                     onChange={(e) => setHistBusca(e.target.value)} className="min-w-[220px] flex-1" />
            </div>
          </Card>

          <Card title={`Historial de mantenimientos (${historial.length})`}
                subtitle={`Costo total en el periodo: ${money(Math.round(totalHistorial))}`}
                right={<Boton variant="ghost" onClick={descargarHistorial}>⇩ Descargar CSV</Boton>}>
            {historial.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Sin servicios en este periodo/filtro.</p>
            ) : (
              <Tabla
                onRowClick={(s) => navigate(`/flotas/unidades/${s.vehiculo_id}`)}
                columnas={[
                  { key: 'fecha', header: 'Fecha', nowrap: true, render: (s) => fechaCorta(s.fecha) },
                  { key: 'unidad', header: 'Unidad', render: (s) => (
                      <div>
                        <div>{[s._vehiculo?.marca, s._vehiculo?.modelo].filter(Boolean).join(' ') || s._vehiculo?.codigo}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s._vehiculo?.codigo}</div>
                      </div>) },
                  { key: 'concepto', header: 'Concepto', render: (s) => (
                      <div>
                        <div>
                          {s.concepto}
                          {s.estatus === 'abierto' && <Badge color="var(--serious)">En proceso</Badge>}
                        </div>
                        {s.taller && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.taller}</div>}
                      </div>) },
                  { key: 'tipo', header: 'Tipo', nowrap: true,
                    render: (s) => <Badge color={s.tipo === 'preventivo' ? 'var(--series-1)' : 'var(--serious)'}>{s.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'}</Badge> },
                  { key: 'km', header: 'Km', align: 'right', render: (s) => s.km ? Number(s.km).toLocaleString('es-MX') : '—' },
                  { key: 'costo', header: 'Costo', align: 'right', render: (s) => money(s._costo) },
                  { key: 'archivos', header: '', nowrap: true, render: (s) => s._archivos > 0 ? (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s._archivos} archivo{s._archivos > 1 ? 's' : ''}</span>
                    ) : null },
                ]}
                filas={historial}
              />
            )}
          </Card>
        </>
      )}

      {vista === 'gasolina' && (
        <>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="!w-auto" />

          <Card title="Gasolina y tags — últimos 6 meses" subtitle="Unidades dentro del filtro de ciudad/persona seleccionado arriba.">
            {serieGasolinaTags.length === 0 ? (
              <Aviso>Sin gasto de gasolina o tags registrado todavía.</Aviso>
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieGasolinaTags} margin={{ top: 16, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="etiqueta" tick={ejeStyle} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                    <YAxis tickFormatter={moneyCorto} tick={ejeStyle} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<TipTooltip />} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} iconType="circle" iconSize={8} />
                    <Bar dataKey="Gasolina" name="Gasolina" stackId="g" fill={COLOR_CATEGORIA.Gasolina} radius={[0, 0, 0, 0]} maxBarSize={56} />
                    <Bar dataKey="Tag" name="Tag" stackId="g" fill={COLOR_CATEGORIA.Tag} radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 text-right">
              <Boton variant="ghost" onClick={() => navigate('/flotas/combustible')}>Ver detalle en Combustible →</Boton>
            </div>
          </Card>

          <Card title={`Costo por categoría — ${mesCorto(mes)}`} subtitle={`Total: ${money(Math.round(totalCostosMes))}`}>
            {costosPorCategoria.length === 0 ? (
              <Aviso>Sin gasto aprobado en este mes.</Aviso>
            ) : (
              <div className="space-y-2">
                {costosPorCategoria.map((c) => (
                  <div key={c.categoria} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.categoria}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--grid)' }}>
                      <div className="h-full rounded-full"
                           style={{ width: `${totalCostosMes > 0 ? (c.monto / totalCostosMes) * 100 : 0}%`, background: COLOR_CATEGORIA[c.categoria] }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-sm tnum font-medium">{money(Math.round(c.monto))}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 text-right">
              <Boton variant="ghost" onClick={() => navigate('/flotas/costos')}>Ver detalle en Costos →</Boton>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
