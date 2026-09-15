import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLimpiezaPerfil } from '../../lib/useLimpiezaPerfil';
import { money } from '../../lib/format';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input, Textarea, FiltroChips,
} from '../../components/ui';

const CATEGORIAS_SUGERIDAS = ['Papel', 'Químicos', 'Bolsas', 'Equipo', 'Desechables', 'Otro'];
const UNIDADES = ['pieza', 'litro', 'kg', 'rollo', 'paquete', 'caja', 'garrafón'];

const FORM_VACIO = {
  nombre: '', marca: '', descripcion: '', uso: '', categoria: 'Papel', unidad_medida: 'pieza',
  piezas_por_unidad: '', costo_referencia: '', proveedor_id: '', stock_minimo_default: '0', activo: true,
};

export default function Insumos() {
  const { esLimpiezaAdmin } = useLimpiezaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [fCat, setFCat] = useState('');

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    const [i, p] = await Promise.all([
      supabase.from('limpieza_insumos')
        .select('id, nombre, marca, descripcion, uso, categoria, unidad_medida, piezas_por_unidad, costo_referencia, proveedor_id, stock_minimo_default, activo')
        .order('nombre'),
      supabase.from('proveedores').select('id, nombre').order('nombre'),
    ]);
    const err = i.error || p.error;
    if (err) { setError(err.message); return; }
    setD({ insumos: i.data, proveedores: p.data });
  }
  useEffect(() => { cargar(); }, []);

  const provById = useMemo(() => Object.fromEntries((d?.proveedores ?? []).map((p) => [p.id, p])), [d]);

  const categorias = useMemo(() => {
    if (!d) return [];
    const cuenta = {};
    d.insumos.forEach((i) => { const c = i.categoria || 'Sin categoría'; cuenta[c] = (cuenta[c] || 0) + 1; });
    return Object.entries(cuenta).map(([value, count]) => ({ value, label: value, count }));
  }, [d]);

  const filtrados = useMemo(() => {
    if (!d) return [];
    return d.insumos.filter((i) => !fCat || (i.categoria || 'Sin categoría') === fCat);
  }, [d, fCat]);

  function abrirNuevo() {
    setEditando(null); setForm(FORM_VACIO); setFormError(null); setModal(true);
  }
  function abrirEditar(i) {
    setEditando(i);
    setForm({
      nombre: i.nombre, marca: i.marca ?? '', descripcion: i.descripcion ?? '', uso: i.uso ?? '',
      categoria: i.categoria ?? 'Otro', unidad_medida: i.unidad_medida,
      piezas_por_unidad: i.piezas_por_unidad ?? '',
      costo_referencia: i.costo_referencia ?? '', proveedor_id: i.proveedor_id ? String(i.proveedor_id) : '',
      stock_minimo_default: String(i.stock_minimo_default ?? 0), activo: i.activo,
    });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.nombre.trim()) return setFormError('Escribe un nombre.');

    setGuardando(true);
    const payload = {
      nombre: form.nombre.trim(), marca: form.marca.trim() || null,
      descripcion: form.descripcion.trim() || null, uso: form.uso.trim() || null,
      categoria: form.categoria || null, unidad_medida: form.unidad_medida,
      piezas_por_unidad: form.piezas_por_unidad === '' ? null : Number(form.piezas_por_unidad),
      costo_referencia: form.costo_referencia === '' ? null : Number(form.costo_referencia),
      proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
      stock_minimo_default: Number(form.stock_minimo_default) || 0,
      activo: form.activo,
    };
    const { error: err } = editando
      ? await supabase.from('limpieza_insumos').update(payload).eq('id', editando.id)
      : await supabase.from('limpieza_insumos').insert(payload);
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  if (error) return <Aviso tono="critical">No se pudo cargar el catálogo: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Insumos</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Catálogo compartido por todas las sucursales — {d.insumos.length} registrados.
          </p>
        </div>
        {esLimpiezaAdmin && <Boton onClick={abrirNuevo}>+ Nuevo insumo</Boton>}
      </div>

      {categorias.length > 1 && (
        <FiltroChips opciones={categorias} valor={fCat} onChange={setFCat} todasLabel="Todas las categorías" />
      )}

      <Card>
        <Tabla
          onRowClick={esLimpiezaAdmin ? abrirEditar : undefined}
          vacio="Sin insumos registrados."
          columnas={[
            { key: 'nombre', header: 'Insumo', render: (i) => (
                <div>
                  <div className="font-medium">{i.nombre}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{i.marca || '—'}</div>
                  {!i.activo && <Badge color="var(--text-muted)">inactivo</Badge>}
                </div>) },
            { key: 'categoria', header: 'Categoría', nowrap: true, render: (i) => i.categoria || '—' },
            { key: 'unidad', header: 'Unidad', nowrap: true, render: (i) => i.unidad_medida },
            { key: 'piezas', header: 'Piezas/unidad', align: 'right', render: (i) => i.piezas_por_unidad ?? '—' },
            { key: 'precio', header: 'Precio', align: 'right', render: (i) => i.costo_referencia ? money(i.costo_referencia) : '—' },
            { key: 'minimo', header: 'Mínimo sugerido', align: 'right', render: (i) => i.stock_minimo_default },
            { key: 'proveedor', header: 'Proveedor', render: (i) => provById[i.proveedor_id]?.nombre ?? '—' },
          ]}
          filas={filtrados}
        />
      </Card>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo={editando ? 'Editar insumo' : 'Nuevo insumo'} ancho="max-w-2xl">
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Nombre" required hint="Ej. Papel higiénico jumbo, Cloro, Bolsa negra 90x120">
              <Input value={form.nombre} required onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Campo>
            <Campo label="Marca">
              <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Descripción" hint="Presentación, medidas, características">
            <Textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Campo>
          <Campo label="Uso" hint="Para qué se usa — ayuda a que todas las sucursales lo identifiquen igual">
            <Textarea rows={2} value={form.uso} onChange={(e) => setForm({ ...form, uso: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo label="Categoría">
              <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Campo>
            <Campo label="Unidad de medida">
              <Select value={form.unidad_medida} onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Campo>
            <Campo label="Piezas por unidad" hint="Ej. 12">
              <Input type="number" min="0" step="1" value={form.piezas_por_unidad} onChange={(e) => setForm({ ...form, piezas_por_unidad: e.target.value })} />
            </Campo>
            <Campo label="Precio (MXN)">
              <Input type="number" min="0" step="0.01" value={form.costo_referencia} onChange={(e) => setForm({ ...form, costo_referencia: e.target.value })} />
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Stock mínimo sugerido" hint="Por sucursal, editable ahí también">
              <Input type="number" min="0" step="0.01" value={form.stock_minimo_default} onChange={(e) => setForm({ ...form, stock_minimo_default: e.target.value })} />
            </Campo>
            <Campo label="Proveedor" hint="Opcional">
              <Select value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}>
                <option value="">Sin definir</option>
                {d.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Select>
            </Campo>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Insumo activo (aparece al registrar movimientos)
            </label>
          )}
          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
