import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { money, pct } from '../lib/format';
import { Cargando, Aviso, Badge, Progreso } from '../components/ui';

const ANIO = 2026;

export default function Sucursales() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [verCerradas, setVerCerradas] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, p, g, a] = await Promise.all([
        supabase.from('sucursales').select('id, codigo, nombre, ciudad, activa').order('codigo'),
        supabase.from('presupuestos').select('sucursal_id, monto_aprobado').eq('anio', ANIO),
        supabase.from('gastos').select('sucursal_id, monto, fecha'),
        supabase.from('activos').select('sucursal_id'),
      ]);
      const err = s.error || p.error || g.error || a.error;
      if (err) { setError(err.message); return; }
      setD({ sucursales: s.data, presupuestos: p.data, gastos: g.data, activos: a.data });
    })();
  }, []);

  const tarjetas = useMemo(() => {
    if (!d) return [];
    const pres = Object.fromEntries(d.presupuestos.map((p) => [p.sucursal_id, p]));
    return d.sucursales.map((s) => {
      const gs = d.gastos.filter((g) => g.sucursal_id === s.id && g.fecha?.startsWith(String(ANIO)));
      const ejercido = gs.reduce((a, g) => a + Number(g.monto), 0);
      const presupuesto = Number(pres[s.id]?.monto_aprobado ?? 0);
      return {
        ...s,
        presupuesto,
        ejercido,
        avance: presupuesto > 0 ? (ejercido / presupuesto) * 100 : null,
        activos: d.activos.filter((a) => a.sucursal_id === s.id).length,
      };
    });
  }, [d]);

  if (error) return <Aviso tono="critical">No se pudieron cargar las sucursales: {error}</Aviso>;
  if (!d) return <Cargando />;

  const cerradas = tarjetas.filter((s) => !s.activa);
  const visibles = verCerradas ? tarjetas : tarjetas.filter((s) => s.activa);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sucursales</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Elige una sucursal para ver sus activos, presupuesto y gasto
          </p>
        </div>
        {cerradas.length > 0 && (
          <button onClick={() => setVerCerradas(!verCerradas)} className="text-xs underline"
                  style={{ color: 'var(--text-secondary)' }}>
            {verCerradas ? 'Ocultar cerradas' : `Ver también cerradas (${cerradas.length})`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/sucursales/${s.id}`)}
            className="group flex flex-col gap-3 rounded-xl border p-4 text-left transition hover:shadow-md sm:p-5"
            style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--series-1)', color: '#fff' }}
                  aria-hidden="true"
                >
                  {s.codigo}
                </span>
                <div>
                  <div className="font-medium leading-tight">{s.nombre}</div>
                  {s.ciudad && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.ciudad}</div>
                  )}
                </div>
              </div>
              <span
                className="mt-1.5 shrink-0 text-lg transition group-hover:translate-x-0.5"
                style={{ color: 'var(--text-muted)' }}
                aria-hidden="true"
              >
                ›
              </span>
            </div>

            {!s.activa && <Badge dot={false}>cerrada</Badge>}

            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Activos</span>
              <span className="tnum font-medium">{s.activos}</span>
            </div>

            {s.presupuesto > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {money(s.ejercido)} de {money(s.presupuesto)}
                  </span>
                  <span
                    className="tnum font-medium"
                    style={{ color: s.avance > 100 ? 'var(--critical)' : s.avance > 85 ? 'var(--serious)' : 'var(--text-secondary)' }}
                  >
                    {pct(s.avance, 0)}
                  </span>
                </div>
                <Progreso valor={s.avance} tono={s.avance > 100 ? 'critical' : s.avance > 85 ? 'warning' : undefined} />
              </div>
            ) : s.activa ? (
              <div className="text-xs" style={{ color: 'var(--critical)' }}>Sin presupuesto asignado</div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
