import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fechaCorta, CRITICIDAD } from '../lib/format';
import {
  Card, Tabla, Input, Select, Textarea, Cargando, Aviso, Badge, Stat, FiltroChips,
  Boton, Modal, Campo,
} from '../components/ui';

const FORM_VACIO = {
  sucursal_id: '', categoria_id: '', nombre: '', codigo: '', ubicacion: '',
  tipo: '', marca: '', modelo: '', serie: '', capacidad: '', criticidad: 'B', notas: '',
};

export default function Activos() {
  const navigate = useNavigate();
  const { perfil, esAdmin, puedeGestionar } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [fSuc, setFSuc] = useState('');
  const [fCat, setFCat] = useState('');
  const [vista, setVista] = useState('catalogo'); // catalogo | pendientes

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    const [a, s, c, cambios, perfiles] = await Promise.all([
      supabase.from('activos')
        .select('id, sucursal_id, categoria_id, codigo, nombre, ubicacion, tipo, marca, modelo, serie, capacidad, criticidad, ultimo_servicio, fecha_instalacion, atributos, notas, activo')
        .order('codigo'),
      supabase.from('sucursales').select('id, codigo, nombre, activa').order('codigo'),
      supabase.from('categorias').select('id, nombre').order('orden'),
      supabase.from('activos_cambios')
        .select('id, activo_id, tipo, datos, estatus, solicitado_por, solicitado_en, resuelto_por, resuelto_en')
        .order('solicitado_en', { ascending: false }),
      supabase.from('perfiles').select('id, nombre'),
    ]);
    const err = a.error || s.error || c.error || cambios.error || perfiles.error;
    if (err) { setError(err.message); return; }
    setD({ activos: a.data, sucursales: s.data, categorias: c.data, cambios: cambios.data, perfiles: perfiles.data });
  }
  useEffect(() => { cargar(); }, []);

  const sucById = useMemo(() => Object.fromEntries((d?.sucursales ?? []).map((s) => [s.id, s])), [d]);
  const catById = useMemo(() => Object.fromEntries((d?.categorias ?? []).map((c) => [c.id, c])), [d]);
  const activoById = useMemo(() => Object.fromEntries((d?.activos ?? []).map((a) => [a.id, a])), [d]);
  const perfilById = useMemo(() => Object.fromEntries((d?.perfiles ?? []).map((p) => [p.id, p])), [d]);

  const pendientes = useMemo(() => (d?.cambios ?? []).filter((c) => c.estatus === 'pendiente'), [d]);

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

  function abrirNuevo() {
    setForm(FORM_VACIO);
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.sucursal_id) return setFormError('Selecciona la sucursal.');
    if (!form.nombre.trim()) return setFormError('Escribe el nombre del equipo.');

    const datos = {
      sucursal_id: Number(form.sucursal_id),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim() || null,
      ubicacion: form.ubicacion.trim() || null,
      tipo: form.tipo.trim() || null,
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      serie: form.serie.trim() || null,
      capacidad: form.capacidad.trim() || null,
      criticidad: form.criticidad,
      notas: form.notas.trim() || null,
    };

    setGuardando(true);
    const { error: err } = esAdmin
      ? await supabase.from('activos').insert(datos)
      : await supabase.from('activos_cambios').insert({ tipo: 'alta', datos, solicitado_por: perfil.id });
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  async function resolverCambio(cambio, aprobar) {
    if (!aprobar) {
      const motivo = prompt('¿Por qué se rechaza esta alta? (opcional)') ?? '';
      await supabase.from('activos_cambios')
        .update({ estatus: 'rechazado', resuelto_por: perfil.id, resuelto_en: new Date().toISOString(), nota_resolucion: motivo || null })
        .eq('id', cambio.id);
      cargar();
      return;
    }
    const { data: nuevo, error: err } = await supabase.from('activos').insert(cambio.datos).select('id').maybeSingle();
    if (err) { alert(err.message); return; }
    await supabase.from('activos_cambios')
      .update({ estatus: 'aprobado', activo_id: nuevo.id, resuelto_por: perfil.id, resuelto_en: new Date().toISOString() })
      .eq('id', cambio.id);
    cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los activos: {error}</Aviso>;
  if (!d) return <Cargando />;

  const criticos = d.activos.filter((a) => a.criticidad === 'A').length;
  const sinSerie = d.activos.filter((a) => !a.serie).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Catálogo de activos</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {filtrados.length} de {d.activos.length} equipos
          </p>
        </div>
        {puedeGestionar && <Boton onClick={abrirNuevo}>+ Nuevo activo</Boton>}
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

      <div className="flex gap-1 rounded-lg border p-1"
           style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', width: 'fit-content' }}>
        {[['catalogo', 'Catálogo'], ['pendientes', `Cambios pendientes${pendientes.length ? ` (${pendientes.length})` : ''}`]].map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)}
                  className="rounded-md px-3 py-1.5 text-sm"
                  style={{
                    background: vista === k ? 'var(--plane)' : 'transparent',
                    color: vista === k ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: vista === k ? 500 : 400,
                  }}>
            {l}
          </button>
        ))}
      </div>

      {vista === 'catalogo' ? (
        <Card>
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Buscar equipo, marca, modelo, serie…" value={busca}
                     onChange={(e) => setBusca(e.target.value)} className="w-full min-w-[200px] sm:!w-auto sm:flex-1" />
              <Select value={fSuc} onChange={(e) => setFSuc(e.target.value)} className="!w-auto">
                <option value="">Todas las sucursales</option>
                {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </Select>
            </div>
            <FiltroChips opciones={opcionesCategoria} valor={fCat} onChange={setFCat} todasLabel="Todas las categorías" />
          </div>

          <Tabla
            onRowClick={(a) => navigate(`/mantenimiento/activos/${a.id}`)}
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
      ) : (
        <Card subtitle="Altas y modificaciones propuestas por usuarios, esperando revisión del administrador.">
          <Tabla
            vacio="Sin cambios pendientes."
            columnas={[
              { key: 'solicitado_en', header: 'Solicitado', nowrap: true,
                render: (c) => fechaCorta(c.solicitado_en?.slice(0, 10)) },
              { key: 'tipo', header: 'Tipo', nowrap: true, render: (c) => c.tipo === 'alta' ? 'Alta' : 'Modificación' },
              { key: 'activo', header: 'Equipo', render: (c) => c.tipo === 'alta'
                  ? c.datos.nombre
                  : (activoById[c.activo_id]?.nombre ?? c.datos.nombre ?? '—') },
              { key: 'sucursal', header: 'Sucursal', nowrap: true, render: (c) =>
                  sucById[c.datos.sucursal_id ?? activoById[c.activo_id]?.sucursal_id]?.codigo ?? '—' },
              { key: 'solicitado_por', header: 'Solicitó', render: (c) => perfilById[c.solicitado_por]?.nombre ?? '—' },
              { key: 'estatus', header: 'Estatus', nowrap: true, render: (c) => (
                  <Badge color={c.estatus === 'aprobado' ? 'var(--good)' : c.estatus === 'rechazado' ? 'var(--critical)' : 'var(--series-3)'}>
                    {c.estatus}
                  </Badge>) },
              ...(esAdmin ? [{ key: 'accion', header: '', nowrap: true, render: (c) => c.estatus === 'pendiente' && (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => resolverCambio(c, true)} className="rounded-lg px-2.5 py-1 text-xs font-medium"
                            style={{ background: 'var(--series-1)', color: '#fff' }}>Aprobar</button>
                    <button onClick={() => resolverCambio(c, false)} className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                            style={{ borderColor: 'var(--border)', color: 'var(--critical)' }}>Rechazar</button>
                  </div>) }] : []),
            ]}
            filas={d.cambios}
          />
        </Card>
      )}

      {/* ---------------- Nuevo activo ---------------- */}
      <Modal abierto={modal} onClose={() => setModal(false)}
             titulo={esAdmin ? 'Nuevo activo' : 'Proponer alta de activo'}>
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Sucursal" required>
              <Select value={form.sucursal_id} required
                      onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}>
                <option value="">Selecciona…</option>
                {d.sucursales.filter((s) => s.activa).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>))}
              </Select>
            </Campo>
            <Campo label="Categoría">
              <Select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">Sin categoría</option>
                {d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Nombre" required>
              <Input value={form.nombre} required onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Campo>
            <Campo label="Código">
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Ubicación">
            <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Marca">
              <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            </Campo>
            <Campo label="Modelo">
              <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Número de serie">
              <Input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} />
            </Campo>
            <Campo label="Capacidad">
              <Input value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Criticidad">
            <Select value={form.criticidad} onChange={(e) => setForm({ ...form, criticidad: e.target.value })}>
              {Object.entries(CRITICIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Campo>
          <Campo label="Notas">
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : esAdmin ? 'Crear' : 'Enviar para aprobación'}
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
