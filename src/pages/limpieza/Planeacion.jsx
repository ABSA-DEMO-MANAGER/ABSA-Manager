import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { money } from '../../lib/format';
import { Card, Tabla, Select, Cargando, Aviso, Badge, Stat, Input, Campo } from '../../components/ui';

const DIAS_HISTORIAL = 30;

export default function Planeacion() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [fSucursal, setFSucursal] = useState('');
  const [diasObjetivo, setDiasObjetivo] = useState('30');

  async function cargar() {
    const desde = new Date(Date.now() - DIAS_HISTORIAL * 86400000).toISOString().slice(0, 10);
    const [suc, i, s, p, mov] = await Promise.all([
      supabase.from('sucursales').select('id, codigo, nombre').eq('activa', true).order('codigo'),
      supabase.from('limpieza_insumos').select('id, nombre, marca, categoria, unidad_medida, costo_referencia, proveedor_id, stock_minimo_default').eq('activo', true).order('nombre'),
      supabase.from('limpieza_stock').select('sucursal_id, insumo_id, cantidad_actual, stock_minimo'),
      supabase.from('proveedores').select('id, nombre'),
      supabase.from('limpieza_movimientos').select('sucursal_id, insumo_id, cantidad').eq('tipo', 'salida').gte('fecha', desde),
    ]);
    const err = suc.error || i.error || s.error || p.error || mov.error;
    if (err) { setError(err.message); return; }
    setD({ sucursales: suc.data, insumos: i.data, stock: s.data, proveedores: p.data, movimientos: mov.data });
  }
  useEffect(() => { cargar(); }, []);

  const filas = useMemo(() => {
    if (!d) return [];
    const insumoById = Object.fromEntries(d.insumos.map((i) => [i.id, i]));
    const sucursalById = Object.fromEntries(d.sucursales.map((s) => [s.id, s]));
    const provById = Object.fromEntries(d.proveedores.map((p) => [p.id, p]));

    const consumo = {}; // `${sucursal}|${insumo}` -> total salidas en el periodo
    d.movimientos.forEach((m) => {
      const k = `${m.sucursal_id}|${m.insumo_id}`;
      consumo[k] = (consumo[k] || 0) + Number(m.cantidad);
    });

    const claves = new Set([
      ...d.stock.map((s) => `${s.sucursal_id}|${s.insumo_id}`),
      ...Object.keys(consumo),
    ]);

    const stockByKey = Object.fromEntries(d.stock.map((s) => [`${s.sucursal_id}|${s.insumo_id}`, s]));
    const objetivo = Number(diasObjetivo) || 30;

    return [...claves].map((k) => {
      const [sucursal_id, insumo_id] = k.split('|').map(Number);
      const insumo = insumoById[insumo_id];
      const sucursal = sucursalById[sucursal_id];
      if (!insumo || !sucursal) return null;
      const stockRow = stockByKey[k];
      const existencia = Number(stockRow?.cantidad_actual ?? 0);
      const minimo = Number(stockRow?.stock_minimo ?? insumo.stock_minimo_default ?? 0);
      const totalConsumo = consumo[k] || 0;
      const consumoDiario = totalConsumo / DIAS_HISTORIAL;
      const cobertura = consumoDiario > 0 ? existencia / consumoDiario : (existencia > 0 ? Infinity : 0);
      const sugerido = Math.max(0, Math.round((consumoDiario * objetivo - existencia) * 100) / 100);
      return {
        key: k, insumo, sucursal, existencia, minimo, consumoDiario, cobertura, sugerido,
        proveedor: provById[insumo.proveedor_id]?.nombre ?? '—',
        costoSugerido: insumo.costo_referencia ? sugerido * Number(insumo.costo_referencia) : null,
        urgente: existencia <= minimo || cobertura < 7,
      };
    }).filter(Boolean)
      .filter((f) => !fSucursal || String(f.sucursal.id) === fSucursal)
      .sort((a, b) => a.cobertura - b.cobertura);
  }, [d, fSucursal, diasObjetivo]);

  const urgentes = filas.filter((f) => f.urgente).length;
  const totalSugerido = filas.reduce((a, f) => a + (f.costoSugerido || 0), 0);

  if (error) return <Aviso tono="critical">No se pudo calcular la planeación: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Planeación de compra</h1>
          <p className="mt-0.5 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>
            Con base en el consumo de los últimos {DIAS_HISTORIAL} días, sugiere cuánto comprar para cubrir el periodo que definas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fSucursal} onChange={(e) => setFSucursal(e.target.value)} className="!w-auto">
            <option value="">Todas las sucursales</option>
            {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
          <Campo label="">
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Cubrir</span>
              <Input type="number" min="1" value={diasObjetivo} onChange={(e) => setDiasObjetivo(e.target.value)} className="!w-16 text-center" />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>días</span>
            </div>
          </Campo>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Insumos con actividad" value={filas.length} />
        <Stat label="Urgentes" value={urgentes} tone={urgentes ? 'critical' : 'good'} hint="bajo mínimo o < 7 días de cobertura" />
        <Stat label="Costo sugerido de compra" value={money(Math.round(totalSugerido))} />
      </div>

      <Card>
        {filas.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Sin existencia ni movimientos todavía. Registra inventario y consumo en cada sucursal para ver la planeación.
          </p>
        ) : (
          <Tabla
            columnas={[
              { key: 'sucursal', header: 'Sucursal', nowrap: true, render: (f) => f.sucursal.nombre },
              { key: 'insumo', header: 'Insumo', render: (f) => (
                  <div>
                    <div className="font-medium">{f.insumo.nombre}{f.insumo.marca ? ` (${f.insumo.marca})` : ''}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.proveedor}</div>
                  </div>) },
              { key: 'existencia', header: 'Existencia', align: 'right', render: (f) => `${f.existencia} ${f.insumo.unidad_medida}` },
              { key: 'consumo', header: `Consumo/día (${DIAS_HISTORIAL}d)`, align: 'right', render: (f) => f.consumoDiario ? f.consumoDiario.toFixed(2) : '—' },
              { key: 'cobertura', header: 'Cobertura', align: 'right', render: (f) => (
                  f.cobertura === Infinity ? <span style={{ color: 'var(--text-muted)' }}>sin consumo</span>
                  : <span className="tnum" style={f.cobertura < 7 ? { color: 'var(--critical)', fontWeight: 600 } : undefined}>{Math.round(f.cobertura)} d</span>
                ) },
              { key: 'sugerido', header: 'Sugerido comprar', align: 'right', render: (f) => (
                  f.sugerido > 0 ? <strong className="tnum">{f.sugerido} {f.insumo.unidad_medida}</strong> : <span style={{ color: 'var(--text-muted)' }}>—</span>
                ) },
              { key: 'costo', header: 'Costo est.', align: 'right', render: (f) => f.costoSugerido ? money(f.costoSugerido) : '—' },
              { key: 'urgente', header: '', nowrap: true, render: (f) => f.urgente ? <Badge color="var(--critical)">urgente</Badge> : null },
            ]}
            filas={filas}
          />
        )}
      </Card>
    </div>
  );
}
