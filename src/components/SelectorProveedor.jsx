import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { COBERTURA } from '../lib/format';
import { Select, Modal, Campo, Input, Boton, Aviso } from './ui';

/**
 * Select de proveedor + alta rápida ("+ Nuevo") sin salir del formulario.
 * El padre mantiene la lista de proveedores; onCreado le agrega el nuevo
 * para que aparezca de inmediato sin recargar.
 */
export default function SelectorProveedor({ proveedores, value, onChange, onCreado, required }) {
  const VACIO = { nombre: '', servicio: '', ciudad: '', cobertura: '', telefono: '' };
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function crear(e) {
    e.preventDefault();
    setError(null);
    if (!form.nombre.trim()) return setError('Escribe el nombre del proveedor.');

    setGuardando(true);
    const { data, error: err } = await supabase.from('proveedores')
      .insert({
        nombre: form.nombre.trim(),
        servicio: form.servicio.trim() || null,
        ciudad: form.ciudad.trim() || null,
        cobertura: form.cobertura || null,
        telefono: form.telefono.trim() || null,
      })
      .select('id, nombre').maybeSingle();
    setGuardando(false);
    if (err) return setError(err.message.includes('duplicate') ? 'Ya existe un proveedor con ese nombre.' : err.message);

    setModal(false);
    setForm(VACIO);
    onCreado(data);
    onChange(String(data.id));
  }

  return (
    <>
      <div className="flex gap-2">
        <Select value={value} required={required} onChange={(e) => onChange(e.target.value)} className="flex-1">
          <option value="">{required ? 'Selecciona…' : 'Sin asignar'}</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        <Boton type="button" variant="ghost" onClick={() => setModal(true)}>+ Nuevo</Boton>
      </div>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Nuevo proveedor">
        <form onSubmit={crear} className="space-y-3">
          <Campo label="Nombre" required>
            <Input value={form.nombre} required onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo label="Servicio" hint="Ej. Refrigeración, Eléctrico, Plomería">
            <Input value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Ciudad">
              <Input value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
            </Campo>
            <Campo label="Cobertura">
              <Select value={form.cobertura} onChange={(e) => setForm({ ...form, cobertura: e.target.value })}>
                <option value="">Sin definir</option>
                {Object.entries(COBERTURA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Campo>
          </div>
          <Campo label="Teléfono">
            <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Campo>
          {error && <Aviso tono="critical">{error}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear y usar'}</Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
