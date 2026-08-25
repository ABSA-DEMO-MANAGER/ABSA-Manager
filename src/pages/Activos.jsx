import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fechaCorta, CRITICIDAD } from '../lib/format';
import { Card, Tabla, Input, Select, Cargando, Aviso, Badge, Stat, FiltroChips } from '../components/ui';

export default function Activos() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [fSuc, setFSuc] = useState('');
  const [fCat, setFCat] = useState('');

  useEffect(() => {
    (async () => {
      const [a, s, c] = await Promise.all([
        supabase.from('activos')
          .select('id, sucursal_id, categoria_id, codigo, nombre, ubicacion, tipo, marca, modelo, serie, capacidad, criticidad, ultimo_servicio, fecha_instalacion, atributos, notas, activo')
          .order('codigo'),
        supabase.from('sucursales').select('id, codigo, nombre').order('codigo'),
        supabase.from('categorias').select('id, nombre').order('orden'),
      ]);
      const err = a.error || s.error || c.error;
      if (err) { setError(err.message); return; }
      setD({ activos: a.data, sucursales: s.data, categorias: c.data });
    })();
  }, []);

  const sucById = useMemo(() => Object.fromEntries((d?.sucursales ?? []).map((s) => [s.id, s])), [d]);
  const catById = useMemo(() => Object.fromEntries((d?.categorias ?? []).map((c) => [c.id, c])), [d]);

  const coinciden = (a, q) =>
    !q || [a.nombre, a.codigo, a.marca, a.modelo, a.ubicacion, a.serie]
      .some((v) => v?.toLowerCase().includes(q));

  const opcionesCategoria = useMemo(() => {
    if (!d) return [];
    const q = busca.trim().toLowerCase();
    const base = d.activos.filter((a) => (!fSuc || String(a.sucursal_id) === fSuc) && coinciden(a, q));
    return d.categorias.map((c) => ({
      value: String(c.id), label: c.nombre,
      count: base.filter((a) => a.categoria_id === c.id).length,
    }));
  }, [d, busca, fSuc]);

  const filtrados = useMemo(() => {
    if (!d) return [];
    const q = busca.trim().toLowerCase();
    return d.activos.filter((a) =>
      (!fSuc || String(a.sucursal_id) === fSuc) &&
      (!fCat || String(a.categoria_id) === fCat) &&
      coinciden(a, q));
  }, [d, busca, fSuc, fCat]);

  if (error) return <Aviso tono="critical">No se pudieron cargar los activos: {error}</Aviso>;
  if (!d) return <Cargando />;

  const criticos = d.activos.filter((a) => a.criticidad === 'A').length;
  const sinSerie = d.activos.filter((a) => !a.serie).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Catálogo de activos</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {filtrados.length} de {d.activos.length} equipos
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Equipos registrados" value={d.activos.length} />
        <Stat label="Criticidad A" value={criticos} hint="Falla detiene la operación" tone={criticos ? 'warning' : undefined} />
        <Stat label="Sin número de serie" value={sinSerie}
              hint="Dato faltante para garantías" tone={sinSerie ? 'warning' : 'good'} />
        <Stat label="Sucursales cubiertas"
              value={new Set(d.activos.map((a) => a.sucursal_id)).size}
              hint={`de ${d.sucursales.length}`} />
      </div>

      {new Set(d.activos.map((a) => a.sucursal_id)).size < d.sucursales.length - 1 && (
        <Aviso tono="warning">
          Solo {new Set(d.activos.map((a) => a.sucursal_id)).size} sucursales tienen equipos
          registrados. Levantar el inventario de las demás es el paso que más valor te va a dar:
          sin activos no hay plan preventivo real.
        </Aviso>
      )}

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar equipo, marca, modelo, serie…" value={busca}
                   onChange={(e) => setBusca(e.target.value)} className="!w-auto min-w-[200px] flex-1" />
            <Select value={fSuc} onChange={(e) => setFSuc(e.target.value)} className="!w-auto">
              <option value="">Todas las sucursales</option>
              {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </div>
          <FiltroChips opciones={opcionesCategoria} valor={fCat} onChange={setFCat} todasLabel="Todas las categorías" />
        </div>

        <Tabla
          onRowClick={(a) => navigate(`/activos/${a.id}`)}
          vacio="Ningún equipo coincide con el filtro."
          columnas={[
            { key: 'codigo', header: 'Código', nowrap: true, render: (a) => a.codigo ?? '—' },
            { key: 'nombre', header: 'Equipo', render: (a) => (
                <div>
                  <div>{a.nombre}</div>
                  {a.ubicacion && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.ubicacion}</div>)}
                </div>) },
            { key: 'sucursal_id', header: 'Sucursal', nowrap: true,
              render: (a) => sucById[a.sucursal_id]?.codigo ?? '—' },
            { key: 'categoria_id', header: 'Categoría', nowrap: true,
              render: (a) => catById[a.categoria_id]?.nombre ?? '—' },
            { key: 'marca', header: 'Marca / modelo', render: (a) =>
                [a.marca, a.modelo].filter(Boolean).join(' · ') || '—' },
            { key: 'capacidad', header: 'Capacidad', nowrap: true, render: (a) => a.capacidad ?? '—' },
            { key: 'criticidad', header: 'Criticidad', nowrap: true,
              render: (a) => <Badge color={CRITICIDAD[a.criticidad]?.color}>{a.criticidad}</Badge> },
            { key: 'ultimo_servicio', header: 'Último servicio', nowrap: true,
              render: (a) => fechaCorta(a.ultimo_servicio) },
          ]}
          filas={filtrados}
        />
      </Card>
    </div>
  );
}
