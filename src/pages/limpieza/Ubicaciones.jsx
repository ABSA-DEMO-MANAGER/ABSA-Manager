import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLimpiezaPerfil } from '../../lib/useLimpiezaPerfil';
import {
  Card, Tabla, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Input,
} from '../../components/ui';

const TIPOS = { sucursal: 'Sucursal', almacen_central: 'Almacén central', otro: 'Otro' };

const FORM_VACIO = {
  nombre: '', tipo: 'sucursal', sucursal_id: '', direccion: '',
  responsable_nombre: '', responsable_telefono: '', activa: true,
};

export default function Ubicaciones() {
  const { esLimpiezaAdmin } = useLimpiezaPerfil();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    const [u, s] = await Promise.all([
      supabase.from('limpieza_ubicaciones')
        .select('id, nombre, tipo, sucursal_id, direccion, responsable_nombre, responsable_telefono, activa')
        .order('nombre'),
      supabase.from('sucursales').select('id, codigo, nombre').order('codigo'),
    ]);
    const err = u.error || s.error;
    if (err) { setError(err.message); return; }
    setD({ ubicaciones: u.data, sucursales: s.data });
  }
  useEffect(() => { cargar(); }, []);

  function abrirNueva() {
    setEditando(null); setForm(FORM_VACIO); setFormError(null); setModal(true);
  }
  function abrirEditar(u) {
    setEditando(u);
    setForm({
      nombre: u.nombre, tipo: u.tipo, sucursal_id: u.sucursal_id ? String(u.sucursal_id) : '',
      direccion: u.direccion ?? '', responsable_nombre: u.responsable_nombre ?? '',
      responsable_telefono: u.responsable_telefono ?? '', activa: u.activa,
    });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.nombre.trim()) return setFormError('Escribe un nombre.');

    setGuardando(true);
    const payload = {
      nombre: form.nombre.trim(), tipo: form.tipo,
      sucursal_id: form.sucursal_id ? Number(form.sucursal_id) : null,
      direccion: form.direccion.trim() || null,
      responsable_nombre: form.responsable_nombre.trim() || null,
      responsable_telefono: form.responsable_telefono.trim() || null,
      activa: form.activa,
    };
    const { error: err } = editando
      ? await supabase.from('limpieza_ubicaciones').update(payload).eq('id', editando.id)
      : await supabase.from('limpieza_ubicaciones').insert(payload);
    setGuardando(false);
    if (err) return setFormError(err.message);
    setModal(false); cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar las ubicaciones: {error}</Aviso>;
  if (!d) return <Cargando />;

  const sucById = Object.fromEntries(d.sucursales.map((s) => [s.id, s]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ubicaciones</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Sucursales, bodegas y almacenes donde se guardan insumos de limpieza.
          </p>
        </div>
        {esLimpiezaAdmin && <Boton onClick={abrirNueva}>+ Nueva ubicación</Boton>}
      </div>

      <Card>
        <Tabla
          onRowClick={esLimpiezaAdmin ? abrirEditar : undefined}
          vacio="Sin ubicaciones registradas."
          columnas={[
            { key: 'nombre', header: 'Nombre', render: (u) => (
                <div>
                  <div className="font-medium">{u.nombre}</div>
                  {u.direccion && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.direccion}</div>}
                </div>) },
            { key: 'tipo', header: 'Tipo', nowrap: true, render: (u) => TIPOS[u.tipo] },
            { key: 'sucursal', header: 'Sucursal vinculada', nowrap: true, render: (u) => sucById[u.sucursal_id]?.nombre ?? '—' },
            { key: 'responsable', header: 'Responsable', render: (u) => u.responsable_nombre || '—' },
            { key: 'activa', header: '', nowrap: true, render: (u) => u.activa ? null : <Badge color="var(--text-muted)">cerrada</Badge> },
          ]}
          filas={d.ubicaciones}
        />
      </Card>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo={editando ? 'Editar ubicación' : 'Nueva ubicación'}>
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Nombre" required>
            <Input value={form.nombre} required onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Tipo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
            <Campo label="Sucursal vinculada" hint="Opcional">
              <Select value={form.sucursal_id} onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}>
                <option value="">Ninguna</option>
                {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </Select>
            </Campo>
          </div>
          <Campo label="Dirección">
            <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Responsable">
              <Input value={form.responsable_nombre} onChange={(e) => setForm({ ...form, responsable_nombre: e.target.value })} />
            </Campo>
            <Campo label="Teléfono">
              <Input value={form.responsable_telefono} onChange={(e) => setForm({ ...form, responsable_telefono: e.target.value })} />
            </Campo>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
              Ubicación activa
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
