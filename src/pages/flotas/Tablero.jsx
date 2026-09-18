import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useFlotaPerfil } from '../../lib/useFlotaPerfil';
import { money, hoyISO } from '../../lib/format';
import { Card, Tabla, Select, Cargando, Aviso, Badge, Stat, Input } from '../../components/ui';

const ROLES = { admin: 'Administrador General', director: 'Director', gerente: 'Gerente', usuario: 'Usuario', pendiente: 'Pendiente' };
const mesActual = () => new Date().toISOString().slice(0, 7);

export default function Tablero() {
  const { puedeVerEquipo } = useFlotaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [mes, setMes] = useState(mesActual());
  const [fCiudad, setFCiudad] = useState('');
  const [fPersona, setFPersona] = useState('');

  async function cargar() {
    const [v, c, g, u] = await Promise.all([
      supabase.from('flota_vehiculos')
        .select('id, codigo, ciudad_id, marca, modelo, conductor_nombre, estado, km, proximo_servicio_km, proximo_servicio_fecha, licencia_vence')
        .order('codigo'),
      supabase.from('flota_ciudades').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('flota_gastos').select('vehiculo_id, categoria, monto, mes, estatus, origen'),
      supabase.rpc('flota_listar_usuarios'),
    ]);
    const err = v.error || c.error || g.error || u.error;
    if (err) { setError(err.message); return; }
    setD({ vehiculos: v.data, ciudades: c.data, gastos: g.data, personas: u.data });
  }
  useEffect(() => { cargar(); }, []);

  const ciudadById = useMemo(() => Object.fromEntries((d?.ciudades ?? []).map((c) => [c.id, c])), [d]);
  const personaById = useMemo(() => Object.fromEntries((d?.personas ?? []).map((p) => [p.id, p])), [d]);

  // vehiculo_id -> perfil_id de quien lo trae asignado (para poder filtrar por persona/equipo)
  // no tenemos vehiculo_asignado_id aqui directo por persona: lo inferimos por nombre de conductor
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

  const gastosMes = useMemo(() => (d?.gastos ?? []).filter((g) => g.estatus === 'aprobado' && g.mes === mes), [d, mes]);

  const filas = useMemo(() => {
    if (!d) return [];
    const equipoFiltro = fPersona ? descendientes[fPersona] : null;
    return d.vehiculos
      .filter((v) => !fCiudad || String(v.ciudad_id) === fCiudad)
      .filter((v) => {
        if (!equipoFiltro) return true;
        const persona = personaPorConductor[v.conductor_nombre?.trim().toLowerCase()];
        return persona && equipoFiltro.has(persona.id);
      })
      .map((v) => {
        const gv = gastosMes.filter((g) => g.vehiculo_id === v.id);
        const costo = gv.filter((g) => g.categoria !== 'Gasolina' && g.categoria !== 'Tag').reduce((a, g) => a + Number(g.monto), 0);
        const gasolina = gv.filter((g) => g.categoria === 'Gasolina').reduce((a, g) => a + Number(g.monto), 0);
        const tags = gv.filter((g) => g.categoria === 'Tag').reduce((a, g) => a + Number(g.monto), 0);
        const hoy = hoyISO();
        const alertas = [];
        if (v.proximo_servicio_fecha && v.proximo_servicio_fecha < hoy) alertas.push('servicio vencido');
        if (v.proximo_servicio_km && Number(v.km) >= Number(v.proximo_servicio_km)) alertas.push('km de servicio');
        if (v.licencia_vence && v.licencia_vence < hoy) alertas.push('licencia vencida');
        const persona = personaPorConductor[v.conductor_nombre?.trim().toLowerCase()];
        return { v, persona, ciudad: ciudadById[v.ciudad_id]?.nombre ?? '—', costo, gasolina, tags, total: costo + gasolina + tags, alertas };
      })
      .sort((a, b) => b.total - a.total);
  }, [d, fCiudad, fPersona, descendientes, personaPorConductor, gastosMes, ciudadById]);

  const totales = filas.reduce((a, f) => ({
    costo: a.costo + f.costo, gasolina: a.gasolina + f.gasolina, tags: a.tags + f.tags, alertas: a.alertas + f.alertas.length,
  }), { costo: 0, gasolina: 0, tags: 0, alertas: 0 });

  if (!puedeVerEquipo) return <Aviso tono="critical">Esta vista es solo para Administrador General, Director y Gerente.</Aviso>;
  if (error) return <Aviso tono="critical">No se pudo cargar el tablero: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tablero</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {filas.length} de {d.vehiculos.length} unidades en tu alcance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="!w-auto" />
          <Select value={fCiudad} onChange={(e) => setFCiudad(e.target.value)} className="!w-auto">
            <option value="">Todas las ciudades</option>
            {d.ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Select value={fPersona} onChange={(e) => setFPersona(e.target.value)} className="!w-auto">
            <option value="">Todas las personas</option>
            {d.personas.filter((p) => p.rol !== 'pendiente').map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} · {ROLES[p.rol]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unidades" value={filas.length} />
        <Stat label="Costo del mes" value={money(Math.round(totales.costo))} />
        <Stat label="Gasolina + tags del mes" value={money(Math.round(totales.gasolina + totales.tags))} />
        <Stat label="Con alertas" value={totales.alertas} tone={totales.alertas ? 'critical' : 'good'} />
      </div>

      <Card title="Por unidad" subtitle="Costo de mantenimiento, gasolina, tags y alertas del mes seleccionado.">
        {filas.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Ninguna unidad coincide con el filtro.
          </p>
        ) : (
          <Tabla
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
                    {f.persona && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{ROLES[f.persona.rol]}</div>}
                  </div>) },
              { key: 'costo', header: 'Costo', align: 'right', render: (f) => money(Math.round(f.costo)) },
              { key: 'gasolina', header: 'Gasolina', align: 'right', render: (f) => money(Math.round(f.gasolina)) },
              { key: 'tags', header: 'Tags', align: 'right', render: (f) => money(Math.round(f.tags)) },
              { key: 'total', header: 'Total', align: 'right', render: (f) => <strong className="tnum">{money(Math.round(f.total))}</strong> },
              { key: 'alertas', header: 'Alertas', nowrap: true, render: (f) => (
                  f.alertas.length ? <Badge color="var(--critical)">{f.alertas.join(', ')}</Badge> : null) },
            ]}
            filas={filas}
          />
        )}
      </Card>
    </div>
  );
}
