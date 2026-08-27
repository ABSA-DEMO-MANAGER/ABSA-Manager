import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fechaCorta, COBERTURA } from '../lib/format';
import {
  Card, Tabla, Input, Select, Cargando, Aviso, Badge, Boton, Modal, Campo, Textarea, FiltroChips,
} from '../components/ui';

const FORM_VACIO = { nombre: '', servicio: '', ciudad: '', cobertura: '', contacto: '', telefono: '', notas: '' };

export default function Proveedores() {
  const { perfil, esAdmin, puedeGestionar } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busca, setBusca] = useState('');
  const [fCobertura, setFCobertura] = useState('');
  const [vista, setVista] = useState('lista'); // lista | pendientes

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null); // proveedor actual si es edicion
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState(null);

  async function cargar() {
    const [p, cambios, perfiles] = await Promise.all([
      supabase.from('proveedores').select('id, nombre, servicio, es_fijo, ciudad, cobertura, contacto, telefono, notas').order('nombre'),
      supabase.from('proveedores_cambios')
        .select('id, proveedor_id, datos, estatus, solicitado_por, solicitado_en, resuelto_por, resuelto_en')
        .order('solicitado_en', { ascending: false }),
      supabase.from('perfiles').select('id, nombre'),
    ]);
    const err = p.error || cambios.error || perfiles.error;
    if (err) { setError(err.message); return; }
    setD({ proveedores: p.data, cambios: cambios.data, perfiles: perfiles.data });
  }
  useEffect(() => { cargar(); }, []);

  const proveedorById = useMemo(() => Object.fromEntries((d?.proveedores ?? []).map((p) => [p.id, p])), [d]);
  const perfilById = useMemo(() => Object.fromEntries((d?.perfiles ?? []).map((p) => [p.id, p])), [d]);
  const pendientes = useMemo(() => (d?.cambios ?? []).filter((c) => c.estatus === 'pendiente'), [d]);

  const coinciden = (p, q) => !q || [p.nombre, p.servicio, p.contacto, p.ciudad].some((v) => v?.toLowerCase().includes(q));

  const opcionesCobertura = useMemo(() => {
    if (!d) return [];
    const q = busca.trim().toLowerCase();
    const base = d.proveedores.filter((p) => coinciden(p, q));
    return Object.entries(COBERTURA).map(([k, label]) => ({
      value: k, label, count: base.filter((p) => p.cobertura === k).length,
    }));
  }, [d, busca]);

  const filtrados = useMemo(() => {
    if (!d) return [];
    const q = busca.trim().toLowerCase();
    return d.proveedores.filter((p) => (!fCobertura || p.cobertura === fCobertura) && coinciden(p, q));
  }, [d, busca, fCobertura]);

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setFormError(null); setModal(true);
  }

  function abrirEditar(p) {
    setEditando(p);
    setForm({
      nombre: p.nombre, servicio: p.servicio ?? '', ciudad: p.ciudad ?? '', cobertura: p.cobertura ?? '',
      contacto: p.contacto ?? '', telefono: p.telefono ?? '', notas: p.notas ?? '',
    });
    setFormError(null); setModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio.');

    const datos = {
      nombre: form.nombre.trim(),
      servicio: form.servicio.trim() || null,
      ciudad: form.ciudad.trim() || null,
      cobertura: form.cobertura || null,
      contacto: form.contacto.trim() || null,
      telefono: form.telefono.trim() || null,
      notas: form.notas.trim() || null,
    };

    setGuardando(true);
    let err;
    if (!editando) {
      // Alta: libre para admin y usuario
      ({ error: err } = await supabase.from('proveedores').insert(datos));
    } else if (esAdmin) {
      ({ error: err } = await supabase.from('proveedores').update(datos).eq('id', editando.id));
    } else {
      ({ error: err } = await supabase.from('proveedores_cambios')
        .insert({ proveedor_id: editando.id, datos, solicitado_por: perfil.id }));
    }
    setGuardando(false);
    if (err) return setFormError(err.message.includes('duplicate') ? 'Ya existe un proveedor con ese nombre.' : err.message);
    setModal(false); cargar();
  }

  async function resolverCambio(cambio, aprobar) {
    if (!aprobar) {
      const motivo = prompt('¿Por qué se rechaza este cambio? (opcional)') ?? '';
      await supabase.from('proveedores_cambios')
        .update({ estatus: 'rechazado', resuelto_por: perfil.id, resuelto_en: new Date().toISOString(), nota_resolucion: motivo || null })
        .eq('id', cambio.id);
      cargar();
      return;
    }
    const { error: err } = await supabase.from('proveedores').update(cambio.datos).eq('id', cambio.proveedor_id);
    if (err) { alert(err.message); return; }
    await supabase.from('proveedores_cambios')
      .update({ estatus: 'aprobado', resuelto_por: perfil.id, resuelto_en: new Date().toISOString() })
      .eq('id', cambio.id);
    cargar();
  }

  if (error) return <Aviso tono="critical">No se pudieron cargar los proveedores: {error}</Aviso>;
  if (!d) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Proveedores</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {d.proveedores.length} registrados
          </p>
        </div>
        {puedeGestionar && <Boton onClick={abrirNuevo}>+ Nuevo proveedor</Boton>}
      </div>

      <div className="flex gap-1 rounded-lg border p-1"
           style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', width: 'fit-content' }}>
        {[['lista', 'Proveedores'], ['pendientes', `Cambios pendientes${pendientes.length ? ` (${pendientes.length})` : ''}`]].map(([k, l]) => (
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

      {vista === 'lista' ? (
        <Card>
          <div className="mb-4 space-y-3">
            <Input placeholder="Buscar proveedor, servicio, contacto o ciudad…" value={busca}
                   onChange={(e) => setBusca(e.target.value)} className="!w-auto min-w-[240px]" />
            <FiltroChips opciones={opcionesCobertura} valor={fCobertura} onChange={setFCobertura} todasLabel="Todas las coberturas" />
          </div>
          <Tabla
            onRowClick={puedeGestionar ? abrirEditar : undefined}
            vacio="Ningún proveedor coincide con el filtro."
            columnas={[
              { key: 'nombre', header: 'Nombre', render: (p) => (
                  <div className="flex items-center gap-2">
                    {p.nombre}
                    {p.es_fijo && <Badge dot={false}>fijo</Badge>}
                  </div>) },
              { key: 'servicio', header: 'Servicio', render: (p) => p.servicio ?? '—' },
              { key: 'ciudad', header: 'Ciudad', nowrap: true, render: (p) => p.ciudad ?? '—' },
              { key: 'cobertura', header: 'Cobertura', nowrap: true,
                render: (p) => p.cobertura ? <Badge dot={false}>{COBERTURA[p.cobertura]}</Badge> : '—' },
              { key: 'contacto', header: 'Contacto', render: (p) => p.contacto ?? '—' },
              { key: 'telefono', header: 'Teléfono', nowrap: true, render: (p) => p.telefono ?? '—' },
            ]}
            filas={filtrados}
          />
        </Card>
      ) : (
        <Card subtitle="Ediciones propuestas por usuarios, esperando revisión del administrador. El alta de un proveedor nuevo no necesita aprobación.">
          <Tabla
            vacio="Sin cambios pendientes."
            columnas={[
              { key: 'solicitado_en', header: 'Solicitado', nowrap: true, render: (c) => fechaCorta(c.solicitado_en?.slice(0, 10)) },
              { key: 'proveedor', header: 'Proveedor', render: (c) => proveedorById[c.proveedor_id]?.nombre ?? '—' },
              { key: 'propuesto', header: 'Nombre propuesto', render: (c) => c.datos.nombre },
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

      <Modal abierto={modal} onClose={() => setModal(false)}
             titulo={!editando ? 'Nuevo proveedor' : esAdmin ? 'Editar proveedor' : 'Proponer cambio de proveedor'}>
        <form onSubmit={guardar} className="space-y-3">
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
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Contacto">
              <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
            </Campo>
            <Campo label="Teléfono">
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Notas">
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Campo>

          {formError && <Aviso tono="critical">{formError}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <Boton type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : !editando || esAdmin ? 'Guardar' : 'Enviar para aprobación'}
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
